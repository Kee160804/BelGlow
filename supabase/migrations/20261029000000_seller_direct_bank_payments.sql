-- Seller-direct bank transfer workflow.
-- Customer funds never pass through BelGlow. Each seller confirms only the
-- transfer for their sub-order; the platform records its commission as a
-- separate receivable from that seller.

update public.marketplace_settings
set default_commission_bps = 1000, updated_at = now()
where singleton;

-- BelGlow currently uses one standard 10% rate for every seller.
update public.seller_stores
set commission_rate_bps = null, updated_at = now()
where commission_rate_bps is not null;

create table public.seller_payment_profiles (
  seller_store_id uuid primary key references public.seller_stores(id) on delete cascade,
  bank_name text not null,
  account_name text not null,
  account_number text not null,
  account_type text,
  instructions text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint seller_payment_profile_lengths check (
    length(trim(bank_name)) between 2 and 120 and
    length(trim(account_name)) between 2 and 160 and
    length(trim(account_number)) between 3 and 100 and
    length(coalesce(account_type, '')) <= 80 and
    length(coalesce(instructions, '')) <= 1000
  )
);

alter table public.seller_payment_profiles enable row level security;
create policy "Sellers read own payment profile" on public.seller_payment_profiles
  for select to authenticated using (public.owns_seller_store(seller_store_id) or public.is_admin());
revoke all on public.seller_payment_profiles from public, anon, authenticated;
grant select on public.seller_payment_profiles to authenticated;
create trigger seller_payment_profiles_updated_at before update on public.seller_payment_profiles
  for each row execute procedure public.set_updated_at();

create or replace function public.save_seller_payment_profile(
  payment_bank_name text,
  payment_account_name text,
  payment_account_number text,
  payment_account_type text default null,
  payment_instructions text default null,
  payment_enabled boolean default true
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  store_id uuid;
begin
  select id into store_id from public.seller_stores
  where owner_id = auth.uid() and status = 'approved';
  if store_id is null then raise exception 'An approved seller store is required'; end if;
  if length(trim(coalesce(payment_bank_name, ''))) < 2 or
     length(trim(coalesce(payment_account_name, ''))) < 2 or
     length(trim(coalesce(payment_account_number, ''))) < 3 then
    raise exception 'Complete the bank name, account name, and account number';
  end if;

  insert into public.seller_payment_profiles(
    seller_store_id, bank_name, account_name, account_number, account_type, instructions, is_active
  ) values (
    store_id, left(trim(payment_bank_name), 120), left(trim(payment_account_name), 160),
    left(trim(payment_account_number), 100), nullif(left(trim(coalesce(payment_account_type, '')), 80), ''),
    nullif(left(trim(coalesce(payment_instructions, '')), 1000), ''), payment_enabled
  )
  on conflict (seller_store_id) do update set
    bank_name = excluded.bank_name,
    account_name = excluded.account_name,
    account_number = excluded.account_number,
    account_type = excluded.account_type,
    instructions = excluded.instructions,
    is_active = excluded.is_active,
    updated_at = now();
end;
$$;
revoke execute on function public.save_seller_payment_profile(text, text, text, text, text, boolean) from public, anon;
grant execute on function public.save_seller_payment_profile(text, text, text, text, text, boolean) to authenticated;

alter table public.seller_orders
  add column customer_payment_cents bigint,
  add column payment_status text not null default 'confirmed'
    check (payment_status in ('awaiting_payment', 'under_review', 'confirmed', 'rejected'));

update public.seller_orders set customer_payment_cents = item_subtotal_cents;
alter table public.seller_orders alter column customer_payment_cents set not null;
alter table public.seller_orders alter column customer_payment_cents set default 0;
alter table public.seller_orders alter column payment_status set default 'awaiting_payment';
alter table public.seller_orders drop constraint if exists seller_order_split_matches;
alter table public.seller_orders add constraint seller_order_direct_split_matches check (
  customer_payment_cents >= 0 and platform_fee_cents >= 0 and seller_net_cents >= 0 and
  platform_fee_cents + seller_net_cents = customer_payment_cents
);

-- Rebuild sub-order totals after checkout and allocate any promotion discount
-- exactly across sellers. The rounding remainder is assigned deterministically.
create or replace function public.finalize_seller_order_splits(target_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.seller_orders (
    order_id, seller_store_id, item_subtotal_cents, customer_payment_cents,
    platform_fee_cents, seller_net_cents, payment_status
  )
  select item.order_id, item.seller_store_id, sum(item.total_cents), sum(item.total_cents),
    round(sum(item.total_cents) * 0.10), sum(item.total_cents) - round(sum(item.total_cents) * 0.10),
    'awaiting_payment'
  from public.order_items item
  where item.order_id = target_order_id and item.seller_store_id is not null
  group by item.order_id, item.seller_store_id
  on conflict (order_id, seller_store_id) do update set
    item_subtotal_cents = excluded.item_subtotal_cents,
    updated_at = now();

  with raw as (
    select seller_order.id,
      floor(purchase.discount_cents::numeric * seller_order.item_subtotal_cents / nullif(purchase.subtotal_cents, 0))::bigint as base_discount,
      (purchase.discount_cents::numeric * seller_order.item_subtotal_cents / nullif(purchase.subtotal_cents, 0)) % 1 as fraction,
      purchase.discount_cents
    from public.seller_orders seller_order
    join public.orders purchase on purchase.id = seller_order.order_id
    where seller_order.order_id = target_order_id
  ), ranked as (
    select raw.*,
      raw.discount_cents - sum(raw.base_discount) over () as remainder,
      row_number() over (order by raw.fraction desc, raw.id) as remainder_rank
    from raw
  ), allocated as (
    select id, base_discount + case when remainder_rank <= remainder then 1 else 0 end as allocated_discount
    from ranked
  )
  update public.seller_orders seller_order set
    customer_payment_cents = greatest(0, seller_order.item_subtotal_cents - allocated.allocated_discount),
    platform_fee_cents = round(greatest(0, seller_order.item_subtotal_cents - allocated.allocated_discount) * 0.10),
    seller_net_cents = greatest(0, seller_order.item_subtotal_cents - allocated.allocated_discount)
      - round(greatest(0, seller_order.item_subtotal_cents - allocated.allocated_discount) * 0.10),
    updated_at = now()
  from allocated where allocated.id = seller_order.id;
end;
$$;
revoke execute on function public.finalize_seller_order_splits(uuid) from public, anon, authenticated;
grant execute on function public.finalize_seller_order_splits(uuid) to service_role;

create table public.seller_payment_submissions (
  id uuid primary key default gen_random_uuid(),
  seller_order_id uuid not null references public.seller_orders(id) on delete restrict,
  receipt_path text not null unique,
  original_filename text not null,
  mime_type text not null,
  file_size_bytes bigint not null check (file_size_bytes between 1 and 5242880),
  customer_reference text,
  status text not null default 'pending' check (status in ('pending', 'verified', 'rejected')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  rejection_reason text,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_submission_review check (
    (status = 'pending' and reviewed_by is null and reviewed_at is null) or
    (status in ('verified', 'rejected') and reviewed_by is not null and reviewed_at is not null)
  )
);
create unique index seller_payment_one_pending_idx on public.seller_payment_submissions(seller_order_id)
  where status = 'pending';
create index seller_payment_submissions_order_idx on public.seller_payment_submissions(seller_order_id, submitted_at desc);
alter table public.seller_payment_submissions enable row level security;
create policy "Sellers read own payment submissions" on public.seller_payment_submissions
  for select to authenticated using (exists (
    select 1 from public.seller_orders seller_order
    where seller_order.id = seller_order_id and public.owns_seller_store(seller_order.seller_store_id)
  ) or public.is_admin());
revoke all on public.seller_payment_submissions from public, anon, authenticated;
grant select on public.seller_payment_submissions to authenticated;
create trigger seller_payment_submissions_updated_at before update on public.seller_payment_submissions
  for each row execute procedure public.set_updated_at();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('payment-receipts', 'payment-receipts', false, 5242880,
  array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Sellers read receipts for their store" on storage.objects
  for select to authenticated using (
    bucket_id = 'payment-receipts' and
    public.owns_seller_store(((storage.foldername(name))[1])::uuid)
  );

create table public.seller_commission_entries (
  id uuid primary key default gen_random_uuid(),
  seller_store_id uuid not null references public.seller_stores(id) on delete restrict,
  seller_order_id uuid references public.seller_orders(id) on delete restrict,
  entry_type text not null check (entry_type in ('sale_commission', 'payment', 'adjustment', 'refund')),
  amount_cents bigint not null check (amount_cents <> 0),
  description text not null,
  external_reference text,
  created_at timestamptz not null default now()
);
create unique index seller_commission_one_charge_per_order_idx
  on public.seller_commission_entries(seller_order_id) where entry_type = 'sale_commission';
create index seller_commission_store_idx on public.seller_commission_entries(seller_store_id, created_at desc);
alter table public.seller_commission_entries enable row level security;
create policy "Sellers read own commission ledger" on public.seller_commission_entries
  for select to authenticated using (public.owns_seller_store(seller_store_id) or public.is_admin());
revoke all on public.seller_commission_entries from public, anon, authenticated;
grant select on public.seller_commission_entries to authenticated;

create or replace function public.get_order_payment_details(lookup_order_number bigint, lookup_email text)
returns jsonb
language sql
security definer
set search_path = ''
stable
as $$
  select jsonb_build_object(
    'orderId', purchase.id,
    'orderNumber', purchase.order_number,
    'email', purchase.email,
    'totalCents', purchase.total_cents,
    'paymentStatus', purchase.payment_status,
    'sellers', coalesce(jsonb_agg(jsonb_build_object(
      'sellerOrderId', seller_order.id,
      'storeName', store.name,
      'amountCents', seller_order.customer_payment_cents,
      'paymentStatus', seller_order.payment_status,
      'bankName', profile.bank_name,
      'accountName', profile.account_name,
      'accountNumber', profile.account_number,
      'accountType', profile.account_type,
      'instructions', profile.instructions,
      'submission', (select jsonb_build_object(
        'id', submission.id, 'status', submission.status,
        'filename', submission.original_filename,
        'submittedAt', submission.submitted_at,
        'rejectionReason', submission.rejection_reason
      ) from public.seller_payment_submissions submission
        where submission.seller_order_id = seller_order.id
        order by submission.submitted_at desc limit 1)
    ) order by store.name), '[]'::jsonb)
  )
  from public.orders purchase
  join public.seller_orders seller_order on seller_order.order_id = purchase.id
  join public.seller_stores store on store.id = seller_order.seller_store_id
  join public.seller_payment_profiles profile on profile.seller_store_id = store.id and profile.is_active
  where purchase.order_number = lookup_order_number
    and lower(purchase.email) = lower(trim(lookup_email))
  group by purchase.id;
$$;
revoke execute on function public.get_order_payment_details(bigint, text) from public;
grant execute on function public.get_order_payment_details(bigint, text) to anon, authenticated;

create or replace function public.verify_seller_payment_submission(
  target_submission_id uuid,
  approve boolean,
  review_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  submission_row public.seller_payment_submissions%rowtype;
  seller_order_row public.seller_orders%rowtype;
  purchase public.orders%rowtype;
  store_name text;
  all_confirmed boolean;
begin
  select submission.* into submission_row
  from public.seller_payment_submissions submission
  join public.seller_orders seller_order on seller_order.id = submission.seller_order_id
  join public.seller_stores store on store.id = seller_order.seller_store_id
  where submission.id = target_submission_id and store.owner_id = auth.uid()
  for update of submission;
  if submission_row.id is null then raise exception 'Payment submission not found'; end if;
  if submission_row.status <> 'pending' then raise exception 'This payment submission was already reviewed'; end if;

  select seller_order.* into seller_order_row from public.seller_orders seller_order
  where seller_order.id = submission_row.seller_order_id for update;
  select * into purchase from public.orders where id = seller_order_row.order_id for update;
  select name into store_name from public.seller_stores where id = seller_order_row.seller_store_id;

  update public.seller_payment_submissions set
    status = case when approve then 'verified' else 'rejected' end,
    reviewed_by = auth.uid(), reviewed_at = now(),
    rejection_reason = case when approve then null else coalesce(nullif(left(trim(review_note), 500), ''), 'The seller could not verify this transfer.') end,
    updated_at = now()
  where id = target_submission_id;

  update public.seller_orders set payment_status = case when approve then 'confirmed' else 'rejected' end,
    updated_at = now() where id = seller_order_row.id;

  if approve and seller_order_row.platform_fee_cents > 0 then
    insert into public.seller_commission_entries(
      seller_store_id, seller_order_id, entry_type, amount_cents, description
    ) values (
      seller_order_row.seller_store_id, seller_order_row.id, 'sale_commission',
      seller_order_row.platform_fee_cents,
      'BelGlow 10% commission for order #' || purchase.order_number
    ) on conflict (seller_order_id) where entry_type = 'sale_commission' do nothing;
  end if;

  select not exists (
    select 1 from public.seller_orders
    where order_id = purchase.id and payment_status <> 'confirmed'
  ) into all_confirmed;

  if all_confirmed then
    update public.payments set status = 'paid', processed_at = now(), updated_at = now()
    where id = (select id from public.payments where order_id = purchase.id order by created_at limit 1);
    update public.orders set payment_status = 'paid', status = 'confirmed', updated_at = now()
    where id = purchase.id;
    perform public.commit_order_inventory(purchase.id);
  end if;

  insert into public.notification_outbox(recipient_email, kind, subject, body, order_id)
  values (
    purchase.email,
    case when approve then 'payment_confirmed' else 'payment_rejected' end,
    case when approve then 'Payment confirmed for BelGlow order #' else 'Payment receipt needs attention for BelGlow order #' end || purchase.order_number,
    case when approve
      then store_name || ' confirmed your payment of BZ$' || to_char(seller_order_row.customer_payment_cents / 100.0, 'FM999999990.00') ||
        '. ' || case when all_confirmed then 'All payments for this order are now confirmed.' else 'Another seller payment may still be awaiting confirmation.' end
      else store_name || ' could not verify your receipt. ' || coalesce(nullif(left(trim(review_note), 500), ''), 'Please upload a clear receipt or contact the seller.')
    end,
    purchase.id
  );

  if purchase.user_id is not null then
    insert into public.notifications(user_id, kind, title, body, href)
    values (purchase.user_id,
      case when approve then 'payment_confirmed' else 'payment_rejected' end,
      case when approve then 'Payment confirmed' else 'Payment receipt needs attention' end,
      store_name || case when approve then ' confirmed your bank transfer.' else ' could not verify your bank transfer.' end,
      '/account');
  end if;

  return jsonb_build_object('orderId', purchase.id, 'orderNumber', purchase.order_number,
    'email', purchase.email, 'approved', approve, 'allConfirmed', all_confirmed);
end;
$$;
revoke execute on function public.verify_seller_payment_submission(uuid, boolean, text) from public, anon;
grant execute on function public.verify_seller_payment_submission(uuid, boolean, text) to authenticated;

create or replace function public.enforce_seller_payment_before_fulfillment()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status is distinct from old.status and
     new.status in ('accepted', 'processing', 'shipped', 'delivered') and
     new.payment_status <> 'confirmed' then
    raise exception 'Confirm this seller payment before fulfilling the order';
  end if;
  return new;
end;
$$;
drop trigger if exists seller_payment_before_fulfillment on public.seller_orders;
create trigger seller_payment_before_fulfillment before update of status on public.seller_orders
  for each row execute procedure public.enforce_seller_payment_before_fulfillment();
revoke execute on function public.enforce_seller_payment_before_fulfillment() from public, anon, authenticated;

comment on table public.seller_payment_profiles is 'Private seller bank details disclosed only to a customer matching an order email.';
comment on table public.seller_commission_entries is 'Amounts owed by sellers to BelGlow. Positive charges increase the seller balance due; negative payments reduce it.';
