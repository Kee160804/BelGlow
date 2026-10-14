-- Complete the operational marketplace workflows around the existing BelGlow
-- schema. Existing role, product-review, commission, and dashboard behavior is
-- preserved; this migration adds safe mutations and the remaining user data.

alter table public.orders
  add column if not exists checkout_token uuid,
  add column if not exists cancellation_reason text,
  add column if not exists inventory_committed boolean not null default false;

create unique index if not exists orders_checkout_token_idx
  on public.orders(checkout_token) where checkout_token is not null;

insert into public.shipping_methods(name, code, description, price_cents, estimated_days_min, estimated_days_max, is_active, sort_order)
values
  ('Belize City delivery', 'belize-city-delivery', 'Local delivery within Belize City.', 800, 1, 3, true, 0),
  ('Nationwide Belize delivery', 'belize-nationwide', 'Delivery to districts across Belize.', 1500, 2, 7, true, 1),
  ('Store pickup', 'store-pickup', 'Pickup details are confirmed after the order is placed.', 0, 0, 2, true, 2)
on conflict (code) do nothing;

alter table public.seller_stores
  add column if not exists location text,
  add column if not exists brand_story text,
  add column if not exists preparation_days_min integer not null default 1 check (preparation_days_min between 0 and 90),
  add column if not exists preparation_days_max integer not null default 2 check (preparation_days_max between preparation_days_min and 90),
  add column if not exists return_window_days integer not null default 14 check (return_window_days between 0 and 365),
  add column if not exists notification_preferences jsonb not null default '{"new_orders":true,"low_stock":true,"reviews":true}'::jsonb;

alter table public.promotions
  add column if not exists seller_store_id uuid references public.seller_stores(id) on delete cascade;

create index if not exists promotions_seller_store_idx
  on public.promotions(seller_store_id, created_at desc);

create table if not exists public.saved_seller_stores (
  user_id uuid not null references public.profiles(id) on delete cascade,
  seller_store_id uuid not null references public.seller_stores(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, seller_store_id)
);

create table if not exists public.review_replies (
  review_id uuid primary key references public.reviews(id) on delete cascade,
  seller_store_id uuid not null references public.seller_stores(id) on delete cascade,
  body text not null check (length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  href text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_created_idx
  on public.notifications(user_id, created_at desc);

create table if not exists public.order_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  request_type text not null check (request_type in ('cancel', 'refund', 'return')),
  reason text not null check (length(trim(reason)) between 3 and 2000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined', 'completed')),
  admin_note text,
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists order_requests_one_open_type_idx
  on public.order_requests(order_id, request_type) where status = 'pending';

create trigger review_replies_updated_at before update on public.review_replies
  for each row execute procedure public.set_updated_at();
create trigger order_requests_updated_at before update on public.order_requests
  for each row execute procedure public.set_updated_at();

alter table public.saved_seller_stores enable row level security;
alter table public.review_replies enable row level security;
alter table public.notifications enable row level security;
alter table public.order_requests enable row level security;

create policy "Users manage saved stores" on public.saved_seller_stores
  for all to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Review replies are public" on public.review_replies
  for select to anon, authenticated using (
    exists (select 1 from public.reviews review where review.id = review_id and review.is_approved)
  );
create policy "Sellers manage replies for own products" on public.review_replies
  for all to authenticated using (public.owns_seller_store(seller_store_id))
  with check (public.owns_seller_store(seller_store_id));

create policy "Users read own notifications" on public.notifications
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Users update own notifications" on public.notifications
  for update to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Customers read own order requests" on public.order_requests
  for select to authenticated using (user_id = (select auth.uid()) or public.is_admin());
create policy "Customers create own order requests" on public.order_requests
  for insert to authenticated with check (
    user_id = (select auth.uid()) and exists (
      select 1 from public.orders purchase where purchase.id = order_id and purchase.user_id = (select auth.uid())
    )
  );
create policy "Admins manage order requests" on public.order_requests
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "Sellers manage own promotions" on public.promotions
  for all to authenticated using (
    seller_store_id is not null and public.owns_seller_store(seller_store_id)
  ) with check (
    seller_store_id is not null and public.owns_seller_store(seller_store_id)
  );

-- Save customer profile fields without permitting a role change.
create or replace function public.update_customer_profile(profile_name text, profile_phone text, profile_marketing_opt_in boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if length(trim(coalesce(profile_name, ''))) < 2 then raise exception 'Enter your full name'; end if;
  update public.profiles set
    full_name = left(trim(profile_name), 160),
    phone = nullif(left(trim(coalesce(profile_phone, '')), 40), ''),
    marketing_opt_in = coalesce(profile_marketing_opt_in, false),
    updated_at = now()
  where id = auth.uid();
end;
$$;

create or replace function public.save_customer_address(
  target_address_id uuid,
  address_label text,
  address_recipient text,
  address_phone text,
  address_line_1 text,
  address_line_2 text,
  address_city text,
  address_district text,
  address_postal_code text,
  address_delivery_notes text,
  make_default boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  saved_id uuid := coalesce(target_address_id, gen_random_uuid());
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if length(trim(coalesce(address_recipient, ''))) < 2 or length(trim(coalesce(address_line_1, ''))) < 3 or length(trim(coalesce(address_city, ''))) < 2 then
    raise exception 'Recipient, street address, and city are required';
  end if;
  if coalesce(make_default, false) then
    update public.addresses set is_default = false, updated_at = now() where user_id = actor_id and is_default;
  end if;
  insert into public.addresses (
    id, user_id, label, recipient_name, phone, address_line_1, address_line_2,
    city, district, postal_code, delivery_notes, is_default
  ) values (
    saved_id, actor_id, left(coalesce(nullif(trim(address_label), ''), 'Home'), 60),
    left(trim(address_recipient), 160), nullif(left(trim(coalesce(address_phone, '')), 40), ''),
    left(trim(address_line_1), 300), nullif(left(trim(coalesce(address_line_2, '')), 300), ''),
    left(trim(address_city), 120), nullif(left(trim(coalesce(address_district, '')), 120), ''),
    nullif(left(trim(coalesce(address_postal_code, '')), 30), ''),
    nullif(left(trim(coalesce(address_delivery_notes, '')), 1000), ''), coalesce(make_default, false)
  ) on conflict (id) do update set
    label = excluded.label, recipient_name = excluded.recipient_name, phone = excluded.phone,
    address_line_1 = excluded.address_line_1, address_line_2 = excluded.address_line_2,
    city = excluded.city, district = excluded.district, postal_code = excluded.postal_code,
    delivery_notes = excluded.delivery_notes, is_default = excluded.is_default, updated_at = now()
  where public.addresses.user_id = actor_id;
  if not found then raise exception 'Address not found'; end if;
  return saved_id;
end;
$$;

create or replace function public.save_seller_store_profile(
  store_name text, store_description text, store_support_email text, store_support_phone text,
  store_location text, store_brand_story text, prep_min integer, prep_max integer,
  return_days integer, preferences jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if length(trim(coalesce(store_name, ''))) < 2 then raise exception 'Store name is required'; end if;
  if prep_min < 0 or prep_max < prep_min or prep_max > 90 or return_days < 0 or return_days > 365 then
    raise exception 'Invalid fulfillment settings';
  end if;
  update public.seller_stores set
    name = left(trim(store_name), 160), description = nullif(left(trim(coalesce(store_description, '')), 2000), ''),
    support_email = nullif(left(trim(coalesce(store_support_email, '')), 320), ''),
    support_phone = nullif(left(trim(coalesce(store_support_phone, '')), 40), ''),
    location = nullif(left(trim(coalesce(store_location, '')), 240), ''),
    brand_story = nullif(left(trim(coalesce(store_brand_story, '')), 5000), ''),
    preparation_days_min = prep_min, preparation_days_max = prep_max,
    return_window_days = return_days, notification_preferences = coalesce(preferences, '{}'::jsonb),
    updated_at = now()
  where owner_id = auth.uid() and status = 'approved';
  if not found then raise exception 'Approved seller store not found'; end if;
end;
$$;

create or replace function public.save_seller_store_logo(store_logo_url text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if length(trim(coalesce(store_logo_url, ''))) < 8 or length(store_logo_url) > 2000 then
    raise exception 'A valid store logo URL is required';
  end if;
  update public.seller_stores
  set logo_url = trim(store_logo_url), updated_at = now()
  where owner_id = auth.uid() and status = 'approved';
  if not found then raise exception 'Approved seller store not found'; end if;
end;
$$;

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
          (current_status = 'processing' and next_status = 'shipped')) then
    raise exception 'Invalid seller order status transition';
  end if;
  update public.seller_orders set status = next_status,
    accepted_at = case when next_status = 'accepted' then now() else accepted_at end,
    shipped_at = case when next_status = 'shipped' then now() else shipped_at end,
    updated_at = now()
  where id = target_seller_order_id;
  if next_status in ('accepted', 'processing') then
    update public.orders set fulfillment_status = 'processing', status = 'processing', updated_at = now()
    where id = parent_order_id and fulfillment_status = 'unfulfilled';
  elsif next_status = 'shipped' and not exists (
    select 1 from public.seller_orders where order_id = parent_order_id and status not in ('shipped', 'delivered')
  ) then
    update public.orders set fulfillment_status = 'shipped', status = 'processing', updated_at = now() where id = parent_order_id;
    insert into public.notifications(user_id, kind, title, body, href)
    select purchase.user_id, 'order_shipped', 'Your order has shipped', 'BelGlow order #' || purchase.order_number || ' is on its way.', '/account'
    from public.orders purchase where purchase.id = parent_order_id and purchase.user_id is not null;
  end if;
end;
$$;

-- Atomic, server-priced checkout. A checkout token makes retries idempotent.
-- Card data never enters BelGlow; payment providers receive only the created
-- order reference from server-side code.
create or replace function public.create_marketplace_order(
  checkout_items jsonb,
  checkout_email text,
  checkout_phone text,
  checkout_shipping_address jsonb,
  checkout_shipping_code text,
  checkout_note text,
  checkout_promotion_code text,
  checkout_provider text,
  checkout_idempotency_key uuid
)
returns table (created_order_id uuid, created_order_number bigint, created_total_cents bigint, created_payment_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  order_id uuid;
  order_no bigint;
  payment_id uuid;
  existing_order public.orders%rowtype;
  shipping_row public.shipping_methods%rowtype;
  item jsonb;
  variant_row record;
  requested_quantity integer;
  unit_price bigint;
  subtotal bigint := 0;
  total bigint;
  stock_row record;
  promotion_row public.promotions%rowtype;
  eligible_subtotal bigint := 0;
  discount_total bigint := 0;
begin
  if checkout_idempotency_key is null then raise exception 'Checkout token is required'; end if;
  select * into existing_order from public.orders where checkout_token = checkout_idempotency_key;
  if found then
    select payment.id into payment_id from public.payments payment where payment.order_id = existing_order.id order by payment.created_at limit 1;
    return query select existing_order.id, existing_order.order_number, existing_order.total_cents, payment_id;
    return;
  end if;
  if checkout_items is null or jsonb_typeof(checkout_items) <> 'array' or jsonb_array_length(checkout_items) < 1 or jsonb_array_length(checkout_items) > 100 then
    raise exception 'Your cart is empty or too large';
  end if;
  if checkout_email !~* '^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$' then raise exception 'Enter a valid email address'; end if;
  if length(trim(coalesce(checkout_shipping_address->>'recipient_name', ''))) < 2 or
     length(trim(coalesce(checkout_shipping_address->>'address_line_1', ''))) < 3 or
     length(trim(coalesce(checkout_shipping_address->>'city', ''))) < 2 then
    raise exception 'Complete the delivery address';
  end if;
  select * into shipping_row from public.shipping_methods method
  where method.code = checkout_shipping_code and method.is_active for share;
  if not found then raise exception 'Choose a valid delivery option'; end if;
  if nullif(trim(coalesce(checkout_promotion_code, '')), '') is not null then
    select * into promotion_row from public.promotions promotion
    where upper(promotion.code) = upper(trim(checkout_promotion_code)) and promotion.is_active
      and (promotion.starts_at is null or promotion.starts_at <= now())
      and (promotion.ends_at is null or promotion.ends_at > now())
      and (promotion.usage_limit is null or promotion.usage_count < promotion.usage_limit)
    for update;
    if promotion_row.id is null then raise exception 'This promotion code is not active'; end if;
    if actor_id is not null and promotion_row.per_user_limit is not null and
       (select count(*) from public.promotion_redemptions redemption where redemption.promotion_id = promotion_row.id and redemption.user_id = actor_id) >= promotion_row.per_user_limit then
      raise exception 'You have already used this promotion';
    end if;
  end if;

  -- Lock and price each variant from trusted catalog rows.
  for item in select value from jsonb_array_elements(checkout_items)
  loop
    requested_quantity := coalesce((item->>'quantity')::integer, 0);
    if requested_quantity < 1 or requested_quantity > 99 then raise exception 'Invalid product quantity'; end if;
    select variant.id, variant.product_id, variant.sku, variant.name as variant_name,
           product.name as product_name, product.attributes,
           coalesce(variant.price_cents, product.base_price_cents) as price_cents
      into variant_row
    from public.product_variants variant
    join public.products product on product.id = variant.product_id
    where variant.id = (item->>'variant_id')::uuid and variant.is_active and product.status = 'active'
    for share of variant, product;
    if variant_row.id is null then raise exception 'A product in your cart is no longer available'; end if;
    select level.variant_id, level.location_id, level.quantity_on_hand, level.quantity_reserved
      into stock_row from public.inventory_levels level
    where level.variant_id = variant_row.id and level.quantity_on_hand - level.quantity_reserved >= requested_quantity
    order by level.quantity_on_hand - level.quantity_reserved desc limit 1 for update;
    if stock_row.variant_id is null then raise exception 'Not enough stock is available for %', variant_row.product_name; end if;
    unit_price := variant_row.price_cents;
    subtotal := subtotal + unit_price * requested_quantity;
    if promotion_row.id is not null and (promotion_row.seller_store_id is null or promotion_row.seller_store_id = (select seller_store_id from public.products where id = variant_row.product_id)) then
      eligible_subtotal := eligible_subtotal + unit_price * requested_quantity;
    end if;
  end loop;
  if promotion_row.id is not null then
    if eligible_subtotal < promotion_row.minimum_order_cents then raise exception 'This order does not meet the promotion minimum'; end if;
    discount_total := case when promotion_row.discount_type = 'percentage' then round(eligible_subtotal * promotion_row.discount_value / 100.0) else least(eligible_subtotal, promotion_row.discount_value) end;
    if promotion_row.maximum_discount_cents is not null then discount_total := least(discount_total, promotion_row.maximum_discount_cents); end if;
  end if;
  total := subtotal - discount_total + shipping_row.price_cents;

  insert into public.orders (
    user_id, email, phone, status, payment_status, fulfillment_status, currency,
    subtotal_cents, discount_cents, shipping_cents, total_cents, shipping_method_name,
    shipping_address, customer_note, checkout_token
  ) values (
    actor_id, lower(trim(checkout_email)), nullif(left(trim(coalesce(checkout_phone, '')), 40), ''),
    case when lower(coalesce(checkout_provider, 'manual')) in ('manual', 'cash_on_delivery') then 'confirmed' else 'pending' end,
    'pending', 'unfulfilled', 'BZD', subtotal, discount_total, shipping_row.price_cents, total, shipping_row.name,
    checkout_shipping_address, nullif(left(trim(coalesce(checkout_note, '')), 2000), ''), checkout_idempotency_key
  ) returning id, order_number into order_id, order_no;

  for item in select value from jsonb_array_elements(checkout_items)
  loop
    requested_quantity := (item->>'quantity')::integer;
    select variant.id, variant.product_id, variant.sku, variant.name as variant_name,
           product.name as product_name, product.attributes,
           coalesce(variant.price_cents, product.base_price_cents) as price_cents
      into variant_row
    from public.product_variants variant join public.products product on product.id = variant.product_id
    where variant.id = (item->>'variant_id')::uuid;
    select level.variant_id, level.location_id, level.quantity_on_hand, level.quantity_reserved
      into stock_row from public.inventory_levels level
    where level.variant_id = variant_row.id and level.quantity_on_hand - level.quantity_reserved >= requested_quantity
    order by level.quantity_on_hand - level.quantity_reserved desc limit 1 for update;
    if stock_row.variant_id is null then raise exception 'Not enough stock is available for %', variant_row.product_name; end if;
    update public.inventory_levels set quantity_reserved = quantity_reserved + requested_quantity, updated_at = now()
    where variant_id = stock_row.variant_id and location_id = stock_row.location_id;
    insert into public.order_items (
      order_id, product_id, variant_id, sku, product_name, variant_name,
      quantity, unit_price_cents, product_snapshot
    ) values (
      order_id, variant_row.product_id, variant_row.id, variant_row.sku,
      variant_row.product_name, variant_row.variant_name, requested_quantity,
      variant_row.price_cents, jsonb_build_object('attributes', variant_row.attributes)
    );
  end loop;

  perform public.finalize_seller_order_splits(order_id);
  if promotion_row.id is not null then
    insert into public.promotion_redemptions(promotion_id, user_id, order_id, discount_cents)
    values (promotion_row.id, actor_id, order_id, discount_total);
    update public.promotions set usage_count = usage_count + 1, updated_at = now() where id = promotion_row.id;
  end if;
  insert into public.payments (order_id, provider, status, amount_cents, currency)
  values (order_id, left(coalesce(nullif(trim(checkout_provider), ''), 'manual'), 60), 'pending', total, 'BZD')
  returning id into payment_id;
  insert into public.order_status_history(order_id, status, note, changed_by)
  values (order_id, case when lower(coalesce(checkout_provider, 'manual')) in ('manual', 'cash_on_delivery') then 'confirmed' else 'pending' end,
          'Order created at checkout', actor_id);

  if actor_id is not null then
    update public.carts set status = 'converted', updated_at = now()
    where user_id = actor_id and status = 'active';
    insert into public.notifications(user_id, kind, title, body, href)
    values (actor_id, 'order_created', 'Order received', 'Your BelGlow order #' || order_no || ' has been received.', '/account');
  end if;
  insert into public.notifications(user_id, kind, title, body, href)
  select store.owner_id, 'seller_order', 'New order', 'A new order is ready in your seller dashboard.', '/dashboard/orders'
  from public.seller_orders seller_order join public.seller_stores store on store.id = seller_order.seller_store_id
  where seller_order.order_id = order_id;
  return query select order_id, order_no, total, payment_id;
end;
$$;

revoke execute on function public.update_customer_profile(text, text, boolean) from public, anon;
revoke execute on function public.save_customer_address(uuid, text, text, text, text, text, text, text, text, text, boolean) from public, anon;
revoke execute on function public.save_seller_store_profile(text, text, text, text, text, text, integer, integer, integer, jsonb) from public, anon;
revoke execute on function public.save_seller_store_logo(text) from public, anon;
revoke execute on function public.transition_seller_order(uuid, public.seller_order_status) from public, anon;
grant execute on function public.update_customer_profile(text, text, boolean) to authenticated;
grant execute on function public.save_customer_address(uuid, text, text, text, text, text, text, text, text, text, boolean) to authenticated;
grant execute on function public.save_seller_store_profile(text, text, text, text, text, text, integer, integer, integer, jsonb) to authenticated;
grant execute on function public.save_seller_store_logo(text) to authenticated;
grant execute on function public.transition_seller_order(uuid, public.seller_order_status) to authenticated;
revoke execute on function public.create_marketplace_order(jsonb, text, text, jsonb, text, text, text, text, uuid) from public;
grant execute on function public.create_marketplace_order(jsonb, text, text, jsonb, text, text, text, text, uuid) to anon, authenticated;

grant select, insert, delete on public.saved_seller_stores to authenticated;
grant select, insert, update on public.review_replies to authenticated;
grant select, update on public.notifications to authenticated;
grant select, insert, update on public.order_requests to authenticated;

-- Administrator fulfillment, cancellation, refund, and payout operations.
create or replace function public.admin_set_seller_status(target_store_id uuid, next_status public.seller_status, admin_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if next_status not in ('approved', 'suspended', 'rejected') then raise exception 'Invalid seller status'; end if;
  update public.seller_stores set status = next_status,
    rejection_reason = case when next_status in ('suspended', 'rejected') then nullif(left(trim(coalesce(admin_note, '')), 1000), '') else null end,
    approved_by = case when next_status = 'approved' then auth.uid() else approved_by end,
    approved_at = case when next_status = 'approved' then coalesce(approved_at, now()) else approved_at end,
    updated_at = now() where id = target_store_id;
  if not found then raise exception 'Seller store not found'; end if;
end; $$;

create or replace function public.release_order_inventory(target_order_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare item record; level record; remaining integer;
begin
  if exists (select 1 from public.orders where id = target_order_id and inventory_committed) then return; end if;
  for item in select variant_id, quantity from public.order_items where order_id = target_order_id and variant_id is not null loop
    remaining := item.quantity;
    for level in select variant_id, location_id, quantity_reserved from public.inventory_levels where variant_id = item.variant_id and quantity_reserved > 0 order by quantity_reserved desc for update loop
      update public.inventory_levels set quantity_reserved = quantity_reserved - least(remaining, level.quantity_reserved), updated_at = now()
      where variant_id = level.variant_id and location_id = level.location_id;
      remaining := remaining - least(remaining, level.quantity_reserved);
      exit when remaining <= 0;
    end loop;
  end loop;
end; $$;

create or replace function public.commit_order_inventory(target_order_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare item record; level record; remaining integer; take_quantity integer;
begin
  if exists (select 1 from public.orders where id = target_order_id and inventory_committed) then return; end if;
  for item in select variant_id, quantity from public.order_items where order_id = target_order_id and variant_id is not null loop
    remaining := item.quantity;
    for level in select variant_id, location_id, quantity_on_hand, quantity_reserved from public.inventory_levels where variant_id = item.variant_id and quantity_reserved > 0 order by quantity_reserved desc for update loop
      take_quantity := least(remaining, level.quantity_reserved);
      if level.quantity_on_hand < take_quantity then raise exception 'Inventory state is invalid for this order'; end if;
      update public.inventory_levels set quantity_on_hand = quantity_on_hand - take_quantity,
        quantity_reserved = quantity_reserved - take_quantity, updated_at = now()
      where variant_id = level.variant_id and location_id = level.location_id;
      remaining := remaining - take_quantity; exit when remaining <= 0;
    end loop;
    if remaining > 0 then raise exception 'Reserved inventory is missing for this order'; end if;
  end loop;
  update public.orders set inventory_committed = true, updated_at = now() where id = target_order_id;
end; $$;

create or replace function public.restore_order_inventory(target_order_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare item record; target_location uuid;
begin
  if not exists (select 1 from public.orders where id = target_order_id and inventory_committed) then return; end if;
  for item in select variant_id, quantity from public.order_items where order_id = target_order_id and variant_id is not null loop
    select location_id into target_location from public.inventory_levels where variant_id = item.variant_id order by updated_at limit 1 for update;
    if target_location is not null then update public.inventory_levels set quantity_on_hand = quantity_on_hand + item.quantity, updated_at = now() where variant_id = item.variant_id and location_id = target_location; end if;
  end loop;
  update public.orders set inventory_committed = false, updated_at = now() where id = target_order_id;
end; $$;

create or replace function public.admin_resolve_order_request(target_request_id uuid, approve boolean, resolution_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare request_row public.order_requests%rowtype; payment_row public.payments%rowtype; refund_total bigint;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  select * into request_row from public.order_requests where id = target_request_id and status = 'pending' for update;
  if not found then raise exception 'Pending request not found'; end if;
  if approve and request_row.request_type = 'cancel' then
    if exists (select 1 from public.orders where id = request_row.order_id and fulfillment_status in ('shipped','delivered')) then raise exception 'A shipped order cannot be cancelled'; end if;
    select * into payment_row from public.payments where order_id = request_row.order_id and status = 'paid' order by processed_at desc nulls last limit 1;
    if payment_row.id is not null then
      select total_cents into refund_total from public.orders where id = request_row.order_id;
      insert into public.refunds(order_id, payment_id, amount_cents, currency, status, reason)
      values (request_row.order_id, payment_row.id, refund_total, payment_row.currency, 'pending', request_row.reason);
    else
      perform public.release_order_inventory(request_row.order_id);
      update public.orders set status = 'cancelled', fulfillment_status = 'cancelled', cancellation_reason = request_row.reason, updated_at = now() where id = request_row.order_id;
      update public.seller_orders set status = 'cancelled', updated_at = now() where order_id = request_row.order_id and status not in ('shipped','delivered','refunded');
    end if;
  elsif approve and request_row.request_type in ('refund', 'return') then
    select * into payment_row from public.payments where order_id = request_row.order_id and status = 'paid' order by processed_at desc nulls last limit 1;
    if payment_row.id is null then raise exception 'No paid payment exists for this order'; end if;
    select total_cents into refund_total from public.orders where id = request_row.order_id;
    insert into public.refunds(order_id, payment_id, amount_cents, currency, status, reason)
    values (request_row.order_id, payment_row.id, refund_total, payment_row.currency, 'pending', request_row.reason);
  end if;
  update public.order_requests set status = case when approve then 'approved' else 'declined' end,
    admin_note = nullif(left(trim(coalesce(resolution_note, '')), 2000), ''), resolved_by = auth.uid(), resolved_at = now(), updated_at = now()
  where id = target_request_id;
  insert into public.notifications(user_id, kind, title, body, href)
  values (request_row.user_id, 'order_request', case when approve then 'Order request approved' else 'Order request declined' end,
          nullif(left(trim(coalesce(resolution_note, '')), 2000), ''), '/account');
end; $$;

create or replace function public.admin_record_manual_payment(target_order_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  update public.payments set status = 'paid', processed_at = now(), updated_at = now()
  where id = (select id from public.payments where order_id = target_order_id and status in ('pending','authorized') order by created_at desc limit 1);
  if not found then raise exception 'Pending payment not found'; end if;
  update public.orders set payment_status = 'paid', status = 'confirmed', updated_at = now() where id = target_order_id;
  perform public.commit_order_inventory(target_order_id);
  perform public.post_paid_order_to_seller_ledger(target_order_id);
end; $$;

create or replace function public.admin_save_shipment(target_order_id uuid, shipment_carrier text, shipment_tracking_number text, shipment_tracking_url text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  insert into public.shipments(order_id, carrier, tracking_number, tracking_url, status, shipped_at)
  values (target_order_id, nullif(left(trim(shipment_carrier), 120), ''), nullif(left(trim(shipment_tracking_number), 160), ''), nullif(left(trim(shipment_tracking_url), 1000), ''), 'shipped', now());
  update public.orders set fulfillment_status = 'shipped', status = 'processing', updated_at = now() where id = target_order_id;
  update public.seller_orders set status = 'shipped', shipped_at = now(), updated_at = now() where order_id = target_order_id and status not in ('cancelled','refunded');
  insert into public.notifications(user_id, kind, title, body, href)
  select purchase.user_id, 'order_shipped', 'Your order has shipped', 'Tracking is now available for BelGlow order #' || purchase.order_number || '.', '/account'
  from public.orders purchase where purchase.id = target_order_id and purchase.user_id is not null;
end; $$;

revoke execute on function public.admin_set_seller_status(uuid, public.seller_status, text) from public, anon;
revoke execute on function public.release_order_inventory(uuid) from public, anon, authenticated;
revoke execute on function public.commit_order_inventory(uuid) from public, anon, authenticated;
revoke execute on function public.restore_order_inventory(uuid) from public, anon, authenticated;
revoke execute on function public.admin_resolve_order_request(uuid, boolean, text) from public, anon;
revoke execute on function public.admin_record_manual_payment(uuid) from public, anon;
revoke execute on function public.admin_save_shipment(uuid, text, text, text) from public, anon;
grant execute on function public.admin_set_seller_status(uuid, public.seller_status, text) to authenticated;
grant execute on function public.admin_resolve_order_request(uuid, boolean, text) to authenticated;
grant execute on function public.admin_record_manual_payment(uuid) to authenticated;
grant execute on function public.admin_save_shipment(uuid, text, text, text) to authenticated;

create or replace function public.admin_prepare_payouts()
returns integer language plpgsql security definer set search_path = '' as $$
declare store_row record; payout_id uuid; created_count integer := 0; minimum_amount bigint;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  select minimum_payout_cents into minimum_amount from public.marketplace_settings where singleton;
  for store_row in
    select ledger.seller_store_id,
      min(ledger.created_at)::date as period_start, current_date as period_end,
      coalesce((select sum(seller_order.item_subtotal_cents) from public.seller_orders seller_order
        join public.seller_ledger_entries sale on sale.seller_order_id = seller_order.id and sale.entry_type = 'sale' and sale.available_at <= now()
        left join public.seller_payout_orders linked on linked.seller_order_id = seller_order.id
        where seller_order.seller_store_id = ledger.seller_store_id and linked.seller_order_id is null), 0)::bigint as gross,
      coalesce((select sum(seller_order.platform_fee_cents) from public.seller_orders seller_order
        join public.seller_ledger_entries sale on sale.seller_order_id = seller_order.id and sale.entry_type = 'sale' and sale.available_at <= now()
        left join public.seller_payout_orders linked on linked.seller_order_id = seller_order.id
        where seller_order.seller_store_id = ledger.seller_store_id and linked.seller_order_id is null), 0)::bigint as commission,
      sum(ledger.amount_cents)::bigint as balance
    from public.seller_ledger_entries ledger
    where ledger.available_at <= now()
      and not exists (
        select 1 from public.seller_payouts pending
        where pending.seller_store_id = ledger.seller_store_id and pending.status in ('ready', 'processing')
      )
    group by ledger.seller_store_id
    having sum(ledger.amount_cents) >= minimum_amount
  loop
    insert into public.seller_payouts(seller_store_id, status, period_start, period_end, gross_sales_cents, commission_cents, adjustment_cents, provider)
    values (store_row.seller_store_id, 'ready', store_row.period_start, store_row.period_end, store_row.gross, store_row.commission,
      store_row.balance - (store_row.gross - store_row.commission), 'manual') returning id into payout_id;
    insert into public.seller_payout_orders(payout_id, seller_order_id)
    select payout_id, seller_order.id from public.seller_orders seller_order
    join public.seller_ledger_entries ledger on ledger.seller_order_id = seller_order.id and ledger.entry_type = 'sale' and ledger.available_at <= now()
    left join public.seller_payout_orders linked on linked.seller_order_id = seller_order.id
    where seller_order.seller_store_id = store_row.seller_store_id and linked.seller_order_id is null;
    created_count := created_count + 1;
  end loop;
  return created_count;
end; $$;

create or replace function public.admin_mark_payout_paid(target_payout_id uuid, transfer_reference text)
returns void language plpgsql security definer set search_path = '' as $$
declare payout_row public.seller_payouts%rowtype;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  select * into payout_row from public.seller_payouts where id = target_payout_id and status in ('ready','processing') for update;
  if payout_row.id is null then raise exception 'Ready payout not found'; end if;
  if length(trim(coalesce(transfer_reference, ''))) < 3 then raise exception 'Enter the bank or transfer reference'; end if;
  update public.seller_payouts set status = 'paid', provider_reference = left(trim(transfer_reference), 240), initiated_at = coalesce(initiated_at, now()), paid_at = now(), updated_at = now() where id = target_payout_id;
  if not exists (select 1 from public.seller_ledger_entries where payout_id = target_payout_id and entry_type = 'payout') then
    insert into public.seller_ledger_entries(seller_store_id, entry_type, amount_cents, payout_id, description)
    values (payout_row.seller_store_id, 'payout', -payout_row.net_payout_cents, target_payout_id, 'Seller payout ' || left(trim(transfer_reference), 240));
  end if;
  insert into public.notifications(user_id, kind, title, body, href)
  select store.owner_id, 'payout_paid', 'Payout sent', 'BelGlow sent your payout of BZ$' || to_char(payout_row.net_payout_cents / 100.0, 'FM999999990.00') || '.', '/dashboard/payouts'
  from public.seller_stores store where store.id = payout_row.seller_store_id;
end; $$;

revoke execute on function public.admin_prepare_payouts() from public, anon;
revoke execute on function public.admin_mark_payout_paid(uuid, text) from public, anon;
grant execute on function public.admin_prepare_payouts() to authenticated;
grant execute on function public.admin_mark_payout_paid(uuid, text) to authenticated;

create or replace function public.admin_complete_refund(target_refund_id uuid, external_reference text)
returns void language plpgsql security definer set search_path = '' as $$
declare refund_row public.refunds%rowtype; order_total bigint; refunded_total bigint; seller_order record; seller_refund bigint;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  select * into refund_row from public.refunds where id = target_refund_id and status = 'pending' for update;
  if refund_row.id is null then raise exception 'Pending refund not found'; end if;
  if length(trim(coalesce(external_reference, ''))) < 3 then raise exception 'Enter a provider or bank refund reference'; end if;
  update public.refunds set status = 'refunded', provider_reference = left(trim(external_reference), 240), processed_at = now(), updated_at = now() where id = target_refund_id;
  select total_cents into order_total from public.orders where id = refund_row.order_id;
  select coalesce(sum(amount_cents), 0) into refunded_total from public.refunds where order_id = refund_row.order_id and status = 'refunded';
  update public.payments set status = case when refunded_total >= amount_cents then 'refunded' else 'partially_refunded' end, updated_at = now() where id = refund_row.payment_id;
  update public.orders set payment_status = case when refunded_total >= total_cents then 'refunded' else 'partially_refunded' end,
    status = case when refunded_total >= total_cents then 'refunded' else status end,
    fulfillment_status = case when refunded_total >= total_cents then 'returned' else fulfillment_status end, updated_at = now()
  where id = refund_row.order_id;
  for seller_order in select * from public.seller_orders where order_id = refund_row.order_id loop
    seller_refund := least(seller_order.seller_net_cents, round(seller_order.seller_net_cents * refund_row.amount_cents / greatest(order_total, 1)::numeric));
    if seller_refund > 0 then
      insert into public.seller_ledger_entries(seller_store_id, entry_type, amount_cents, seller_order_id, description)
      values (seller_order.seller_store_id, 'refund', -seller_refund, seller_order.id, 'Refund ' || left(trim(external_reference), 240));
    end if;
  end loop;
  if refunded_total >= order_total then
    perform public.restore_order_inventory(refund_row.order_id);
    update public.seller_orders set status = 'refunded', updated_at = now() where order_id = refund_row.order_id;
  end if;
  insert into public.notifications(user_id, kind, title, body, href)
  select purchase.user_id, 'refund_completed', 'Your refund was completed', 'A refund for BelGlow order #' || purchase.order_number || ' has been recorded.', '/account'
  from public.orders purchase where purchase.id = refund_row.order_id and purchase.user_id is not null;
end; $$;

revoke execute on function public.admin_complete_refund(uuid, text) from public, anon;
grant execute on function public.admin_complete_refund(uuid, text) to authenticated;

create or replace function public.notify_marketplace_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare owner_id uuid; product_name text;
begin
  if tg_table_name = 'seller_stores' then
    if old.status is distinct from new.status then
      insert into public.notifications(user_id, kind, title, body, href)
      values (new.owner_id, 'seller_status', 'Seller application ' || new.status::text,
        case when new.status = 'rejected' then new.rejection_reason else 'Your BelGlow seller status is now ' || new.status::text || '.' end, '/seller-application');
    end if;
  elsif tg_table_name = 'products' then
    if old.review_status is distinct from new.review_status then
      select store.owner_id into owner_id from public.seller_stores store where store.id = new.seller_store_id;
      if owner_id is not null then insert into public.notifications(user_id, kind, title, body, href)
        values (owner_id, 'product_review', 'Product ' || new.review_status::text, new.name || ' is now ' || new.review_status::text || '.', '/dashboard/products'); end if;
    end if;
  elsif tg_table_name = 'reviews' then
    select store.owner_id, product.name into owner_id, product_name from public.products product join public.seller_stores store on store.id = product.seller_store_id where product.id = new.product_id;
    if owner_id is not null then insert into public.notifications(user_id, kind, title, body, href)
      values (owner_id, 'review', 'New product review', 'A customer reviewed ' || product_name || '.', '/dashboard/reviews'); end if;
  end if;
  return new;
end; $$;

create trigger seller_status_notification after update of status on public.seller_stores
  for each row execute procedure public.notify_marketplace_change();
create trigger product_review_notification after update of review_status on public.products
  for each row execute procedure public.notify_marketplace_change();
create trigger seller_review_notification after insert on public.reviews
  for each row execute procedure public.notify_marketplace_change();

revoke execute on function public.notify_marketplace_change() from public, anon, authenticated;

create or replace function public.notify_low_stock()
returns trigger language plpgsql security definer set search_path = '' as $$
declare owner_id uuid; product_name text; preferences jsonb;
begin
  if new.quantity_on_hand - new.quantity_reserved <= new.reorder_point and
     (old.quantity_on_hand - old.quantity_reserved > old.reorder_point or old.quantity_on_hand is distinct from new.quantity_on_hand) then
    select store.owner_id, store.notification_preferences, product.name into owner_id, preferences, product_name
    from public.product_variants variant join public.products product on product.id = variant.product_id
    join public.seller_stores store on store.id = product.seller_store_id where variant.id = new.variant_id;
    if owner_id is not null and coalesce((preferences->>'low_stock')::boolean, true) then
      insert into public.notifications(user_id, kind, title, body, href)
      values (owner_id, 'low_stock', 'Low stock alert', product_name || ' has ' || greatest(new.quantity_on_hand - new.quantity_reserved, 0) || ' available.', '/dashboard/inventory');
    end if;
  end if;
  return new;
end; $$;

create trigger inventory_low_stock_notification after update of quantity_on_hand, quantity_reserved on public.inventory_levels
  for each row execute procedure public.notify_low_stock();
revoke execute on function public.notify_low_stock() from public, anon, authenticated;

