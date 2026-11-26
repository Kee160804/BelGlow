-- Preserve existing seller payment profiles while allowing each store to own
-- multiple bank accounts.
alter table public.seller_payment_profiles
  add column if not exists id uuid default gen_random_uuid();

update public.seller_payment_profiles set id = gen_random_uuid() where id is null;
alter table public.seller_payment_profiles alter column id set not null;

do $$
declare
  current_primary_key text;
begin
  select constraint_row.conname into current_primary_key
  from pg_constraint constraint_row
  where constraint_row.conrelid = 'public.seller_payment_profiles'::regclass
    and constraint_row.contype = 'p';

  if current_primary_key is not null then
    execute format('alter table public.seller_payment_profiles drop constraint %I', current_primary_key);
  end if;
end;
$$;

alter table public.seller_payment_profiles
  add constraint seller_payment_profiles_pkey primary key (id);

create index if not exists seller_payment_profiles_store_active_idx
  on public.seller_payment_profiles (seller_store_id, is_active, created_at);

-- Keep the existing RPC working for older clients by updating the first
-- account for the seller, or creating it when no account exists yet.
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
  account_id uuid;
begin
  select id into store_id from public.seller_stores
  where owner_id = auth.uid() and status = 'approved';
  if store_id is null then raise exception 'An approved seller store is required'; end if;
  if length(trim(coalesce(payment_bank_name, ''))) < 2 or
     length(trim(coalesce(payment_account_name, ''))) < 2 or
     length(trim(coalesce(payment_account_number, ''))) < 3 then
    raise exception 'Complete the bank name, account name, and account number';
  end if;

  select id into account_id from public.seller_payment_profiles
  where seller_store_id = store_id order by created_at, id limit 1;

  if account_id is null then
    insert into public.seller_payment_profiles(
      seller_store_id, bank_name, account_name, account_number, account_type, instructions, is_active
    ) values (
      store_id, left(trim(payment_bank_name), 120), left(trim(payment_account_name), 160),
      left(trim(payment_account_number), 100), nullif(left(trim(coalesce(payment_account_type, '')), 80), ''),
      nullif(left(trim(coalesce(payment_instructions, '')), 1000), ''), payment_enabled
    );
  else
    update public.seller_payment_profiles set
      bank_name = left(trim(payment_bank_name), 120),
      account_name = left(trim(payment_account_name), 160),
      account_number = left(trim(payment_account_number), 100),
      account_type = nullif(left(trim(coalesce(payment_account_type, '')), 80), ''),
      instructions = nullif(left(trim(coalesce(payment_instructions, '')), 1000), ''),
      is_active = payment_enabled,
      updated_at = now()
    where id = account_id;
  end if;
end;
$$;

create or replace function public.save_seller_payment_account(
  target_account_id uuid,
  payment_bank_name text,
  payment_account_name text,
  payment_account_number text,
  payment_account_type text default null,
  payment_instructions text default null,
  payment_enabled boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  store_id uuid;
  saved_account_id uuid;
begin
  select id into store_id from public.seller_stores
  where owner_id = auth.uid() and status = 'approved';
  if store_id is null then raise exception 'An approved seller store is required'; end if;
  if length(trim(coalesce(payment_bank_name, ''))) < 2 or
     length(trim(coalesce(payment_account_name, ''))) < 2 or
     length(trim(coalesce(payment_account_number, ''))) < 3 then
    raise exception 'Complete the bank name, account name, and account number';
  end if;

  if target_account_id is null then
    insert into public.seller_payment_profiles(
      seller_store_id, bank_name, account_name, account_number, account_type, instructions, is_active
    ) values (
      store_id, left(trim(payment_bank_name), 120), left(trim(payment_account_name), 160),
      left(trim(payment_account_number), 100), nullif(left(trim(coalesce(payment_account_type, '')), 80), ''),
      nullif(left(trim(coalesce(payment_instructions, '')), 1000), ''), payment_enabled
    ) returning id into saved_account_id;
  else
    update public.seller_payment_profiles set
      bank_name = left(trim(payment_bank_name), 120),
      account_name = left(trim(payment_account_name), 160),
      account_number = left(trim(payment_account_number), 100),
      account_type = nullif(left(trim(coalesce(payment_account_type, '')), 80), ''),
      instructions = nullif(left(trim(coalesce(payment_instructions, '')), 1000), ''),
      is_active = payment_enabled,
      updated_at = now()
    where id = target_account_id and seller_store_id = store_id
    returning id into saved_account_id;
    if saved_account_id is null then raise exception 'Bank account not found for this seller'; end if;
  end if;

  return saved_account_id;
end;
$$;

create or replace function public.delete_seller_payment_account(target_account_id uuid)
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

  delete from public.seller_payment_profiles
  where id = target_account_id and seller_store_id = store_id;
  if not found then raise exception 'Bank account not found for this seller'; end if;
end;
$$;

revoke execute on function public.save_seller_payment_profile(text, text, text, text, text, boolean) from public, anon;
revoke execute on function public.save_seller_payment_account(uuid, text, text, text, text, text, boolean) from public, anon;
revoke execute on function public.delete_seller_payment_account(uuid) from public, anon;
grant execute on function public.save_seller_payment_profile(text, text, text, text, text, boolean) to authenticated;
grant execute on function public.save_seller_payment_account(uuid, text, text, text, text, text, boolean) to authenticated;
grant execute on function public.delete_seller_payment_account(uuid) to authenticated;

-- Return all enabled accounts for the buyer's own order. Keep the original
-- singular fields populated for clients that have not yet learned the array.
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
      'bankName', bank.accounts -> 0 ->> 'bankName',
      'accountName', bank.accounts -> 0 ->> 'accountName',
      'accountNumber', bank.accounts -> 0 ->> 'accountNumber',
      'accountType', bank.accounts -> 0 ->> 'accountType',
      'instructions', bank.accounts -> 0 ->> 'instructions',
      'bankAccounts', bank.accounts,
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
  join lateral (
    select jsonb_agg(jsonb_build_object(
      'bankName', profile.bank_name,
      'accountName', profile.account_name,
      'accountNumber', profile.account_number,
      'accountType', profile.account_type,
      'instructions', profile.instructions
    ) order by profile.created_at, profile.id) as accounts
    from public.seller_payment_profiles profile
    where profile.seller_store_id = store.id and profile.is_active
  ) bank on bank.accounts is not null
  where purchase.order_number = lookup_order_number
    and lower(purchase.email) = lower(trim(lookup_email))
  group by purchase.id;
$$;

revoke execute on function public.get_order_payment_details(bigint, text) from public;
grant execute on function public.get_order_payment_details(bigint, text) to anon, authenticated;

-- Ensure PostgREST exposes the newly-created RPCs immediately after the
-- migration is run in the Supabase SQL editor.
notify pgrst, 'reload schema';
