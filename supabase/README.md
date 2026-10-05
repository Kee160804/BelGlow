# BelGlow Supabase database

This directory contains a migration-ready PostgreSQL design for the BelGlow multi-vendor beauty and self-care marketplace.

## Included domains

- Supabase Auth-linked customer profiles and delivery addresses
- Hierarchical departments and subcategories
- Brands, products, variants, product images, and searchable catalog fields
- Multi-location inventory with reserved-stock tracking
- Saved-product wishlists and signed-in carts
- Orders, immutable order-item snapshots, fulfillment history, and payments
- Shipping methods, promotions, redemptions, and customer reviews
- Product interaction events and category preference scores for recommendations
- Row-level security policies and least-privilege grants
- Auth trigger that creates a profile and default wishlist after signup
- Development seed data matching the current storefront
- Seller applications, storefronts, listing approval, and per-seller commission overrides
- Seller sub-orders, immutable commission snapshots, balances, and payout records

## Important design decisions

- Prices use integer cents in BZD. For example, `BZ$28.00` is stored as `2800`.
- Product variants own SKUs and inventory. Products provide default display pricing.
- Order items retain names, SKUs, prices, and JSON snapshots so historical orders remain accurate after catalog edits.
- Shipping and billing addresses are copied into each order instead of referencing an address that a customer could later change.
- Direct browser code cannot create orders or payments. A future trusted server action or API must validate stock, calculate totals, create the order, and call the payment provider.
- Guest carts contain a server-generated `session_token`; they should be accessed through trusted server code rather than broad anonymous RLS policies.
- Payment payloads must be redacted metadata. Never store card numbers, security codes, provider secrets, or raw sensitive payment data.
- The default marketplace commission is `1500` basis points (15%). A store can have an admin-defined override. The effective rate and fee are copied onto each order item at checkout.
- One customer order can contain products from several sellers. `seller_orders` gives each seller an isolated fulfillment view without exposing another seller's items.
- `seller_ledger_entries` is the source of truth for balances. Do not calculate historical seller earnings using today's commission setting.

## Files

- `migrations/20261001000000_initial_belglow_schema.sql` creates the complete schema, triggers, grants, indexes, and RLS policies.
- `migrations/20261002000000_multivendor_marketplace.sql` adds seller onboarding, product moderation, commission splits, seller sub-orders, the balance ledger, and payouts.
- `migrations/20261003000000_marketplace_workflows.sql` adds server-validated seller product creation, marketplace reviews, commission settings, and cart RPCs.
- `migrations/20261005000000_admin_official_store_mode.sql` provisions the official BelGlow seller store for an admin without requiring an application.
- `migrations/20261006000000_independent_platform_admins.sql` stores admin privileges independently from seller/customer roles and enables secure admin-account management.
- `seed.sql` adds all current BelGlow departments, subcategories, storefront products, default variants, starter inventory, and shipping methods.

## Marketplace transaction flow

1. A customer account can shop immediately. A user who wants to sell creates one `seller_stores` application.
2. An admin approves the application and changes the user's profile role to `seller` through trusted server code.
3. The seller creates draft products and calls `submit_product_for_review(product_id)`. Submission freezes catalog content; only an admin can approve and activate the public listing or return it to draft.
4. Trusted checkout validates prices and stock, creates one customer order, and inserts its order items. The database snapshots the seller, commission rate, platform fee, and seller net on every item.
5. After all items exist, trusted code calls `finalize_seller_order_splits(order_id)` to create one fulfillment sub-order per seller.
6. A verified payment webhook records the paid payment and calls `post_paid_order_to_seller_ledger(order_id)`. The function is retry-safe and releases seller proceeds after the configured hold period.
7. Trusted payout code groups available, unpaid ledger credits into `seller_payouts`, sends the transfer through the payment provider, and posts a negative payout ledger entry only after provider confirmation.
8. A successful refund must append a negative refund ledger entry for the affected seller amount. Existing sale entries and order-item commission snapshots are never edited.

Seller and admin dashboards are views over this shared model; they must not be separate databases. Approval, checkout, payment webhook, refund, and payout mutations belong in server actions or route handlers using a server-only service-role client.

## Local setup

Install the Supabase CLI and initialize its configuration if this repository has not been initialized yet:

```powershell
npx supabase init
npx supabase start
npx supabase db reset
```

`db reset` recreates the local database, applies migrations in filename order, and then runs `supabase/seed.sql`.

Generate application types after the local database is running:

```powershell
npx supabase gen types typescript --local > lib/database.types.ts
```

When a hosted project is ready:

```powershell
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push --dry-run
npx supabase db push
```

Do not run a destructive remote reset against production. Seed data is intended for local, test, or explicitly disposable staging environments.

## Future Next.js integration

The expected public environment variables are:

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

Any secret/service-role key must remain server-only and must never use the `NEXT_PUBLIC_` prefix. Recommended application boundaries:

1. Browser client: public catalog reads and RLS-protected customer records.
2. Server client: checkout, guest-cart ownership, inventory reservation, payment webhooks, admin operations, and role changes.
3. Supabase Auth: email/password and Google sign-in; the database trigger creates the matching shopper profile and default wishlist. Seller access starts only after an approved seller application.

Before production launch, add payment-provider webhook handling, refund allocation, payout-provider transfers, transactional stock reservation, tax rules, delivery-zone validation, seller identity/bank verification, and automated database/RLS tests.

## Current application integration status

The application now uses Supabase Auth sessions instead of its demo localStorage identity. Email/password signup and login, Google OAuth redirect, email password recovery, seller applications, listing creation/review, product catalog reads, saved local cart contents, authenticated database carts, seller order fulfillment updates, inventory updates, and role-protected admin/seller routes are connected to the existing schema.

Browsing and guest checkout do not require a shopper account. Customer accounts are optional. Regular sellers use seller applications; admins do not apply or change roles. When an admin opens `/dashboard`, a protected database function automatically provisions or activates the BelGlow Official Store for that admin. The admin remains an admin, can switch between `/admin` and `/dashboard`, and can list BelGlow-owned products from the official store. Apply `20261005000000_admin_official_store_mode.sql` after previous migrations for this behavior.

Platform administrator privileges are stored independently in `platform_admins`; use the admin Settings page to grant/revoke access for existing account emails. Apply `20261006000000_independent_platform_admins.sql` after the official-store migration. It preserves profile admin/staff roles and bootstraps the BelGlow owner email configured in the migration. The database prevents removal of the last administrator.

Apply all migrations, including `20261003000000_marketplace_workflows.sql`, before using these screens against a Supabase project. Configure the Supabase Auth site URL and allowed redirect URLs for `/auth/callback` and `/auth/update-password`. Enable Google in Supabase Auth before offering that provider. Promote the first BelGlow administrator through a trusted Supabase SQL session; never allow users to select their own `admin` role.

The checkout page intentionally does not create orders or claim payments succeeded. The exact payment processor was not provided, and a Belize merchant needs a provider confirmed to support the platform's country, BZD or chosen settlement currency, marketplace split/commission collection, verified webhooks, refunds, and seller payouts. Do not accept real orders until that provider-specific integration is implemented and tested. The same external payout integration is required before money can be sent to sellers. See `.env.example` for the public and provider configuration variable names; actual credentials belong only in the ignored local `.env` or deployment secret store.

The seller and admin order/payout views can display existing database records, but some advanced operations (refunds, shipping labels, automated transfers, full tax calculation, and notification delivery) still require provider and business-policy configuration.
