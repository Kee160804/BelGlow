-- seller_stores.status is a seller_status enum, while the RPC declares the
-- returned store_status column as text. Cast it explicitly for PL/pgSQL's
-- RETURNS TABLE type check.
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
  select store.id, store.name, store.status::text,
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
