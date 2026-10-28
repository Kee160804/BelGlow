-- Expand BelGlow's real marketplace taxonomy for its women-only catalog.
-- Categories remain ordinary admin-managed rows: admins may rename, hide,
-- restore, add, or delete them from the Categories screen.

insert into public.categories (name, slug, description, sort_order, is_active)
values
  ('Nail Care', 'nail-care', 'Polish, treatments, tools, and finishing touches for manicures and pedicures.', 120, true),
  ('Feminine & Intimate Care', 'feminine-intimate-care', 'Thoughtful everyday products for intimate comfort, freshness, and menstrual care.', 130, true),
  ('Sun & Tropical Care', 'sun-tropical-care', 'Sun protection, after-sun comfort, and outdoor skin essentials for tropical living.', 140, true),
  ('Protective Hair & Extensions', 'protective-hair-extensions', 'Hair, care products, and accessories for wigs, braids, locs, and extensions.', 150, true),
  ('Home Fragrance & Relaxation', 'home-fragrance-relaxation', 'Home scents and calming essentials for a restorative space.', 160, true),
  ('Women''s Wellness', 'womens-wellness', 'Self-care and wellness essentials for every stage of a woman''s life.', 170, true)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  is_active = true;

with subcategories(parent_slug, name, slug, description, sort_order) as (
  values
    ('nail-care', 'Nail Polish', 'nail-polish', 'Classic color and specialty nail finishes.', 10),
    ('nail-care', 'Press-On Nails', 'press-on-nails', 'Ready-to-wear manicure sets in reusable and single-wear styles.', 20),
    ('nail-care', 'Gel Nails', 'gel-nails', 'Gel colors, systems, and manicure essentials.', 30),
    ('nail-care', 'Nail Treatments', 'nail-treatments', 'Strengtheners, repair treatments, and nail care.', 40),
    ('nail-care', 'Manicure & Pedicure Tools', 'manicure-pedicure-tools', 'Tools for shaping, grooming, and at-home nail care.', 50),
    ('nail-care', 'Nail Art', 'nail-art', 'Decorations, decals, gems, and creative nail accessories.', 60),

    ('feminine-intimate-care', 'Feminine Wash', 'feminine-wash', 'Gentle cleansers designed for intimate care.', 10),
    ('feminine-intimate-care', 'Intimate Wipes', 'intimate-wipes', 'Convenient wipes for gentle personal freshness.', 20),
    ('feminine-intimate-care', 'Menstrual Care', 'menstrual-care', 'Period products and everyday menstrual essentials.', 30),
    ('feminine-intimate-care', 'Intimate Moisturizers', 'intimate-moisturizers', 'Products for intimate comfort and moisture.', 40),
    ('feminine-intimate-care', 'Personal Freshness', 'personal-freshness', 'Everyday personal freshness products.', 50),
    ('feminine-intimate-care', 'Period Self-Care', 'period-self-care', 'Comforting self-care products for period days.', 60),

    ('sun-tropical-care', 'Face Sunscreen', 'face-sunscreen', 'Daily facial sun protection in skin-friendly formulas.', 10),
    ('sun-tropical-care', 'Body Sunscreen', 'body-sunscreen', 'Broad body protection for sunny days.', 20),
    ('sun-tropical-care', 'After-Sun Care', 'after-sun-care', 'Cooling and moisturizing care after sun exposure.', 30),
    ('sun-tropical-care', 'Aloe Relief', 'aloe-relief', 'Soothing aloe products for sun-exposed skin.', 40),
    ('sun-tropical-care', 'Insect Repellent', 'insect-repellent', 'Outdoor protection for tropical conditions.', 50),
    ('sun-tropical-care', 'Outdoor Skin Care', 'outdoor-skin-care', 'Skin essentials made for heat, humidity, and outdoor activities.', 60),

    ('protective-hair-extensions', 'Braiding Hair', 'braiding-hair', 'Hair made for braids and protective styles.', 10),
    ('protective-hair-extensions', 'Wigs', 'wigs', 'Ready-to-wear and customizable wigs.', 20),
    ('protective-hair-extensions', 'Extensions', 'hair-extensions', 'Hair extensions for added length, volume, and styling.', 30),
    ('protective-hair-extensions', 'Loc Care', 'loc-care', 'Cleansing, moisturizing, and styling care for locs.', 40),
    ('protective-hair-extensions', 'Braid Care', 'braid-care', 'Scalp and style maintenance for braided hair.', 50),
    ('protective-hair-extensions', 'Wig Care', 'wig-care', 'Cleansing, conditioning, and styling products for wigs.', 60),
    ('protective-hair-extensions', 'Hair Adhesives', 'hair-adhesives', 'Adhesives, removers, and hold products for wig installation.', 70),
    ('protective-hair-extensions', 'Hair Jewelry', 'hair-jewelry', 'Beads, cuffs, charms, and decorative hair pieces.', 80),

    ('home-fragrance-relaxation', 'Candles', 'candles', 'Scented candles for ambiance and relaxation.', 10),
    ('home-fragrance-relaxation', 'Room Sprays', 'room-sprays', 'Instant fragrance for rooms and living spaces.', 20),
    ('home-fragrance-relaxation', 'Reed Diffusers', 'reed-diffusers', 'Flameless, continuous fragrance for the home.', 30),
    ('home-fragrance-relaxation', 'Linen Sprays', 'linen-sprays', 'Light fragrance for linens, bedding, and fabrics.', 40),
    ('home-fragrance-relaxation', 'Incense', 'incense', 'Fragrant incense for mood and mindful rituals.', 50),
    ('home-fragrance-relaxation', 'Aromatherapy', 'aromatherapy', 'Aromatic products that support calming self-care rituals.', 60),

    ('womens-wellness', 'Massage Oils', 'massage-oils', 'Oils for massage, relaxation, and body rituals.', 10),
    ('womens-wellness', 'Essential Oils', 'essential-oils', 'Concentrated aromatic oils for personal wellness routines.', 20),
    ('womens-wellness', 'Sleep & Relaxation', 'sleep-relaxation', 'Products that support calming evening and rest routines.', 30),
    ('womens-wellness', 'Menopause Care', 'menopause-care', 'Comfort and self-care products for the menopause journey.', 40),
    ('womens-wellness', 'Pregnancy & Postpartum Care', 'pregnancy-postpartum-care', 'Self-care essentials for pregnancy and postpartum recovery.', 50),
    ('womens-wellness', 'Wellness Supplements', 'wellness-supplements', 'Women-focused supplements offered in accordance with local requirements.', 60)
)
insert into public.categories (parent_id, name, slug, description, sort_order, is_active)
select parent.id, child.name, child.slug, child.description, child.sort_order, true
from subcategories child
join public.categories parent on parent.slug = child.parent_slug
on conflict (slug) do update set
  parent_id = excluded.parent_id,
  name = excluded.name,
  description = excluded.description,
  is_active = true;

-- Keep any existing product relationships intact while removing the men's
-- department from all public and seller-facing category selectors.
update public.categories
set is_active = false
where slug = 'mens-care'
   or parent_id = (select id from public.categories where slug = 'mens-care');
