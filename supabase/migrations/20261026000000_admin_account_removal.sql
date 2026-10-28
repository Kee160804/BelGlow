-- Reversible customer account lifecycle for platform administrators.
-- "Delete" in the admin UI archives an account instead of destroying its
-- identity, orders, payments, refunds, addresses, reviews, or audit history.

alter table public.profiles
  add column if not exists account_status text not null default 'active'
    check (account_status in ('active', 'suspended', 'archived')),
  add column if not exists suspended_at timestamptz,
  add column if not exists suspended_until timestamptz,
  add column if not exists suspension_reason text,
  add column if not exists suspended_by uuid references public.profiles(id) on delete set null,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.profiles(id) on delete set null,
  add column if not exists restored_at timestamptz,
  add column if not exists account_status_updated_at timestamptz not null default now();

create index if not exists profiles_account_status_idx
  on public.profiles(account_status, account_status_updated_at desc);

-- Profile editing was originally granted at table level. Narrow it so a
-- suspended or archived customer cannot reactivate their own account status.
revoke update on public.profiles from authenticated;
grant update (full_name, phone, avatar_url, marketing_opt_in, updated_at)
  on public.profiles to authenticated;

create table if not exists public.customer_account_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete restrict,
  email text not null,
  event_type text not null check (event_type in ('suspended', 'reactivated', 'archived', 'restored')),
  reason text,
  scheduled_until timestamptz,
  performed_by uuid references public.profiles(id) on delete set null,
  account_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists customer_account_events_user_idx
  on public.customer_account_events(user_id, created_at desc);

alter table public.customer_account_events enable row level security;
revoke all on public.customer_account_events from public, anon, authenticated;
grant select on public.customer_account_events to authenticated;

drop policy if exists "Admins read customer account events" on public.customer_account_events;
create policy "Admins read customer account events"
  on public.customer_account_events
  for select to authenticated
  using (public.is_admin());

drop function if exists public.admin_list_customer_accounts();
create function public.admin_list_customer_accounts()
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
      when profile.account_status = 'suspended'
        and profile.suspended_until is not null
        and profile.suspended_until <= now()
      then 'active'
      else profile.account_status
    end,
    profile.suspended_until,
    profile.suspension_reason,
    profile.archived_at,
    profile.created_at,
    coalesce(customer_orders.order_count, 0),
    coalesce(customer_orders.total_spent_cents, 0),
    coalesce(customer_orders.refund_total_cents, 0),
    customer_orders.last_order_at
  from public.profiles profile
  join auth.users auth_user on auth_user.id = profile.id
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
  where profile.role = 'customer'
    and not exists (
      select 1 from public.platform_admins admin_account
      where admin_account.user_id = profile.id
    )
    and not exists (
      select 1 from public.seller_stores store
      where store.owner_id = profile.id
    )
  order by profile.account_status_updated_at desc, profile.created_at desc
  limit 500;
end;
$$;

revoke execute on function public.admin_list_customer_accounts() from public, anon;
grant execute on function public.admin_list_customer_accounts() to authenticated;

comment on table public.customer_account_events is
  'Permanent audit trail of customer suspensions, archives, and restorations.';
comment on function public.admin_list_customer_accounts() is
  'Lists live, suspended, and archived customer accounts with transactional summaries for platform administrators.';

notify pgrst, 'reload schema';
