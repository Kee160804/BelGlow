-- Reproducible development data for the current BelGlow storefront.
-- This file contains catalog data only; never add real customer information.

insert into public.brands (id, name, slug, description, is_active)
values (
  '10000000-0000-4000-8000-000000000001',
  'BelGlow',
  'belglow',
  'Belizean beauty and self-care, naturally you.',
  true
)
on conflict (slug) do nothing;

insert into public.categories (name, slug, description, sort_order)
values
  ('Face Care', 'face-care', 'Daily essentials and targeted care for healthy, radiant skin.', 10),
  ('Body Care', 'body-care', 'Nourishing care from shoulders to toes.', 20),
  ('Hair Care', 'hair-care', 'Moisture, growth, protection, and styling for every texture.', 30),
  ('Bath & Shower', 'bath-shower', 'Turn every bath and shower into a calming ritual.', 40),
  ('Beauty & Cosmetics', 'beauty-cosmetics', 'Everyday color and finishing touches that celebrate you.', 50),
  ('Fragrance', 'fragrance', 'Personal scents for every mood and moment.', 60),
  ('Men''s Care', 'mens-care', 'Simple grooming essentials for skin, hair, and beard.', 70),
  ('Baby & Gentle Care', 'baby-gentle-care', 'Comforting formulas for babies and sensitive skin.', 80),
  ('Natural & Herbal Care', 'natural-herbal-care', 'Tropical botanicals inspired by Belizean nature.', 90),
  ('Beauty Accessories', 'beauty-accessories', 'Tools and accessories that complete every routine.', 100),
  ('Sets & Bundles', 'sets-bundles', 'Curated routines, thoughtful gifts, and easy starter kits.', 110)
on conflict (slug) do nothing;

with subcategories(parent_slug, name, slug, sort_order) as (
  values
    ('face-care', 'Facial Cleansers', 'facial-cleansers', 10),
    ('face-care', 'Face Wash', 'face-wash', 20),
    ('face-care', 'Toners', 'toners', 30),
    ('face-care', 'Serums', 'serums', 40),
    ('face-care', 'Moisturizers', 'moisturizers', 50),
    ('face-care', 'Face Creams', 'face-creams', 60),
    ('face-care', 'Facial Oils', 'facial-oils', 70),
    ('face-care', 'Face Masks', 'face-masks', 80),
    ('face-care', 'Exfoliators & Scrubs', 'face-exfoliators-scrubs', 90),
    ('face-care', 'Acne Care', 'acne-care', 100),
    ('face-care', 'Eye Creams', 'eye-creams', 110),
    ('face-care', 'Lip Care', 'lip-care', 120),
    ('face-care', 'Sunscreen & SPF', 'sunscreen-spf', 130),
    ('body-care', 'Body Lotion', 'body-lotion', 10),
    ('body-care', 'Body Cream', 'body-cream', 20),
    ('body-care', 'Body Butter', 'body-butter', 30),
    ('body-care', 'Body Oil', 'body-oil', 40),
    ('body-care', 'Body Wash', 'body-wash', 50),
    ('body-care', 'Shower Gel', 'shower-gel', 60),
    ('body-care', 'Body Scrub', 'body-scrub', 70),
    ('body-care', 'Body Mist', 'body-mist', 80),
    ('body-care', 'Hand Cream', 'hand-cream', 90),
    ('body-care', 'Foot Cream', 'foot-cream', 100),
    ('body-care', 'Deodorant', 'deodorant', 110),
    ('body-care', 'Soaps', 'soaps', 120),
    ('hair-care', 'Shampoo', 'shampoo', 10),
    ('hair-care', 'Conditioner', 'conditioner', 20),
    ('hair-care', 'Hair Oil', 'hair-oil', 30),
    ('hair-care', 'Hair Moisturizer', 'hair-moisturizer', 40),
    ('hair-care', 'Leave-In Conditioner', 'leave-in-conditioner', 50),
    ('hair-care', 'Hair Masks & Treatments', 'hair-masks-treatments', 60),
    ('hair-care', 'Scalp Oil', 'scalp-oil', 70),
    ('hair-care', 'Edge Control', 'edge-control', 80),
    ('hair-care', 'Styling Gel', 'styling-gel', 90),
    ('hair-care', 'Curl Cream', 'curl-cream', 100),
    ('hair-care', 'Hair Growth', 'hair-growth', 110),
    ('hair-care', 'Heat Protectant', 'heat-protectant', 120),
    ('bath-shower', 'Bar Soap', 'bar-soap', 10),
    ('bath-shower', 'Liquid Soap', 'liquid-soap', 20),
    ('bath-shower', 'Bath Salts', 'bath-salts', 30),
    ('bath-shower', 'Bath Bombs', 'bath-bombs', 40),
    ('bath-shower', 'Shower Oils', 'shower-oils', 50),
    ('bath-shower', 'Bubble Bath', 'bubble-bath', 60),
    ('bath-shower', 'Exfoliating Products', 'bath-exfoliating-products', 70),
    ('beauty-cosmetics', 'Foundation', 'foundation', 10),
    ('beauty-cosmetics', 'Concealer', 'concealer', 20),
    ('beauty-cosmetics', 'Powder', 'powder', 30),
    ('beauty-cosmetics', 'Blush', 'blush', 40),
    ('beauty-cosmetics', 'Lip Gloss', 'lip-gloss', 50),
    ('beauty-cosmetics', 'Lipstick', 'lipstick', 60),
    ('beauty-cosmetics', 'Mascara', 'mascara', 70),
    ('beauty-cosmetics', 'Eyeliner', 'eyeliner', 80),
    ('beauty-cosmetics', 'Eyebrow Products', 'eyebrow-products', 90),
    ('beauty-cosmetics', 'Setting Spray', 'setting-spray', 100),
    ('fragrance', 'Perfumes', 'perfumes', 10),
    ('fragrance', 'Body Sprays', 'body-sprays', 20),
    ('fragrance', 'Fragrance Body Mists', 'fragrance-body-mists', 30),
    ('fragrance', 'Perfume Oils', 'perfume-oils', 40),
    ('fragrance', 'Fragrance Sets', 'fragrance-sets', 50),
    ('mens-care', 'Beard Oil', 'beard-oil', 10),
    ('mens-care', 'Beard Balm', 'beard-balm', 20),
    ('mens-care', 'Shaving Cream', 'shaving-cream', 30),
    ('mens-care', 'Aftershave', 'aftershave', 40),
    ('mens-care', 'Men''s Moisturizer', 'mens-moisturizer', 50),
    ('mens-care', 'Men''s Face Wash', 'mens-face-wash', 60),
    ('mens-care', 'Men''s Body Wash', 'mens-body-wash', 70),
    ('mens-care', 'Men''s Hair Products', 'mens-hair-products', 80),
    ('baby-gentle-care', 'Baby Lotion', 'baby-lotion', 10),
    ('baby-gentle-care', 'Baby Oil', 'baby-oil', 20),
    ('baby-gentle-care', 'Gentle Wash', 'gentle-wash', 30),
    ('baby-gentle-care', 'Baby Shampoo', 'baby-shampoo', 40),
    ('baby-gentle-care', 'Sensitive-Skin Products', 'sensitive-skin-products', 50),
    ('natural-herbal-care', 'Aloe Products', 'aloe-products', 10),
    ('natural-herbal-care', 'Coconut Oil', 'coconut-oil', 20),
    ('natural-herbal-care', 'Castor Oil', 'castor-oil', 30),
    ('natural-herbal-care', 'Moringa Products', 'moringa-products', 40),
    ('natural-herbal-care', 'Turmeric Products', 'turmeric-products', 50),
    ('natural-herbal-care', 'Herbal Oils', 'herbal-oils', 60),
    ('natural-herbal-care', 'Natural Soaps', 'natural-soaps', 70),
    ('natural-herbal-care', 'Botanical Skincare', 'botanical-skincare', 80),
    ('beauty-accessories', 'Facial Rollers', 'facial-rollers', 10),
    ('beauty-accessories', 'Gua Sha', 'gua-sha', 20),
    ('beauty-accessories', 'Brushes', 'brushes', 30),
    ('beauty-accessories', 'Combs', 'combs', 40),
    ('beauty-accessories', 'Hair Bonnets', 'hair-bonnets', 50),
    ('beauty-accessories', 'Shower Caps', 'shower-caps', 60),
    ('beauty-accessories', 'Makeup Brushes', 'makeup-brushes', 70),
    ('beauty-accessories', 'Cosmetic Bags', 'cosmetic-bags', 80),
    ('beauty-accessories', 'Applicators', 'applicators', 90),
    ('beauty-accessories', 'Skincare Tools', 'skincare-tools', 100),
    ('sets-bundles', 'Skincare Sets', 'skincare-sets', 10),
    ('sets-bundles', 'Haircare Sets', 'haircare-sets', 20),
    ('sets-bundles', 'Body-Care Sets', 'body-care-sets', 30),
    ('sets-bundles', 'Gift Boxes', 'gift-boxes', 40),
    ('sets-bundles', 'Travel Sets', 'travel-sets', 50),
    ('sets-bundles', 'Starter Kits', 'starter-kits', 60),
    ('sets-bundles', 'Seasonal Bundles', 'seasonal-bundles', 70)
)
insert into public.categories (parent_id, name, slug, sort_order)
select parent.id, child.name, child.slug, child.sort_order
from subcategories child
join public.categories parent on parent.slug = child.parent_slug
on conflict (slug) do nothing;

with catalog(name, slug, category_slug, price_cents, featured, description) as (
  values
    ('Pink Peptide Serum', 'pink-peptide-serum', 'face-care', 2800, true, 'A lightweight peptide serum for a smooth, healthy-looking glow.'),
    ('Tropical Body Butter', 'tropical-body-butter', 'body-care', 2400, true, 'Rich tropical moisture for soft, nourished skin.'),
    ('Moringa Curl Cream', 'moringa-curl-cream', 'hair-care', 2200, true, 'Defines and hydrates curls with moringa-inspired care.'),
    ('Island Bloom Body Mist', 'island-bloom-body-mist', 'fragrance', 2000, true, 'A fresh floral body mist inspired by island blooms.'),
    ('Petal Shine Lip Gloss', 'petal-shine-lip-gloss', 'beauty-cosmetics', 1400, false, 'Comfortable shine with a soft petal tint.'),
    ('Coconut Shower Oil', 'coconut-shower-oil', 'bath-shower', 1900, false, 'A silky shower oil for cleansed, comforted skin.'),
    ('Aloe & Turmeric Glow Oil', 'aloe-turmeric-glow-oil', 'natural-herbal-care', 2600, false, 'A tropical botanical oil for a radiant-looking finish.'),
    ('BelGlow Self-Care Set', 'belglow-self-care-set', 'sets-bundles', 4800, false, 'A curated collection of BelGlow favorites.'),
    ('Brightening Face Cleanser', 'brightening-face-cleanser', 'face-care', 1800, false, 'A gentle everyday cleanser that refreshes without stripping.'),
    ('Cocoa Glow Body Oil', 'cocoa-glow-body-oil', 'body-care', 2100, false, 'A lightweight cocoa-inspired body oil.'),
    ('Castor Scalp Treatment', 'castor-scalp-treatment', 'hair-care', 2400, false, 'Targeted scalp nourishment for a healthy hair routine.'),
    ('Wild Orchid Perfume Oil', 'wild-orchid-perfume-oil', 'fragrance', 3200, false, 'A concentrated floral perfume oil with warm island depth.'),
    ('Belize Sunset Blush', 'belize-sunset-blush', 'beauty-cosmetics', 1600, false, 'A warm, blendable blush inspired by Belizean sunsets.'),
    ('Pink Hibiscus Bath Salts', 'pink-hibiscus-bath-salts', 'bath-shower', 1700, false, 'Mineral bath salts for a calming floral soak.'),
    ('Gentle Baby Aloe Lotion', 'gentle-baby-aloe-lotion', 'baby-gentle-care', 1500, false, 'A simple, comforting lotion for delicate skin.'),
    ('Rose Quartz Facial Roller', 'rose-quartz-facial-roller', 'beauty-accessories', 2500, false, 'A cooling facial massage tool for daily rituals.')
)
insert into public.products (
  brand_id, name, slug, short_description, description, status,
  base_price_cents, currency, is_featured, published_at
)
select
  brand.id, item.name, item.slug, item.description, item.description,
  'active'::public.product_status, item.price_cents, 'BZD', item.featured, now()
from catalog item
cross join public.brands brand
where brand.slug = 'belglow'
on conflict (slug) do nothing;

with mappings(product_slug, category_slug) as (
  values
    ('pink-peptide-serum', 'face-care'),
    ('tropical-body-butter', 'body-care'),
    ('moringa-curl-cream', 'hair-care'),
    ('island-bloom-body-mist', 'fragrance'),
    ('petal-shine-lip-gloss', 'beauty-cosmetics'),
    ('coconut-shower-oil', 'bath-shower'),
    ('aloe-turmeric-glow-oil', 'natural-herbal-care'),
    ('belglow-self-care-set', 'sets-bundles'),
    ('brightening-face-cleanser', 'face-care'),
    ('cocoa-glow-body-oil', 'body-care'),
    ('castor-scalp-treatment', 'hair-care'),
    ('wild-orchid-perfume-oil', 'fragrance'),
    ('belize-sunset-blush', 'beauty-cosmetics'),
    ('pink-hibiscus-bath-salts', 'bath-shower'),
    ('gentle-baby-aloe-lotion', 'baby-gentle-care'),
    ('rose-quartz-facial-roller', 'beauty-accessories')
)
insert into public.product_categories (product_id, category_id, is_primary)
select product.id, category.id, true
from mappings map
join public.products product on product.slug = map.product_slug
join public.categories category on category.slug = map.category_slug
on conflict (product_id, category_id) do nothing;

with variants(product_slug, sku, weight_grams) as (
  values
    ('pink-peptide-serum', 'BG-SERUM-30', 120),
    ('tropical-body-butter', 'BG-BUTTER-200', 250),
    ('moringa-curl-cream', 'BG-CURL-200', 230),
    ('island-bloom-body-mist', 'BG-MIST-120', 180),
    ('petal-shine-lip-gloss', 'BG-GLOSS-01', 40),
    ('coconut-shower-oil', 'BG-SHOWER-200', 240),
    ('aloe-turmeric-glow-oil', 'BG-GLOWOIL-50', 130),
    ('belglow-self-care-set', 'BG-SET-01', 900),
    ('brightening-face-cleanser', 'BG-CLEANSER-100', 140),
    ('cocoa-glow-body-oil', 'BG-BODYOIL-120', 180),
    ('castor-scalp-treatment', 'BG-SCALP-60', 140),
    ('wild-orchid-perfume-oil', 'BG-PERFUME-30', 90),
    ('belize-sunset-blush', 'BG-BLUSH-01', 50),
    ('pink-hibiscus-bath-salts', 'BG-SALTS-300', 330),
    ('gentle-baby-aloe-lotion', 'BG-BABY-200', 230),
    ('rose-quartz-facial-roller', 'BG-ROLLER-01', 150)
)
insert into public.product_variants (product_id, sku, name, weight_grams)
select product.id, variant.sku, 'Default', variant.weight_grams
from variants variant
join public.products product on product.slug = variant.product_slug
on conflict (sku) do nothing;

insert into public.product_images (product_id, storage_path, alt_text, is_primary)
select product.id, 'products/belglow-hero-products.png', product.name, true
from public.products product
where product.brand_id = (select id from public.brands where slug = 'belglow')
  and not exists (
    select 1 from public.product_images image
    where image.product_id = product.id and image.is_primary and image.variant_id is null
  );

insert into public.inventory_locations (id, name, code, address)
values (
  '20000000-0000-4000-8000-000000000001',
  'BelGlow Main Stock',
  'BZE-MAIN',
  '{"country_code":"BZ"}'::jsonb
)
on conflict (code) do nothing;

insert into public.inventory_levels (variant_id, location_id, quantity_on_hand, reorder_point)
select variant.id, location.id, 25, 5
from public.product_variants variant
cross join public.inventory_locations location
where location.code = 'BZE-MAIN'
on conflict (variant_id, location_id) do nothing;

insert into public.shipping_methods (
  name, code, description, price_cents, estimated_days_min, estimated_days_max, sort_order
)
values
  ('Belize City Delivery', 'BZE-CITY', 'Local delivery within Belize City.', 500, 1, 2, 10),
  ('District Delivery', 'BZ-DISTRICT', 'Delivery to supported locations across Belize.', 1200, 2, 5, 20),
  ('Store Pickup', 'PICKUP', 'Collect your order from the BelGlow pickup location.', 0, 0, 1, 30)
on conflict (code) do nothing;
