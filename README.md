# BelGlow Marketplace

BelGlow is a multi-vendor beauty marketplace built with Next.js 16, React 19, Tailwind CSS, and Supabase. Anyone may browse public listings; shoppers must sign in or create an account to add products to a cart and place orders. Customer shopping access is available to signed-in accounts independently of seller and platform-admin permissions. Accounts preserve carts, product wishlists, favorite businesses, addresses, and order history. Approved sellers manage listings, inventory, orders, customers, reviews, promotions, analytics, store profiles, and payouts. Platform administrators manage the entire marketplace.

## Local setup

1. Use Node.js 22 or later.
2. Install dependencies with `npm install`.
3. Copy `.env.example` to `.env.local` (or use a local `.env`) and replace the Supabase placeholders with the Project URL and publishable key from the Supabase project **Connect** dialog. Add the server-only service role key for admin operations, receipt uploads, and Resend outbox delivery. Restart `npm run dev` after changing environment values.
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
- `BELIZE_BANK_PAYMENT_URL`, `BELIZE_BANK_USERNAME`, `BELIZE_BANK_PASSWORD`: server-only credentials for Belize Bank hosted commission payments. Use the sandbox URL and test credentials while testing; production credentials must be issued for BelGlow.
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
- Visitors can browse approved, active products and see availability without signing in. Checkout requires an authenticated account; existing seller and administrator accounts can shop as customers without changing their platform permissions.

## Production checklist

- Run on Node.js 22+.
- Apply and verify all migrations in a staging Supabase project first.
- Apply `20261118000000_belize_bank_commission_payments.sql` before enabling the seller commission card checkout; it records the gateway attempts, verifies payments against Belize Bank, and exposes balances only in the admin Commission collection view.
- Apply `20261119000000_public_catalog_customer_checkout.sql` to make active, approved marketplace listings and stock visible consistently to public visitors and signed-in users, while requiring sign-in for checkout.
- Apply `20261115000000_production_public_rpc_hardening.sql` before deploying the API changes in this release; it restricts internal RPCs to the server role and adds a database-side checkout limit.
- Configure production Auth redirect URLs and Google OAuth credentials.
- Verify the `product-images` storage bucket and its policies.
- Replace `bank_transfer` only after implementing and testing the chosen processor's hosted checkout, signed webhook, marketplace settlement, and refund flow.
- Test Belize Bank commission checkout in its sandbox, including success, decline, cancellation, callback retry, and payment amount mismatch. A browser return alone must never mark a commission payment as paid.
- Verify the Resend sending domain and schedule the protected email-outbox retry endpoint.
- Configure the same production environment variables in the hosting provider; `NEXT_PUBLIC_SITE_URL` must be the live BelGlow origin, and server keys must not use the `NEXT_PUBLIC_` prefix.
- Enable platform monitoring, backups, rate limiting, and a tested recovery process.
