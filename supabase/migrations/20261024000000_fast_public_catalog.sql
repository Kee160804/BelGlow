-- Return the public storefront catalog in one request instead of a client-side
-- waterfall across products, categories, variants, inventory, images, reviews,
-- and stores. The function is security invoker, so existing RLS still applies.
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
  ) catalog;
$$;

revoke execute on function public.get_public_catalog() from public;
grant execute on function public.get_public_catalog() to anon, authenticated;
