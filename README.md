# BelGlow Marketplace

BelGlow is a multi-vendor beauty marketplace built with Next.js 16, React 19, Tailwind CSS, and Supabase. Public shoppers may browse and place pay-on-delivery orders without an account. Accounts preserve carts, product wishlists, favorite businesses, addresses, and order history. Approved sellers manage listings, inventory, orders, customers, reviews, promotions, analytics, store profiles, and payouts. Platform administrators manage the entire marketplace.

## Local setup

1. Use Node.js 22 or later.
2. Install dependencies with `npm install`.
3. Configure `.env` with the Supabase project URL and keys.
4. Apply every SQL file in `supabase/migrations` in filename order.
5. Run `supabase/seed.sql` for the initial inventory location, delivery methods, and seller-facing categories. Products are created by approved sellers only.
6. Start the app with `npm run dev`.

## Environment variables

- `NEXT_PUBLIC_SUPABASE_URL`: browser-safe Supabase project URL.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: browser-safe publishable key.
- `SUPABASE_SERVICE_ROLE_KEY`: server-only service role for future provider webhooks/jobs; never expose it to browser code.
- `SUPABASE_PROJECT_REF`, `SUPABASE_SECRET_KEY`, `SUPABASE_JWKS_URL`: deployment and server integration configuration.
- `PAYMENT_PROVIDER`: currently `bank_transfer`. Customers transfer each seller's portion directly to that seller.
- `PAYMENT_API_KEY`, `PAYMENT_WEBHOOK_SECRET`: reserved for a future hosted card-payment adapter.
- `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_REPLY_TO_EMAIL`: server-only transactional email configuration. The sender domain must be verified in Resend.
- `CRON_SECRET`: protects the email-outbox retry endpoint at `/api/email/process`.
- `NEXT_PUBLIC_ENABLE_GOOGLE_AUTH`: shows Google sign-in unless explicitly set to `false`.
- `NEXT_PUBLIC_ENABLE_APPLE_AUTH`, `NEXT_PUBLIC_ENABLE_FACEBOOK_AUTH`: optional provider buttons; set to `true` only after configuring that provider in Supabase.

## Social sign-in setup

The application supports Google accounts alongside email/password accounts. Apple and Facebook are also supported behind environment flags.

1. In Supabase, open **Authentication → Providers**, enable Google, and add the Google OAuth client ID and secret.
2. In Google Cloud, add the callback URL shown by Supabase. It normally has the form `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`.
3. In Supabase **Authentication → URL Configuration**, set the production Site URL and allow these redirect URLs:
   - `http://localhost:3000/auth/callback`
   - `https://YOUR_PRODUCTION_DOMAIN/auth/callback`
4. Copy `.env.example` to `.env` and keep `NEXT_PUBLIC_ENABLE_GOOGLE_AUTH=true`.
5. For Apple or Facebook, configure the matching Supabase provider first, then enable its environment flag.

OAuth users are created through the same profile trigger as email/password users, so carts, wishlists, account roles, seller applications, and dashboards continue to use the existing data model.

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
- Replace `bank_transfer` only after implementing and testing the chosen processor's hosted checkout, signed webhook, marketplace settlement, and refund flow.
- Verify the Resend sending domain and schedule the protected email-outbox retry endpoint.
- Enable platform monitoring, backups, rate limiting, and a tested recovery process.
