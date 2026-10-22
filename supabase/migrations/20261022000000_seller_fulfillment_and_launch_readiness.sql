-- BelGlow is a seller-fulfilled marketplace. Sellers own listing accuracy,
-- preparation, delivery, tracking, and return handling; BelGlow hosts and
-- administers the marketplace and records its service fee on product sales.

alter table public.seller_stores
  add column if not exists legal_owner_name text,
  add column if not exists business_address text,
  add column if not exists delivery_areas text,
  add column if not exists delivery_instructions text,
  add column if not exists seller_terms_accepted_at timestamptz;

grant insert (legal_owner_name, business_address, delivery_areas, seller_terms_accepted_at)
  on public.seller_stores to authenticated;

alter table public.shipments
  add column if not exists seller_store_id uuid references public.seller_stores(id) on delete set null;

create unique index if not exists shipments_order_seller_idx
  on public.shipments(order_id, seller_store_id) where seller_store_id is not null;

create policy "Sellers read own shipment records" on public.shipments
  for select to authenticated using (
    seller_store_id is not null and public.owns_seller_store(seller_store_id)
  );

-- Disable platform-priced delivery. Sellers arrange fulfillment directly with
-- customers and may agree a separate delivery charge outside the product total.
update public.shipping_methods set is_active = false, updated_at = now();
insert into public.shipping_methods (
  name, code, description, price_cents, estimated_days_min, estimated_days_max, is_active, sort_order
) values (
  'Seller-arranged delivery or pickup', 'SELLER-ARRANGED',
  'The seller will contact you to confirm delivery or pickup details and any separate delivery charge.',
  0, null, null, true, 0
) on conflict (code) do update set
  name = excluded.name, description = excluded.description, price_cents = 0,
  estimated_days_min = null, estimated_days_max = null, is_active = true, sort_order = 0, updated_at = now();

create or replace function public.save_seller_fulfillment_profile(
  fulfillment_areas text,
  fulfillment_instructions text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  update public.seller_stores set
    delivery_areas = nullif(left(trim(coalesce(fulfillment_areas, '')), 1000), ''),
    delivery_instructions = nullif(left(trim(coalesce(fulfillment_instructions, '')), 2000), ''),
    updated_at = now()
  where owner_id = auth.uid() and status = 'approved';
  if not found then raise exception 'Approved seller store not found'; end if;
end;
$$;

create or replace function public.seller_save_shipment(
  target_seller_order_id uuid,
  shipment_carrier text,
  shipment_tracking_number text,
  shipment_tracking_url text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  parent_order_id uuid;
  store_id uuid;
  shipment_id uuid;
begin
  select seller_order.order_id, seller_order.seller_store_id into parent_order_id, store_id
  from public.seller_orders seller_order
  join public.seller_stores store on store.id = seller_order.seller_store_id
  where seller_order.id = target_seller_order_id and store.owner_id = auth.uid()
  for update;
  if parent_order_id is null then raise exception 'Seller order not found'; end if;
  if length(trim(coalesce(shipment_carrier, ''))) < 2 then raise exception 'Enter a delivery method or carrier'; end if;

  update public.shipments set
    carrier = left(trim(shipment_carrier), 160),
    tracking_number = nullif(left(trim(coalesce(shipment_tracking_number, '')), 240), ''),
    tracking_url = nullif(left(trim(coalesce(shipment_tracking_url, '')), 1000), ''),
    status = 'shipped', shipped_at = coalesce(shipped_at, now()), updated_at = now(),
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('seller_fulfilled', true)
  where order_id = parent_order_id and seller_store_id = store_id
  returning id into shipment_id;

  if shipment_id is null then
    insert into public.shipments(order_id, seller_store_id, carrier, tracking_number, tracking_url, status, shipped_at, metadata)
    values (parent_order_id, store_id, left(trim(shipment_carrier), 160),
      nullif(left(trim(coalesce(shipment_tracking_number, '')), 240), ''),
      nullif(left(trim(coalesce(shipment_tracking_url, '')), 1000), ''), 'shipped', now(),
      jsonb_build_object('seller_fulfilled', true))
    returning id into shipment_id;
  end if;

  perform public.transition_seller_order(target_seller_order_id, 'shipped');
  return shipment_id;
end;
$$;

revoke execute on function public.save_seller_fulfillment_profile(text, text) from public, anon;
revoke execute on function public.seller_save_shipment(uuid, text, text, text) from public, anon;
grant execute on function public.save_seller_fulfillment_profile(text, text) to authenticated;
grant execute on function public.seller_save_shipment(uuid, text, text, text) to authenticated;

-- Complete the seller-owned fulfillment lifecycle. A parent marketplace order
-- is only delivered once every seller in that order has completed delivery.
create or replace function public.transition_seller_order(target_seller_order_id uuid, next_status public.seller_order_status)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_status public.seller_order_status;
  parent_order_id uuid;
begin
  select seller_order.status, seller_order.order_id into current_status, parent_order_id
  from public.seller_orders seller_order
  join public.seller_stores store on store.id = seller_order.seller_store_id
  where seller_order.id = target_seller_order_id and store.owner_id = auth.uid()
  for update;
  if current_status is null then raise exception 'Seller order not found'; end if;
  if not ((current_status = 'new' and next_status = 'accepted') or
          (current_status = 'accepted' and next_status = 'processing') or
          (current_status = 'processing' and next_status = 'shipped') or
          (current_status = 'shipped' and next_status = 'delivered')) then
    raise exception 'Invalid seller order status transition';
  end if;

  update public.seller_orders set
    status = next_status,
    accepted_at = case when next_status = 'accepted' then now() else accepted_at end,
    shipped_at = case when next_status = 'shipped' then now() else shipped_at end,
    delivered_at = case when next_status = 'delivered' then now() else delivered_at end,
    updated_at = now()
  where id = target_seller_order_id;

  if next_status in ('accepted', 'processing') then
    update public.orders set fulfillment_status = 'processing', status = 'processing', updated_at = now()
    where id = parent_order_id and fulfillment_status = 'unfulfilled';
  elsif next_status = 'shipped' and not exists (
    select 1 from public.seller_orders where order_id = parent_order_id and status not in ('shipped', 'delivered')
  ) then
    update public.orders set fulfillment_status = 'shipped', status = 'processing', updated_at = now()
    where id = parent_order_id;
  elsif next_status = 'delivered' and not exists (
    select 1 from public.seller_orders where order_id = parent_order_id and status <> 'delivered'
  ) then
    update public.orders set fulfillment_status = 'delivered', status = 'completed', updated_at = now()
    where id = parent_order_id;
  end if;
end;
$$;

-- Public request throttling is persisted so it works across server instances.
create table if not exists public.public_api_rate_limits (
  bucket text not null,
  subject_hash text not null,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 1,
  primary key (bucket, subject_hash)
);
alter table public.public_api_rate_limits enable row level security;
revoke all on public.public_api_rate_limits from public, anon, authenticated;

create or replace function public.consume_public_rate_limit(
  rate_bucket text,
  rate_subject_hash text,
  rate_max_requests integer,
  rate_window_seconds integer
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare allowed boolean;
begin
  if length(rate_bucket) not between 1 and 80 or length(rate_subject_hash) not between 16 and 128
    or rate_max_requests not between 1 and 1000 or rate_window_seconds not between 10 and 86400 then
    return false;
  end if;
  insert into public.public_api_rate_limits(bucket, subject_hash, window_started_at, request_count)
  values (left(rate_bucket, 80), left(rate_subject_hash, 128), now(), 1)
  on conflict (bucket, subject_hash) do update set
    window_started_at = case when public.public_api_rate_limits.window_started_at <= now() - make_interval(secs => rate_window_seconds) then now() else public.public_api_rate_limits.window_started_at end,
    request_count = case when public.public_api_rate_limits.window_started_at <= now() - make_interval(secs => rate_window_seconds) then 1 else public.public_api_rate_limits.request_count + 1 end
  returning request_count <= rate_max_requests into allowed;
  return coalesce(allowed, false);
end;
$$;
revoke execute on function public.consume_public_rate_limit(text, text, integer, integer) from public;
grant execute on function public.consume_public_rate_limit(text, text, integer, integer) to anon, authenticated;

-- Provider-neutral email outbox. A later email/SMS worker can deliver these
-- records without changing marketplace order logic.
create table if not exists public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  recipient_email text not null,
  kind text not null,
  subject text not null,
  body text not null,
  order_id uuid references public.orders(id) on delete cascade,
  support_request_id uuid references public.support_requests(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'failed')),
  attempts integer not null default 0,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists notification_outbox_pending_idx on public.notification_outbox(status, created_at);
alter table public.notification_outbox enable row level security;
create policy "admins read notification outbox" on public.notification_outbox for select to authenticated using (public.is_admin());
revoke all on public.notification_outbox from public, anon, authenticated;
grant select on public.notification_outbox to authenticated;
create trigger notification_outbox_updated_at before update on public.notification_outbox
  for each row execute procedure public.set_updated_at();

create or replace function public.queue_order_email()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.notification_outbox(recipient_email, kind, subject, body, order_id)
    values (new.email, 'order_created', 'BelGlow order #' || new.order_number || ' received',
      'Your order was received. Each seller will arrange delivery or pickup and provide fulfillment updates.', new.id);
  elsif old.fulfillment_status is distinct from new.fulfillment_status then
    insert into public.notification_outbox(recipient_email, kind, subject, body, order_id)
    values (new.email, 'order_status', 'BelGlow order #' || new.order_number || ' update',
      'Your order fulfillment status is now ' || replace(new.fulfillment_status::text, '_', ' ') || '.', new.id);
  end if;
  return new;
end;
$$;
create trigger queue_order_email after insert or update of fulfillment_status on public.orders
  for each row execute procedure public.queue_order_email();

create or replace function public.queue_support_email()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notification_outbox(recipient_email, kind, subject, body, support_request_id)
  values (new.requester_email, 'support_received', 'BelGlow support request received',
    'Your support request has been received. Reference BG-' || upper(left(new.id::text, 8)) || '.', new.id);
  return new;
end;
$$;
create trigger queue_support_email after insert on public.support_requests
  for each row execute procedure public.queue_support_email();

-- Secure guest tracking reveals only order status and fulfillment records after
-- matching both the order number and checkout email.
create or replace function public.track_guest_order(lookup_order_number bigint, lookup_email text)
returns jsonb
language sql
security definer
set search_path = ''
stable
as $$
  select jsonb_build_object(
    'orderNumber', purchase.order_number,
    'status', purchase.status,
    'paymentStatus', purchase.payment_status,
    'fulfillmentStatus', purchase.fulfillment_status,
    'totalCents', purchase.total_cents,
    'placedAt', purchase.placed_at,
    'shipments', coalesce((select jsonb_agg(jsonb_build_object(
      'carrier', shipment.carrier, 'trackingNumber', shipment.tracking_number,
      'trackingUrl', shipment.tracking_url, 'status', shipment.status,
      'shippedAt', shipment.shipped_at, 'sellerName', store.name
    ) order by shipment.created_at desc) from public.shipments shipment
      left join public.seller_stores store on store.id = shipment.seller_store_id
      where shipment.order_id = purchase.id), '[]'::jsonb)
  )
  from public.orders purchase
  where purchase.order_number = lookup_order_number and lower(purchase.email) = lower(trim(lookup_email));
$$;
revoke execute on function public.track_guest_order(bigint, text) from public;
grant execute on function public.track_guest_order(bigint, text) to anon, authenticated;

revoke execute on function public.queue_order_email() from public, anon, authenticated;
revoke execute on function public.queue_support_email() from public, anon, authenticated;
