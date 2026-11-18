-- Remove only the synthetic payment-test catalog created by
-- 20261029010000_payment_demo_catalog.sql. Seller-created products are left
-- alone, including products created by a testing account.
begin;

delete from public.products as product
where product.slug like 'payment-demo-%'
  and product.attributes ->> 'demo' = 'true'
  and product.attributes ->> 'payment_test' = 'true';

-- The demo seeder only inserted this placeholder when a store had no payment
-- profile. Delete it only if its identifying fields still exactly match the
-- generated placeholder, preserving any real profile saved afterward.
delete from public.seller_payment_profiles as profile
where profile.bank_name = 'Belize Bank (DEMO ONLY)'
  and profile.account_number = '0000000000-DEMO'
  and profile.account_type = 'Demo account'
  and profile.instructions like 'TEST MODE ONLY%';

-- Remove the demo-only location after its demo inventory rows were cascaded
-- away with the demo variants. If anything still references it, preserve it.
delete from public.inventory_locations as location
where location.code = 'PAYMENT-DEMO'
  and not exists (
    select 1 from public.inventory_levels as level
    where level.location_id = location.id
  );

-- Stop future recreation of the demo catalog from either the admin UI or
-- another privileged caller.
drop function if exists public.admin_seed_payment_demo_products();
drop function if exists public.seed_payment_demo_products(uuid);

notify pgrst, 'reload schema';
commit;
