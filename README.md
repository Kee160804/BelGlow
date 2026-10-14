# BelGlow Marketplace

BelGlow is a multi-vendor beauty marketplace built with Next.js 16, React 19, Tailwind CSS, and Supabase. Public shoppers may browse and place pay-on-delivery orders without an account. Accounts preserve carts, product wishlists, favorite businesses, addresses, and order history. Approved sellers manage listings, inventory, orders, customers, reviews, promotions, analytics, store profiles, and payouts. Platform administrators manage the entire marketplace.

## Local setup

1. Use Node.js 22 or later.
2. Install dependencies with `npm install`.
3. Configure `.env` with the Supabase project URL and keys.
4. Apply every SQL file in `supabase/migrations` in filename order.
5. Run `supabase/seed.sql` for the initial inventory location, delivery methods, categories, and optional sample catalog.
6. Start the app with `npm run dev`.

## Environment variables

- `NEXT_PUBLIC_SUPABASE_URL`: browser-safe Supabase project URL.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: browser-safe publishable key.
- `SUPABASE_SERVICE_ROLE_KEY`: server-only service role for future provider webhooks/jobs; never expose it to browser code.
- `SUPABASE_PROJECT_REF`, `SUPABASE_SECRET_KEY`, `SUPABASE_JWKS_URL`: deployment and server integration configuration.
- `PAYMENT_PROVIDER`: currently `cash_on_delivery`. Change only when an official provider adapter is implemented.
- `PAYMENT_API_KEY`, `PAYMENT_WEBHOOK_SECRET`: server-only external payment credentials. They remain blank for cash on delivery.

## Verification

```bash
npm run lint
npm run build
```

## Operational flow

- Products remain drafts until submitted and approved by an administrator.
- Checkout prices products and delivery methods inside PostgreSQL, reserves inventory, snapshots seller commission, and uses an idempotency token to prevent duplicate orders.
- Admins record collected manual payments, shipment tracking, cancellations, refunds, and payout transfer references.
- Paid seller proceeds enter the ledger after the configured hold period. Admins prepare eligible payout batches and mark them paid only after completing the external bank/provider transfer.
- Guest carts exist only in memory and disappear on refresh or tab closure. Confirmed guest orders remain in the database and are referenced by their order number and email.

## Production checklist

- Run on Node.js 22+.
- Apply and verify all migrations in a staging Supabase project first.
- Configure production Auth redirect URLs and Google OAuth credentials.
- Verify the `product-images` storage bucket and its policies.
- Replace `cash_on_delivery` only after implementing and testing the chosen processor's official server API and signed webhook.
- Configure transactional email/SMS delivery for notifications if required.
- Enable platform monitoring, backups, rate limiting, and a tested recovery process.
