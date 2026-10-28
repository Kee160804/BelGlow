-- Keep the admin account directory synchronized with every non-admin login,
-- including people who also own a seller store.

-- Bring seller suspensions made before account-level management existed into
-- the profile state used by sign-in guards and the unified admin directory.
update public.profiles profile
set
  account_status = 'suspended',
  suspended_at = coalesce(profile.suspended_at, now()),
  suspended_until = null,
  suspension_reason = coalesce(profile.suspension_reason, 'Seller account suspended by a platform administrator.'),
  account_status_updated_at = now()
from public.seller_stores store
where store.owner_id = profile.id
  and store.status = 'suspended'
  and profile.account_status <> 'archived';

create or replace function public.admin_list_customer_accounts()
returns table (
  id uuid,
  email text,
  full_name text,
  phone text,
  role public.user_role,
  account_status text,
  suspended_until timestamptz,
  suspension_reason text,
  archived_at timestamptz,
  created_at timestamptz,
  order_count bigint,
  total_spent_cents bigint,
  refund_total_cents bigint,
  last_order_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Administrator access required';
  end if;

  return query
  select
    profile.id,
    auth_user.email::text,
    profile.full_name,
    profile.phone,
    profile.role,
    case
      when profile.account_status = 'archived' then 'archived'
      when profile.account_status = 'suspended'
        and (profile.suspended_until is null or profile.suspended_until > now())
      then 'suspended'
      when store.status = 'suspended' then 'suspended'
      else 'active'
    end,
    profile.suspended_until,
    coalesce(profile.suspension_reason,
      case when store.status = 'suspended' then 'Seller access suspended by a platform administrator.' end),
    profile.archived_at,
    profile.created_at,
    coalesce(customer_orders.order_count, 0),
    coalesce(customer_orders.total_spent_cents, 0),
    coalesce(customer_orders.refund_total_cents, 0),
    customer_orders.last_order_at
  from public.profiles profile
  join auth.users auth_user on auth_user.id = profile.id
  left join public.seller_stores store on store.owner_id = profile.id
  left join lateral (
    select
      count(purchase.id)::bigint as order_count,
      coalesce(sum(purchase.total_cents) filter (where purchase.payment_status in ('paid', 'partially_refunded', 'refunded')), 0)::bigint as total_spent_cents,
      coalesce((
        select sum(refund.amount_cents)
        from public.refunds refund
        join public.orders refunded_order on refunded_order.id = refund.order_id
        where refunded_order.user_id = profile.id
          and refund.status = 'refunded'
      ), 0)::bigint as refund_total_cents,
      max(purchase.placed_at) as last_order_at
    from public.orders purchase
    where purchase.user_id = profile.id
  ) customer_orders on true
  where profile.role not in ('admin', 'staff')
    and not exists (
      select 1 from public.platform_admins admin_account
      where admin_account.user_id = profile.id
    )
  order by profile.account_status_updated_at desc, profile.created_at desc
  limit 500;
end;
$$;

revoke execute on function public.admin_list_customer_accounts() from public, anon;
grant execute on function public.admin_list_customer_accounts() to authenticated;

-- New registrations, account actions, seller suspensions, and transactional
-- summaries update the admin UI without a manual refresh.
do $$
declare
  realtime_table text;
begin
  foreach realtime_table in array array[
    'profiles',
    'seller_stores',
    'orders',
    'payments',
    'refunds',
    'customer_account_events'
  ] loop
    if not exists (
      select 1
      from pg_publication_tables publication_table
      where publication_table.pubname = 'supabase_realtime'
        and publication_table.schemaname = 'public'
        and publication_table.tablename = realtime_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', realtime_table);
    end if;
  end loop;
end;
$$;

notify pgrst, 'reload schema';
