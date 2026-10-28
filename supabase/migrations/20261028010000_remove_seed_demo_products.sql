-- BelGlow is a seller-driven marketplace. Products must be created through
-- approved seller accounts, never from development seed data.
-- Restrict cleanup to the exact legacy seed slugs and unowned platform rows so
-- a seller-created product can never be removed by this migration.

delete from public.products
where seller_store_id is null
  and slug in (
    'pink-peptide-serum',
    'tropical-body-butter',
    'moringa-curl-cream',
    'island-bloom-body-mist',
    'petal-shine-lip-gloss',
    'coconut-shower-oil',
    'aloe-turmeric-glow-oil',
    'belglow-self-care-set',
    'brightening-face-cleanser',
    'cocoa-glow-body-oil',
    'castor-scalp-treatment',
    'wild-orchid-perfume-oil',
    'belize-sunset-blush',
    'pink-hibiscus-bath-salts',
    'gentle-baby-aloe-lotion',
    'rose-quartz-facial-roller'
  );
