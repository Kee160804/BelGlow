-- Belize Bank hosted-card payments for seller commission, plus an admin
-- collection summary that exposes balances only (never order or sales detail).
begin;

create table public.seller_commission_payments (
  id uuid primary key default gen_random_uuid(),
  seller_store_id uuid not null references public.seller_stores(id) on delete restrict,
  payment_reference text not null unique,
  amount_cents bigint not null check (amount_cents > 0),
  provider text not null default 'belize_bank' check (provider = 'belize_bank'),
  bank_order_id text unique,
  hosted_payment_url text,
  initialization_token uuid,
  status text not null default 'initiating' check (status in ('initiating', 'pending', 'paid', 'failed')),
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  updated_at timestamptz not null default now()
);

create index seller_commission_payments_store_idx
  on public.seller_commission_payments(seller_store_id, created_at desc);
create unique index seller_commission_one_active_payment_idx
  on public.seller_commission_payments(seller_store_id)
  where status in ('initiating', 'pending');
alter table public.seller_commission_payments enable row level security;
revoke all on public.seller_commission_payments from public, anon, authenticated;
grant select, insert, update on public.seller_commission_payments to service_role;
create trigger seller_commission_payments_updated_at
  before update on public.seller_commission_payments
  for each row execute procedure public.set_updated_at();

alter table public.seller_commission_entries
  add column commission_payment_id uuid references public.seller_commission_payments(id) on delete restrict;
create unique index seller_commission_payment_ledger_once_idx
  on public.seller_commission_entries(commission_payment_id)
  where commission_payment_id is not null;

create or replace function public.begin_seller_commission_payment(payment_reference text, initialization_token uuid)
returns table(payment_id uuid, seller_store_id uuid, amount_cents bigint, reference text, status text, hosted_payment_url text, initialization_claim uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_store_id uuid;
  target_balance bigint;
  existing_payment public.seller_commission_payments%rowtype;
begin
  select store.id into target_store_id
  from public.seller_stores store
  where store.owner_id = auth.uid() and store.status = 'approved'
  for update;
  if target_store_id is null then raise exception 'An approved seller store is required'; end if;

  select payment.* into existing_payment
  from public.seller_commission_payments payment
  where payment.seller_store_id = target_store_id and payment.status in ('initiating', 'pending')
  order by payment.created_at desc limit 1;
  if existing_payment.id is not null and existing_payment.status = 'initiating'
    and existing_payment.created_at < now() - interval '10 minutes' then
    update public.seller_commission_payments payment
    set status = 'failed', initialization_token = null
    where payment.id = existing_payment.id;
    existing_payment.id := null;
  end if;
  if existing_payment.id is not null then
    return query select existing_payment.id, existing_payment.seller_store_id,
      existing_payment.amount_cents, existing_payment.payment_reference,
      existing_payment.status, existing_payment.hosted_payment_url,
      existing_payment.initialization_token;
    return;
  end if;

  select coalesce(sum(entry.amount_cents), 0)::bigint into target_balance
  from public.seller_commission_entries entry
  where entry.seller_store_id = target_store_id;
  if target_balance <= 0 then raise exception 'There is no outstanding commission balance to pay'; end if;
  if length(trim(coalesce(payment_reference, ''))) < 12 or length(payment_reference) > 100 then
    raise exception 'Invalid commission payment reference';
  end if;

  insert into public.seller_commission_payments as payment (
    seller_store_id, payment_reference, amount_cents, initialization_token
  ) values (target_store_id, payment_reference, target_balance, initialization_token)
  returning payment.id, payment.seller_store_id, payment.amount_cents,
    payment.payment_reference, payment.status, payment.hosted_payment_url,
    payment.initialization_token
  into payment_id, seller_store_id, amount_cents, reference, status, hosted_payment_url, initialization_claim;
  return next;
end;
$$;
revoke all on function public.begin_seller_commission_payment(text, uuid) from public, anon;
grant execute on function public.begin_seller_commission_payment(text, uuid) to authenticated;

create or replace function public.confirm_seller_commission_payment(
  target_payment_id uuid,
  target_bank_order_id text,
  verified_amount_cents bigint
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  payment_row public.seller_commission_payments%rowtype;
begin
  select payment.* into payment_row
  from public.seller_commission_payments payment
  where payment.id = target_payment_id
    and payment.bank_order_id = target_bank_order_id
  for update;
  if payment_row.id is null then raise exception 'Commission payment not found'; end if;
  if payment_row.amount_cents <> verified_amount_cents then raise exception 'Verified payment amount does not match'; end if;
  if payment_row.status = 'paid' then return true; end if;
  if payment_row.status <> 'pending' then return false; end if;

  update public.seller_commission_payments
  set status = 'paid', paid_at = now()
  where id = payment_row.id;

  insert into public.seller_commission_entries(
    seller_store_id, entry_type, amount_cents, description,
    external_reference, commission_payment_id
  ) values (
    payment_row.seller_store_id, 'payment', -payment_row.amount_cents,
    'BelGlow commission payment ' || payment_row.payment_reference,
    target_bank_order_id, payment_row.id
  ) on conflict (commission_payment_id) where commission_payment_id is not null do nothing;
  return true;
end;
$$;
revoke all on function public.confirm_seller_commission_payment(uuid, text, bigint) from public, anon, authenticated;
grant execute on function public.confirm_seller_commission_payment(uuid, text, bigint) to service_role;

create or replace function public.admin_commission_collection_summary()
returns table(seller_store_id uuid, store_name text, store_status text, balance_due_cents bigint, last_payment_at timestamptz)
language plpgsql
security definer
set search_path = ''
stable
as $$
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  return query
  with balances as (
    select entry.seller_store_id, sum(entry.amount_cents)::bigint as due_cents
    from public.seller_commission_entries entry
    group by entry.seller_store_id
  ), payment_dates as (
    select entry.seller_store_id, max(entry.created_at) as last_paid
    from public.seller_commission_entries entry
    where entry.entry_type = 'payment' and entry.amount_cents < 0
    group by entry.seller_store_id
  )
  select store.id, store.name, store.status,
    greatest(coalesce(balances.due_cents, 0), 0)::bigint, payment_dates.last_paid
  from public.seller_stores store
  left join balances on balances.seller_store_id = store.id
  left join payment_dates on payment_dates.seller_store_id = store.id
  where store.status in ('approved', 'suspended')
  order by greatest(coalesce(balances.due_cents, 0), 0) desc, store.name;
end;
$$;
revoke all on function public.admin_commission_collection_summary() from public, anon;
grant execute on function public.admin_commission_collection_summary() to authenticated;

notify pgrst, 'reload schema';
commit;
