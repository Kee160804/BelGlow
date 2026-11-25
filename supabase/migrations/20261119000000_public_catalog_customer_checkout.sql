-- Public listing visibility is independent of application account role.
-- Visitors can browse approved, active listings and their availability;
-- placing an order requires an authenticated customer-capable account.
begin;

grant select on public.inventory_levels to anon, authenticated;

drop policy if exists "Active products are public" on public.products;
create policy "Active approved marketplace products are public"
  on public.products for select to anon, authenticated
  using (
    status = 'active'
    and (
      seller_store_id is null
      or (
        review_status = 'approved'
        and exists (
          select 1 from public.seller_stores store
          where store.id = seller_store_id and store.status = 'approved'
        )
      )
    )
  );

drop policy if exists "Active variants are public" on public.product_variants;
create policy "Variants of public products are public"
  on public.product_variants for select to anon, authenticated
  using (
    is_active and exists (
      select 1 from public.products product
      where product.id = product_id
        and product.status = 'active'
        and (
          product.seller_store_id is null
          or (
            product.review_status = 'approved'
            and exists (
              select 1 from public.seller_stores store
              where store.id = product.seller_store_id and store.status = 'approved'
            )
          )
        )
    )
  );

drop policy if exists "Active product category links are public" on public.product_categories;
create policy "Categories of public products are public"
  on public.product_categories for select to anon, authenticated
  using (
    exists (
      select 1 from public.products product
      where product.id = product_id
        and product.status = 'active'
        and (
          product.seller_store_id is null
          or (
            product.review_status = 'approved'
            and exists (
              select 1 from public.seller_stores store
              where store.id = product.seller_store_id and store.status = 'approved'
            )
          )
        )
    )
  );

drop policy if exists "Product images are public" on public.product_images;
create policy "Images of public products are public"
  on public.product_images for select to anon, authenticated
  using (
    exists (
      select 1 from public.products product
      where product.id = product_id
        and product.status = 'active'
        and (
          product.seller_store_id is null
          or (
            product.review_status = 'approved'
            and exists (
              select 1 from public.seller_stores store
              where store.id = product.seller_store_id and store.status = 'approved'
            )
          )
        )
    )
  );

drop policy if exists "Active product stock is public" on public.inventory_levels;
create policy "Stock of public products is visible"
  on public.inventory_levels for select to anon, authenticated
  using (
    exists (
      select 1 from public.product_variants variant
      join public.products product on product.id = variant.product_id
      where variant.id = variant_id
        and variant.is_active
        and product.status = 'active'
        and (
          product.seller_store_id is null
          or (
            product.review_status = 'approved'
            and exists (
              select 1 from public.seller_stores store
              where store.id = product.seller_store_id and store.status = 'approved'
            )
          )
        )
    )
  );

-- An administrator's broader RLS permissions must not make unpublished or
-- suspended-store listings appear in the public shop RPC.
create or replace function public.get_public_catalog()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(catalog.item order by catalog.created_at desc), '[]'::jsonb)
  from (
    select product.created_at, jsonb_build_object(
      'id', product.id,
      'sellerStoreId', product.seller_store_id,
      'slug', product.slug,
      'name', product.name,
      'shortDescription', product.short_description,
      'description', product.description,
      'ingredients', product.ingredients,
      'usageInstructions', product.usage_instructions,
      'attributes', product.attributes,
      'basePriceCents', product.base_price_cents,
      'compareAtPriceCents', product.compare_at_price_cents,
      'sellerName', store.name,
      'sellerSlug', store.slug,
      'category', coalesce((
        select category.name from public.product_categories link
        join public.categories category on category.id = link.category_id
        where link.product_id = product.id and link.is_primary and category.is_active
        limit 1
      ), 'Beauty'),
      'images', coalesce((
        select jsonb_agg(image.storage_path order by image.is_primary desc, image.sort_order)
        from public.product_images image where image.product_id = product.id
      ), '[]'::jsonb),
      'variants', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', variant.id,
          'name', variant.name,
          'priceCents', coalesce(variant.price_cents, product.base_price_cents),
          'stock', coalesce((
            select sum(greatest(level.quantity_on_hand - level.quantity_reserved, 0))
            from public.inventory_levels level where level.variant_id = variant.id
          ), 0)
        ) order by variant.sort_order)
        from public.product_variants variant
        where variant.product_id = product.id and variant.is_active
      ), '[]'::jsonb),
      'ratingAverage', (
        select round(avg(review.rating)::numeric, 1) from public.reviews review
        where review.product_id = product.id and review.is_approved
      ),
      'ratingCount', (
        select count(*) from public.reviews review
        where review.product_id = product.id and review.is_approved
      )
    ) as item
    from public.products product
    left join public.seller_stores store on store.id = product.seller_store_id
    where product.status = 'active'
      and (
        product.seller_store_id is null
        or (product.review_status = 'approved' and store.status = 'approved')
      )
  ) catalog;
$$;
revoke execute on function public.get_public_catalog() from public;
grant execute on function public.get_public_catalog() to anon, authenticated;

-- Prevent anonymous callers from bypassing the account requirement by
-- invoking checkout RPCs directly with the public Supabase key.
revoke execute on function public.create_marketplace_order_v2(jsonb, text, text, jsonb, text, text, text, text, uuid)
  from public, anon;
grant execute on function public.create_marketplace_order_v2(jsonb, text, text, jsonb, text, text, text, text, uuid)
  to authenticated;
revoke execute on function public.create_marketplace_order(jsonb, text, text, jsonb, text, text, text, text, uuid)
  from public, anon;
grant execute on function public.create_marketplace_order(jsonb, text, text, jsonb, text, text, text, text, uuid)
  to authenticated;

notify pgrst, 'reload schema';
commit;
