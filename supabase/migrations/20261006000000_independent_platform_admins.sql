-- Separate platform admin permissions from the seller/customer profile role.
-- An admin can own a store and sell without losing administrator access.

create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  granted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.platform_admins enable row level security;
revoke all on public.platform_admins from anon, authenticated;

-- Preserve existing admin/staff accounts, and bootstrap the BelGlow owner
-- account named by the project owner during setup.
insert into public.platform_admins (user_id, granted_by)
select auth_user.id, null
from auth.users auth_user
left join public.profiles profile on profile.id = auth_user.id
where profile.role in ('admin', 'staff')
   or lower(auth_user.email) = lower('mclaughlinkyan04@gmail.com')
on conflict (user_id) do nothing;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.platform_admins platform_admin
    where platform_admin.user_id = (select auth.uid())
  );
$$;

revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

create or replace function public.ensure_admin_seller_store()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  store_id uuid;
  official_slug text;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if not public.is_admin() then raise exception 'Platform administrator access required'; end if;

  official_slug := 'belglow-official-' || left(replace(actor_id::text, '-', ''), 12);
  insert into public.seller_stores (
    owner_id, name, slug, description, status, approved_by, approved_at
  ) values (
    actor_id,
    'BelGlow Official Store',
    official_slug,
    'Official BelGlow products and marketplace storefront.',
    'approved',
    actor_id,
    now()
  )
  on conflict (owner_id) do update set
    status = 'approved',
    approved_by = actor_id,
    approved_at = coalesce(public.seller_stores.approved_at, now()),
    rejection_reason = null,
    updated_at = now()
  returning id into store_id;
  return store_id;
end;
$$;

revoke execute on function public.ensure_admin_seller_store() from public, anon;
grant execute on function public.ensure_admin_seller_store() to authenticated;

create or replace function public.list_platform_admins()
returns table (user_id uuid, email text, full_name text, granted_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  return query
  select admins.user_id, auth_user.email::text, profile.full_name, admins.created_at
  from public.platform_admins admins
  join auth.users auth_user on auth_user.id = admins.user_id
  left join public.profiles profile on profile.id = admins.user_id
  order by admins.created_at;
end;
$$;

create or replace function public.set_platform_admin(target_email text, grant_access boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_user_id uuid;
  admin_count integer;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if target_email is null or length(trim(target_email)) < 5 then raise exception 'Enter a valid account email'; end if;

  select auth_user.id into target_user_id
  from auth.users auth_user
  where lower(auth_user.email) = lower(trim(target_email))
  limit 1;
  if target_user_id is null then raise exception 'No BelGlow account exists for that email; ask them to create an account first'; end if;

  if grant_access then
    insert into public.platform_admins (user_id, granted_by)
    values (target_user_id, auth.uid())
    on conflict (user_id) do nothing;
  else
    select count(*) into admin_count from public.platform_admins;
    if exists (select 1 from public.platform_admins where user_id = target_user_id)
       and admin_count <= 1 then
      raise exception 'Cannot remove the last platform administrator';
    end if;
    delete from public.platform_admins where user_id = target_user_id;
  end if;
end;
$$;

revoke execute on function public.list_platform_admins() from public, anon;
revoke execute on function public.set_platform_admin(text, boolean) from public, anon;
grant execute on function public.list_platform_admins() to authenticated;
grant execute on function public.set_platform_admin(text, boolean) to authenticated;

comment on table public.platform_admins is
  'Platform privileges are independent from profile roles, allowing an admin to also own and operate a seller store.';
