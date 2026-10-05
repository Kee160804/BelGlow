-- Admin-only seller mode for the BelGlow-owned official storefront.
-- Admin profiles keep role='admin'; this only provisions their store workspace.

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
  if not exists (
    select 1 from public.profiles profile
    where profile.id = actor_id and profile.role = 'admin'
  ) then raise exception 'Platform administrator access required'; end if;

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

-- Seller approval does not downgrade an admin or staff profile.
create or replace function public.admin_review_seller_application(
  target_store_id uuid,
  approve boolean,
  review_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_owner_id uuid;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  select store.owner_id into target_owner_id from public.seller_stores store
  where store.id = target_store_id for update;
  if target_owner_id is null then raise exception 'Seller application not found'; end if;

  update public.seller_stores
  set status = case when approve then 'approved'::public.seller_status else 'rejected'::public.seller_status end,
      approved_by = case when approve then auth.uid() else null end,
      approved_at = case when approve then now() else null end,
      rejection_reason = case when approve then null else left(coalesce(review_note, 'Application declined'), 1000) end
  where id = target_store_id;

  update public.profiles
  set role = case
    when role in ('admin', 'staff') then role
    when approve then 'seller'::public.user_role
    else 'customer'::public.user_role
  end
  where id = target_owner_id;
end;
$$;

revoke execute on function public.admin_review_seller_application(uuid, boolean, text) from public, anon;
grant execute on function public.admin_review_seller_application(uuid, boolean, text) to authenticated;
