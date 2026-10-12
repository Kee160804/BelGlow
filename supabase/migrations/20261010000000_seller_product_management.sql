-- Seller-owned catalog editing, rich storefront details, variants, and stock.
-- Every operation verifies the authenticated seller owns the target store/product.

create or replace function public.create_seller_product_v2(
  product_name text,
  product_short_description text,
  product_description text,
  category_slug text,
  product_ingredients text,
  product_usage_instructions text,
  product_attributes jsonb,
  compare_price_cents bigint,
  product_variants jsonb,
  submit_for_review boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  store_row public.seller_stores%rowtype;
  target_category_id uuid;
  location_id uuid;
  new_product_id uuid := gen_random_uuid();
  new_variant_id uuid;
  product_slug text;
  sku_value text;
  variant_row jsonb;
  variant_index integer := 0;
  variant_name text;
  variant_price bigint;
  variant_quantity integer;
  base_price bigint := 0;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if length(trim(product_name)) < 2 or length(product_name) > 160 then raise exception 'Product name must be 2 to 160 characters'; end if;
  if jsonb_typeof(product_variants) <> 'array' or jsonb_array_length(product_variants) < 1 or jsonb_array_length(product_variants) > 50 then
    raise exception 'Add between 1 and 50 product options';
  end if;

  select store.* into store_row from public.seller_stores store
  where store.owner_id = actor_id and store.status = 'approved' for update;
  if not found then raise exception 'An approved seller store is required'; end if;

  if exists (
    select 1 from public.products product
    where product.seller_store_id = store_row.id and lower(trim(product.name)) = lower(trim(product_name))
  ) then raise exception 'You already have a product with this name. Edit the existing listing instead.'; end if;

  select category.id into target_category_id from public.categories category
  where category.slug = create_seller_product_v2.category_slug and category.is_active;
  if target_category_id is null then raise exception 'Choose a valid active category'; end if;

  select location.id into location_id from public.inventory_locations location
  where location.is_active order by location.created_at limit 1;
  if location_id is null then raise exception 'No active inventory location is configured'; end if;

  for variant_row in select value from jsonb_array_elements(product_variants)
  loop
    variant_price := (variant_row->>'price_cents')::bigint;
    variant_quantity := (variant_row->>'quantity')::integer;
    if variant_price <= 0 or variant_quantity < 0 or variant_quantity > 100000 then raise exception 'Each option needs a valid price and stock quantity'; end if;
    if base_price = 0 or variant_price < base_price then base_price := variant_price; end if;
  end loop;
  if compare_price_cents is not null and compare_price_cents < base_price then raise exception 'The original price cannot be lower than the selling price'; end if;

  product_slug := trim(both '-' from regexp_replace(lower(trim(product_name)), '[^a-z0-9]+', '-', 'g')) || '-' || left(new_product_id::text, 8);
  insert into public.products (
    id, seller_store_id, name, slug, short_description, description, status, review_status,
    base_price_cents, compare_at_price_cents, currency, ingredients, usage_instructions, attributes
  ) values (
    new_product_id, store_row.id, trim(product_name), product_slug,
    nullif(trim(product_short_description), ''), nullif(trim(product_description), ''),
    'draft', 'draft', base_price, compare_price_cents, 'BZD',
    nullif(trim(product_ingredients), ''), nullif(trim(product_usage_instructions), ''), coalesce(product_attributes, '{}'::jsonb)
  );
  insert into public.product_categories (product_id, category_id, is_primary) values (new_product_id, target_category_id, true);

  for variant_row in select value from jsonb_array_elements(product_variants)
  loop
    variant_index := variant_index + 1;
    new_variant_id := gen_random_uuid();
    variant_name := coalesce(nullif(trim(variant_row->>'name'), ''), 'Default');
    variant_price := (variant_row->>'price_cents')::bigint;
    variant_quantity := (variant_row->>'quantity')::integer;
    sku_value := 'BG-' || upper(left(replace(new_product_id::text, '-', ''), 10)) || '-' || lpad(variant_index::text, 2, '0');
    insert into public.product_variants (id, product_id, sku, name, price_cents, attributes, sort_order)
    values (new_variant_id, new_product_id, sku_value, variant_name, variant_price, jsonb_build_object('size', variant_name), variant_index - 1);
    insert into public.inventory_levels (variant_id, location_id, quantity_on_hand, reorder_point)
    values (new_variant_id, location_id, variant_quantity, 5);
  end loop;

  if submit_for_review then
    update public.products set review_status = 'submitted', submitted_at = now(), updated_at = now() where id = new_product_id;
  end if;
  return new_product_id;
end;
$$;

create or replace function public.update_seller_product(
  target_product_id uuid,
  product_name text,
  product_short_description text,
  product_description text,
  category_slug text,
  product_ingredients text,
  product_usage_instructions text,
  product_attributes jsonb,
  compare_price_cents bigint,
  product_variants jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  owned_product public.products%rowtype;
  target_category_id uuid;
  location_id uuid;
  variant_row jsonb;
  target_variant_id uuid;
  variant_name text;
  variant_price bigint;
  variant_quantity integer;
  variant_index integer := 0;
  base_price bigint := 0;
  sku_value text;
  kept_variant_ids uuid[] := '{}'::uuid[];
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  select product.* into owned_product
  from public.products product join public.seller_stores store on store.id = product.seller_store_id
  where product.id = target_product_id and store.owner_id = actor_id and store.status = 'approved' for update;
  if not found then raise exception 'Product not found in your seller account'; end if;
  if owned_product.review_status = 'submitted' then raise exception 'This product is currently under review and cannot be edited'; end if;
  if length(trim(product_name)) < 2 or length(product_name) > 160 then raise exception 'Product name must be 2 to 160 characters'; end if;
  if jsonb_typeof(product_variants) <> 'array' or jsonb_array_length(product_variants) < 1 or jsonb_array_length(product_variants) > 50 then raise exception 'Add between 1 and 50 product options'; end if;
  if exists (
    select 1 from public.products product
    where product.seller_store_id = owned_product.seller_store_id and product.id <> target_product_id
      and lower(trim(product.name)) = lower(trim(product_name))
  ) then raise exception 'You already have another product with this name'; end if;

  select category.id into target_category_id from public.categories category
  where category.slug = update_seller_product.category_slug and category.is_active;
  if target_category_id is null then raise exception 'Choose a valid active category'; end if;
  select location.id into location_id from public.inventory_locations location
  where location.is_active order by location.created_at limit 1;
  if location_id is null then raise exception 'No active inventory location is configured'; end if;

  for variant_row in select value from jsonb_array_elements(product_variants)
  loop
    variant_price := (variant_row->>'price_cents')::bigint;
    variant_quantity := (variant_row->>'quantity')::integer;
    if variant_price <= 0 or variant_quantity < 0 or variant_quantity > 100000 then raise exception 'Each option needs a valid price and stock quantity'; end if;
    if base_price = 0 or variant_price < base_price then base_price := variant_price; end if;
  end loop;
  if compare_price_cents is not null and compare_price_cents < base_price then raise exception 'The original price cannot be lower than the selling price'; end if;

  update public.products set
    name = trim(product_name), short_description = nullif(trim(product_short_description), ''),
    description = nullif(trim(product_description), ''), base_price_cents = base_price,
    compare_at_price_cents = compare_price_cents, ingredients = nullif(trim(product_ingredients), ''),
    usage_instructions = nullif(trim(product_usage_instructions), ''), attributes = coalesce(product_attributes, '{}'::jsonb),
    updated_at = now()
  where id = target_product_id;
  delete from public.product_categories where product_id = target_product_id;
  insert into public.product_categories (product_id, category_id, is_primary) values (target_product_id, target_category_id, true);

  for variant_row in select value from jsonb_array_elements(product_variants)
  loop
    variant_index := variant_index + 1;
    variant_name := coalesce(nullif(trim(variant_row->>'name'), ''), 'Default');
    variant_price := (variant_row->>'price_cents')::bigint;
    variant_quantity := (variant_row->>'quantity')::integer;
    target_variant_id := nullif(variant_row->>'id', '')::uuid;
    if target_variant_id is not null then
      update public.product_variants set name = variant_name, price_cents = variant_price,
        attributes = jsonb_build_object('size', variant_name), is_active = true, sort_order = variant_index - 1, updated_at = now()
      where id = target_variant_id and product_id = target_product_id;
      if not found then raise exception 'A product option does not belong to this listing'; end if;
    else
      target_variant_id := gen_random_uuid();
      sku_value := 'BG-' || upper(left(replace(target_product_id::text, '-', ''), 10)) || '-' || upper(left(replace(target_variant_id::text, '-', ''), 4));
      insert into public.product_variants (id, product_id, sku, name, price_cents, attributes, sort_order)
      values (target_variant_id, target_product_id, sku_value, variant_name, variant_price, jsonb_build_object('size', variant_name), variant_index - 1);
    end if;
    kept_variant_ids := array_append(kept_variant_ids, target_variant_id);
    if exists (select 1 from public.inventory_levels where variant_id = target_variant_id and quantity_reserved > variant_quantity) then
      raise exception 'Stock cannot be lower than the quantity already reserved in customer carts';
    end if;
    insert into public.inventory_levels (variant_id, location_id, quantity_on_hand, reorder_point)
    values (target_variant_id, location_id, variant_quantity, 5)
    on conflict (variant_id, location_id) do update set quantity_on_hand = excluded.quantity_on_hand, updated_at = now();
  end loop;
  update public.product_variants set is_active = false, updated_at = now()
  where product_id = target_product_id and not (id = any(kept_variant_ids));
end;
$$;

revoke execute on function public.create_seller_product_v2(text, text, text, text, text, text, jsonb, bigint, jsonb, boolean) from public, anon;
revoke execute on function public.update_seller_product(uuid, text, text, text, text, text, text, jsonb, bigint, jsonb) from public, anon;
grant execute on function public.create_seller_product_v2(text, text, text, text, text, text, jsonb, bigint, jsonb, boolean) to authenticated;
grant execute on function public.update_seller_product(uuid, text, text, text, text, text, text, jsonb, bigint, jsonb) to authenticated;

drop policy if exists "Sellers manage own image records" on public.product_images;
create policy "Sellers manage own image records" on public.product_images
  for all to authenticated using (public.owns_marketplace_product(product_id))
  with check (public.owns_marketplace_product(product_id));

create policy "Sellers read all own product options" on public.product_variants
  for select to authenticated using (public.owns_marketplace_product(product_id));

create policy "Sellers read all own product categories" on public.product_categories
  for select to authenticated using (public.owns_marketplace_product(product_id));

create policy "Sellers delete own product image files" on storage.objects
  for delete to authenticated using (
    bucket_id = 'product-images'
    and exists (
      select 1 from public.seller_stores store
      where store.owner_id = (select auth.uid()) and store.id::text = (storage.foldername(name))[1]
    )
  );

create policy "Active product stock is public" on public.inventory_levels
  for select to anon, authenticated using (
    exists (
      select 1 from public.product_variants variant
      join public.products product on product.id = variant.product_id
      where variant.id = variant_id and variant.is_active and product.status = 'active'
    )
  );

comment on function public.update_seller_product(uuid, text, text, text, text, text, text, jsonb, bigint, jsonb)
  is 'Allows an approved seller to update only products they own, including active listing details, options, prices, and stock.';
