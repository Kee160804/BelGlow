-- Safe server-side RPCs for seller onboarding, product creation, and admin review.
-- All money is in BZD cents. These functions validate the authenticated actor.

create or replace function public.create_seller_product(
  product_name text,
  product_description text,
  category_slug text,
  unit_price_cents bigint,
  initial_quantity integer,
  submit_for_review boolean default false
)
returns table (created_product_id uuid, created_variant_id uuid, created_sku text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  store_row public.seller_stores%rowtype;
  category_id uuid;
  location_id uuid;
  product_id uuid := gen_random_uuid();
  variant_id uuid := gen_random_uuid();
  product_slug text;
  sku_value text;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if length(trim(product_name)) < 2 or length(product_name) > 160 then raise exception 'Product name must be 2 to 160 characters'; end if;
  if unit_price_cents <= 0 or initial_quantity < 0 or initial_quantity > 100000 then raise exception 'Invalid price or inventory quantity'; end if;

  select store.* into store_row from public.seller_stores store
  where store.owner_id = actor_id and store.status = 'approved' for update;
  if not found then raise exception 'An approved seller store is required'; end if;

  select category_row.id into category_id from public.categories category_row
  where category_row.slug = create_seller_product.category_slug and category_row.is_active;
  if category_id is null then raise exception 'Choose a valid active category'; end if;

  select location.id into location_id from public.inventory_locations location
  where location.is_active order by location.created_at limit 1;
  if location_id is null then raise exception 'No active inventory location is configured'; end if;

  product_slug := trim(both '-' from regexp_replace(lower(trim(product_name)), '[^a-z0-9]+', '-', 'g')) || '-' || left(product_id::text, 8);
  sku_value := 'BG-' || upper(left(replace(product_id::text, '-', ''), 12));

  insert into public.products (
    id, seller_store_id, name, slug, short_description, description, status,
    review_status, base_price_cents, currency, published_at
  ) values (
    product_id, store_row.id, trim(product_name), product_slug,
    left(trim(coalesce(product_description, '')), 240), trim(coalesce(product_description, '')),
    'draft', 'draft', unit_price_cents, 'BZD', null
  );

  insert into public.product_categories (product_id, category_id, is_primary)
  values (product_id, category_id, true);

  insert into public.product_variants (id, product_id, sku, name, price_cents)
  values (variant_id, product_id, sku_value, 'Default', unit_price_cents);

  insert into public.inventory_levels (variant_id, location_id, quantity_on_hand, reorder_point)
  values (variant_id, location_id, initial_quantity, 5);

  if submit_for_review then
    perform public.submit_product_for_review(product_id);
  end if;

  return query select product_id, variant_id, sku_value;
end;
$$;

revoke execute on function public.create_seller_product(text, text, text, bigint, integer, boolean) from public, anon;
grant execute on function public.create_seller_product(text, text, text, bigint, integer, boolean) to authenticated;

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
  set role = case when approve then 'seller'::public.user_role else 'customer'::public.user_role end
  where id = target_owner_id;
end;
$$;

create or replace function public.admin_review_product(
  target_product_id uuid,
  approve boolean,
  review_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  update public.products
  set status = case when approve then 'active'::public.product_status else 'draft'::public.product_status end,
      review_status = case when approve then 'approved'::public.product_review_status else 'draft'::public.product_review_status end,
      published_at = case when approve then now() else null end,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      rejection_reason = case when approve then null else left(coalesce(review_note, 'Please update this listing and resubmit.'), 1000) end
  where id = target_product_id and seller_store_id is not null and review_status = 'submitted';
  if not found then raise exception 'Submitted marketplace product not found'; end if;
end;
$$;

create or replace function public.admin_update_commission(rate_bps integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if rate_bps < 0 or rate_bps > 10000 then raise exception 'Commission must be between 0 and 10000 basis points'; end if;
  update public.marketplace_settings
  set default_commission_bps = rate_bps, updated_by = auth.uid(), updated_at = now()
  where singleton;
end;
$$;

create or replace function public.admin_update_seller_applications(applications_open boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  update public.marketplace_settings
  set seller_applications_open = applications_open, updated_by = auth.uid(), updated_at = now()
  where singleton;
end;
$$;

revoke execute on function public.admin_review_seller_application(uuid, boolean, text) from public, anon;
revoke execute on function public.admin_review_product(uuid, boolean, text) from public, anon;
revoke execute on function public.admin_update_commission(integer) from public, anon;
revoke execute on function public.admin_update_seller_applications(boolean) from public, anon;
grant execute on function public.admin_review_seller_application(uuid, boolean, text) to authenticated;

-- Admins use their existing admin identity to manage BelGlow's official shop.
-- This is not a seller application and never changes the admin profile role.
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

comment on function public.ensure_admin_seller_store() is
  'Creates or activates the official BelGlow seller store for an admin without changing their admin role or requiring a seller application.';
grant execute on function public.admin_review_product(uuid, boolean, text) to authenticated;
grant execute on function public.admin_update_commission(integer) to authenticated;
grant execute on function public.admin_update_seller_applications(boolean) to authenticated;

create policy "Sellers read active inventory locations" on public.inventory_locations
  for select to authenticated using (is_active);
grant select on public.inventory_locations to authenticated;
grant update (status, accepted_at, shipped_at, delivered_at) on public.seller_orders to authenticated;

comment on function public.create_seller_product(text, text, text, bigint, integer, boolean)
  is 'Creates a seller-owned draft, category link, variant, and stock row after checking the authenticated approved store.';

create or replace function public.add_cart_item(target_variant_id uuid, quantity_delta integer default 1)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  active_cart_id uuid;
  existing_quantity integer := 0;
  available_quantity integer;
begin
  if actor_id is null then raise exception 'Sign in to save your cart'; end if;
  if quantity_delta < 1 or quantity_delta > 99 then raise exception 'Invalid quantity'; end if;
  if not exists (
    select 1 from public.product_variants variant
    join public.products product on product.id = variant.product_id
    where variant.id = target_variant_id and variant.is_active and product.status = 'active'
  ) then raise exception 'This product is not available'; end if;

  insert into public.carts (user_id) values (actor_id)
  on conflict (user_id) where status = 'active' and user_id is not null do nothing;
  select cart.id into active_cart_id from public.carts cart
  where cart.user_id = actor_id and cart.status = 'active' and cart.expires_at > now()
  for update;
  if active_cart_id is null then raise exception 'Unable to open cart'; end if;

  select item.quantity into existing_quantity from public.cart_items item
  where item.cart_id = active_cart_id and item.variant_id = target_variant_id;
  existing_quantity := coalesce(existing_quantity, 0);
  if existing_quantity + quantity_delta > 99 then raise exception 'Maximum cart quantity is 99'; end if;

  select coalesce(sum(level.quantity_on_hand - level.quantity_reserved), 0)::integer
  into available_quantity from public.inventory_levels level
  where level.variant_id = target_variant_id;
  if existing_quantity + quantity_delta > available_quantity then raise exception 'There is not enough stock available'; end if;

  insert into public.cart_items (cart_id, variant_id, quantity)
  values (active_cart_id, target_variant_id, quantity_delta)
  on conflict (cart_id, variant_id) do update
    set quantity = excluded.quantity + public.cart_items.quantity,
        updated_at = now();
end;
$$;

create or replace function public.remove_cart_item(target_variant_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  active_cart_id uuid;
begin
  if actor_id is null then raise exception 'Sign in to update your cart'; end if;
  select cart.id into active_cart_id from public.carts cart
  where cart.user_id = actor_id and cart.status = 'active' and cart.expires_at > now()
  for update;
  if active_cart_id is null then return; end if;

  update public.cart_items item set quantity = quantity - 1, updated_at = now()
  where item.cart_id = active_cart_id and item.variant_id = target_variant_id and item.quantity > 1;
  if not found then
    delete from public.cart_items item
    where item.cart_id = active_cart_id and item.variant_id = target_variant_id;
  end if;
end;
$$;

revoke execute on function public.add_cart_item(uuid, integer) from public, anon;
revoke execute on function public.remove_cart_item(uuid) from public, anon;
grant execute on function public.add_cart_item(uuid, integer) to authenticated;
grant execute on function public.remove_cart_item(uuid) to authenticated;

-- Admins may also own a seller store. Approving/rejecting their seller
-- application must never remove their independent platform-admin role.
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
