-- Idempotent payment-test catalog: one active product for every active
-- top-level category. Demo records use a dedicated slug/SKU prefix so they are
-- easy to identify and remove after payment testing.

create or replace function public.seed_payment_demo_products(target_store_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  store_row public.seller_stores%rowtype;
  category_row public.categories%rowtype;
  demo_location_id uuid;
  demo_product_id uuid;
  demo_variant_id uuid;
  product_count integer := 0;
  demo_price bigint;
begin
  select * into store_row from public.seller_stores
  where id = target_store_id and status = 'approved';
  if store_row.id is null then raise exception 'Choose an approved seller store'; end if;

  insert into public.seller_payment_profiles(
    seller_store_id, bank_name, account_name, account_number, account_type, instructions, is_active
  ) values (
    store_row.id,
    'Belize Bank (DEMO ONLY)',
    store_row.name || ' Payment Test',
    '0000000000-DEMO',
    'Demo account',
    'TEST MODE ONLY — do not transfer real money. Upload a sample receipt to test seller verification.',
    true
  ) on conflict (seller_store_id) do nothing;

  insert into public.inventory_locations(name, code, address, is_active)
  values ('Payment Demo Inventory', 'PAYMENT-DEMO', '{"country_code":"BZ","demo":true}'::jsonb, true)
  on conflict (code) do update set is_active = true
  returning id into demo_location_id;
  if demo_location_id is null then
    select location.id into demo_location_id
    from public.inventory_locations location
    where location.code = 'PAYMENT-DEMO';
  end if;

  for category_row in
    select * from public.categories
    where parent_id is null and is_active
    order by sort_order, name
  loop
    demo_price := 1000 + least(category_row.sort_order, 900);
    insert into public.products(
      seller_store_id, name, slug, short_description, description, status,
      review_status, reviewed_by, reviewed_at, base_price_cents, currency,
      attributes, is_featured, published_at
    ) values (
      store_row.id,
      category_row.name || ' Payment Demo',
      'payment-demo-' || category_row.slug,
      'Demo product for testing seller-direct bank transfers and receipt verification.',
      'TEST PRODUCT — no real item will be fulfilled. Use this listing to test checkout, seller bank instructions, receipt upload, payment confirmation email, and BelGlow commission recording.',
      'active', 'approved', store_row.owner_id, now(), demo_price, 'BZD',
      jsonb_build_object('demo', true, 'payment_test', true, 'category_slug', category_row.slug),
      false, now()
    )
    on conflict (slug) do update set
      seller_store_id = excluded.seller_store_id,
      name = excluded.name,
      short_description = excluded.short_description,
      description = excluded.description,
      status = 'active',
      review_status = 'approved',
      reviewed_by = excluded.reviewed_by,
      reviewed_at = now(),
      base_price_cents = excluded.base_price_cents,
      attributes = excluded.attributes,
      published_at = coalesce(public.products.published_at, now()),
      updated_at = now()
    returning id into demo_product_id;

    insert into public.product_categories(product_id, category_id, is_primary)
    values (demo_product_id, category_row.id, true)
    on conflict (product_id, category_id) do update set is_primary = true;

    insert into public.product_variants(product_id, sku, name, price_cents, attributes, is_active)
    values (
      demo_product_id,
      'DEMO-' || upper(replace(category_row.slug, '-', '_')),
      'Demo option',
      demo_price,
      '{"demo":true}'::jsonb,
      true
    )
    on conflict (sku) do update set
      product_id = excluded.product_id,
      name = excluded.name,
      price_cents = excluded.price_cents,
      attributes = excluded.attributes,
      is_active = true,
      updated_at = now()
    returning id into demo_variant_id;

    insert into public.inventory_levels(variant_id, location_id, quantity_on_hand, quantity_reserved, reorder_point)
    values (demo_variant_id, demo_location_id, 25, 0, 5)
    on conflict (variant_id, location_id) do update set
      quantity_on_hand = greatest(public.inventory_levels.quantity_on_hand, public.inventory_levels.quantity_reserved + 25),
      updated_at = now();

    product_count := product_count + 1;
  end loop;
  return product_count;
end;
$$;
revoke execute on function public.seed_payment_demo_products(uuid) from public, anon, authenticated;
grant execute on function public.seed_payment_demo_products(uuid) to service_role;

create or replace function public.admin_seed_payment_demo_products()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  store_id uuid;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  store_id := public.ensure_admin_seller_store();
  return public.seed_payment_demo_products(store_id);
end;
$$;
revoke execute on function public.admin_seed_payment_demo_products() from public, anon;
grant execute on function public.admin_seed_payment_demo_products() to authenticated;

-- Seed immediately when this project already has an approved store. A fresh
-- project can create the same catalog later from the admin Categories screen.
do $$
declare
  store_id uuid;
begin
  select id into store_id from public.seller_stores
  where status = 'approved'
  order by case when name = 'BelGlow Official Store' then 0 else 1 end, created_at
  limit 1;
  if store_id is not null then
    perform public.seed_payment_demo_products(store_id);
  else
    raise notice 'Payment demo products were not seeded because no approved seller store exists yet.';
  end if;
end;
$$;

comment on function public.admin_seed_payment_demo_products() is
  'Creates or refreshes one clearly labeled payment-test product per active top-level category.';
