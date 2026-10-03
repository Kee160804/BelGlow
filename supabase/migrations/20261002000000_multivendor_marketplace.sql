-- BelGlow multi-vendor marketplace extension.
-- Apply after 20261001000000_initial_belglow_schema.sql.
-- Money remains integer cents and percentages use basis points (1500 = 15%).

create type public.seller_status as enum ('pending', 'approved', 'suspended', 'rejected');
create type public.product_review_status as enum ('draft', 'submitted', 'approved', 'rejected');
create type public.seller_order_status as enum ('new', 'accepted', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded');
create type public.seller_payout_status as enum ('draft', 'ready', 'processing', 'paid', 'failed', 'cancelled');
create type public.seller_ledger_entry_type as enum ('sale', 'refund', 'adjustment', 'payout');

-- One row controls marketplace-wide commercial defaults. Admin changes affect
-- future purchases only because every order item snapshots its effective rate.
create table public.marketplace_settings (
  singleton boolean primary key default true check (singleton),
  default_commission_bps integer not null default 1500 check (default_commission_bps between 0 and 10000),
  minimum_payout_cents bigint not null default 5000 check (minimum_payout_cents >= 0),
  payout_hold_days integer not null default 7 check (payout_hold_days between 0 and 90),
  seller_applications_open boolean not null default true,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.marketplace_settings (singleton) values (true);

-- Creating a store is the seller application. Only an approved store may have
-- active products. commission_rate_bps is an optional per-store admin override.
create table public.seller_stores (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references public.profiles(id) on delete restrict,
  name text not null,
  slug text not null unique,
  description text,
  logo_url text,
  support_email text,
  support_phone text,
  status public.seller_status not null default 'pending',
  commission_rate_bps integer check (commission_rate_bps is null or commission_rate_bps between 0 and 10000),
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint seller_store_approval_fields check (
    (status <> 'approved') or (approved_by is not null and approved_at is not null)
  )
);

create index seller_stores_status_idx on public.seller_stores(status, created_at desc);

alter table public.products
  add column seller_store_id uuid references public.seller_stores(id) on delete restrict,
  add column review_status public.product_review_status not null default 'draft',
  add column submitted_at timestamptz,
  add column reviewed_by uuid references public.profiles(id) on delete set null,
  add column reviewed_at timestamptz,
  add column rejection_reason text;

create index products_seller_store_idx on public.products(seller_store_id, status, created_at desc);
create index products_review_queue_idx on public.products(review_status, submitted_at) where seller_store_id is not null;

-- These fields are immutable financial snapshots. They are populated by a
-- trusted trigger when an order item is inserted, never from browser totals.
alter table public.order_items
  add column seller_store_id uuid references public.seller_stores(id) on delete restrict,
  add column commission_rate_bps integer not null default 0 check (commission_rate_bps between 0 and 10000),
  add column platform_fee_cents bigint not null default 0 check (platform_fee_cents >= 0),
  add column seller_net_cents bigint not null default 0 check (seller_net_cents >= 0),
  add constraint order_item_marketplace_split check (
    (seller_store_id is null and commission_rate_bps = 0 and platform_fee_cents = 0 and seller_net_cents = 0)
    or
    (seller_store_id is not null and platform_fee_cents + seller_net_cents = quantity * unit_price_cents)
  );

create index order_items_seller_store_idx on public.order_items(seller_store_id, created_at desc);

create or replace function public.snapshot_marketplace_commission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  product_store_id uuid;
  effective_rate integer;
  item_gross bigint;
begin
  if new.product_id is null then
    return new;
  end if;

  select product.seller_store_id
  into product_store_id
  from public.products product
  where product.id = new.product_id;

  if product_store_id is null then
    new.seller_store_id := null;
    new.commission_rate_bps := 0;
    new.platform_fee_cents := 0;
    new.seller_net_cents := 0;
    return new;
  end if;

  select coalesce(store.commission_rate_bps, settings.default_commission_bps)
  into effective_rate
  from public.seller_stores store
  cross join public.marketplace_settings settings
  where store.id = product_store_id and settings.singleton;

  if effective_rate is null then
    raise exception 'No commission configuration exists for seller store %', product_store_id;
  end if;

  item_gross := new.quantity * new.unit_price_cents;
  new.seller_store_id := product_store_id;
  new.commission_rate_bps := effective_rate;
  new.platform_fee_cents := round(item_gross * effective_rate / 10000.0);
  new.seller_net_cents := item_gross - new.platform_fee_cents;
  return new;
end;
$$;

revoke execute on function public.snapshot_marketplace_commission() from public, anon, authenticated;

create trigger order_items_snapshot_marketplace_commission
  before insert on public.order_items
  for each row execute procedure public.snapshot_marketplace_commission();

-- A shopper sees one order. Each seller receives one isolated seller_order for
-- fulfillment and accounting, similar to a marketplace sub-order.
create table public.seller_orders (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  seller_store_id uuid not null references public.seller_stores(id) on delete restrict,
  status public.seller_order_status not null default 'new',
  item_subtotal_cents bigint not null check (item_subtotal_cents >= 0),
  platform_fee_cents bigint not null check (platform_fee_cents >= 0),
  seller_net_cents bigint not null check (seller_net_cents >= 0),
  accepted_at timestamptz,
  shipped_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, seller_store_id),
  constraint seller_order_split_matches check (platform_fee_cents + seller_net_cents = item_subtotal_cents)
);

create index seller_orders_store_created_idx on public.seller_orders(seller_store_id, created_at desc);
create index seller_orders_status_idx on public.seller_orders(status, created_at);

-- Call once after all order items have been inserted by trusted checkout code.
create or replace function public.finalize_seller_order_splits(target_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.seller_orders (
    order_id, seller_store_id, item_subtotal_cents, platform_fee_cents, seller_net_cents
  )
  select
    item.order_id,
    item.seller_store_id,
    sum(item.total_cents),
    sum(item.platform_fee_cents),
    sum(item.seller_net_cents)
  from public.order_items item
  where item.order_id = target_order_id and item.seller_store_id is not null
  group by item.order_id, item.seller_store_id
  on conflict (order_id, seller_store_id) do update set
    item_subtotal_cents = excluded.item_subtotal_cents,
    platform_fee_cents = excluded.platform_fee_cents,
    seller_net_cents = excluded.seller_net_cents,
    updated_at = now();
end;
$$;

revoke execute on function public.finalize_seller_order_splits(uuid) from public, anon, authenticated;
grant execute on function public.finalize_seller_order_splits(uuid) to service_role;

create table public.seller_payouts (
  id uuid primary key default gen_random_uuid(),
  seller_store_id uuid not null references public.seller_stores(id) on delete restrict,
  status public.seller_payout_status not null default 'draft',
  period_start date not null,
  period_end date not null,
  gross_sales_cents bigint not null default 0 check (gross_sales_cents >= 0),
  commission_cents bigint not null default 0 check (commission_cents >= 0),
  refund_cents bigint not null default 0 check (refund_cents >= 0),
  adjustment_cents bigint not null default 0,
  net_payout_cents bigint generated always as (
    gross_sales_cents - commission_cents - refund_cents + adjustment_cents
  ) stored,
  provider text,
  provider_reference text unique,
  failure_reason text,
  initiated_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint seller_payout_period check (period_end >= period_start),
  constraint seller_payout_nonnegative check (gross_sales_cents - commission_cents - refund_cents + adjustment_cents >= 0)
);

create index seller_payouts_store_created_idx on public.seller_payouts(seller_store_id, created_at desc);
create index seller_payouts_status_idx on public.seller_payouts(status, created_at);

create table public.seller_payout_orders (
  payout_id uuid not null references public.seller_payouts(id) on delete cascade,
  seller_order_id uuid not null unique references public.seller_orders(id) on delete restrict,
  primary key (payout_id, seller_order_id)
);

-- The ledger is the auditable source for seller balances. Positive amounts add
-- to what the seller is owed; payout entries are negative.
create table public.seller_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  seller_store_id uuid not null references public.seller_stores(id) on delete restrict,
  entry_type public.seller_ledger_entry_type not null,
  amount_cents bigint not null check (amount_cents <> 0),
  seller_order_id uuid references public.seller_orders(id) on delete restrict,
  payout_id uuid references public.seller_payouts(id) on delete restrict,
  description text not null,
  available_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint seller_ledger_reference check (
    seller_order_id is not null or payout_id is not null or entry_type = 'adjustment'
  )
);

create index seller_ledger_store_available_idx on public.seller_ledger_entries(seller_store_id, available_at, created_at);
create unique index seller_ledger_one_sale_per_seller_order_idx
  on public.seller_ledger_entries(seller_order_id)
  where entry_type = 'sale';

-- Payment webhooks call this after recording a successful payment. It is safe
-- to retry: each seller sub-order can receive exactly one sale ledger credit.
create or replace function public.post_paid_order_to_seller_ledger(target_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  hold_days integer;
begin
  if not exists (
    select 1
    from public.payments payment
    where payment.order_id = target_order_id and payment.status = 'paid'
  ) then
    raise exception 'Order % does not have a paid payment', target_order_id;
  end if;

  perform public.finalize_seller_order_splits(target_order_id);

  select settings.payout_hold_days into hold_days
  from public.marketplace_settings settings
  where settings.singleton;

  insert into public.seller_ledger_entries (
    seller_store_id,
    entry_type,
    amount_cents,
    seller_order_id,
    description,
    available_at
  )
  select
    seller_order.seller_store_id,
    'sale',
    seller_order.seller_net_cents,
    seller_order.id,
    'Seller proceeds for paid marketplace order',
    now() + make_interval(days => hold_days)
  from public.seller_orders seller_order
  where seller_order.order_id = target_order_id
    and seller_order.seller_net_cents > 0
  on conflict (seller_order_id) where entry_type = 'sale' do nothing;
end;
$$;

revoke execute on function public.post_paid_order_to_seller_ledger(uuid) from public, anon, authenticated;
grant execute on function public.post_paid_order_to_seller_ledger(uuid) to service_role;

-- Ownership helpers are security-definer functions so RLS policies do not
-- recurse through protected marketplace tables.
create or replace function public.owns_seller_store(target_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.seller_stores store
    where store.id = target_store_id and store.owner_id = (select auth.uid())
  );
$$;

create or replace function public.owns_marketplace_product(target_product_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.products product
    join public.seller_stores store on store.id = product.seller_store_id
    where product.id = target_product_id and store.owner_id = (select auth.uid())
  );
$$;

create or replace function public.owns_editable_marketplace_product(target_product_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.products product
    join public.seller_stores store on store.id = product.seller_store_id
    where product.id = target_product_id
      and store.owner_id = (select auth.uid())
      and product.status = 'draft'
      and product.review_status = 'draft'
  );
$$;

-- Submission is a deliberate state transition. Once submitted, catalog
-- content is frozen until an admin approves it or returns it to draft.
create or replace function public.submit_product_for_review(target_product_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.products product
  set review_status = 'submitted',
      submitted_at = now(),
      rejection_reason = null,
      updated_at = now()
  from public.seller_stores store
  where product.id = target_product_id
    and store.id = product.seller_store_id
    and store.owner_id = (select auth.uid())
    and store.status = 'approved'
    and product.status = 'draft'
    and product.review_status = 'draft';

  if not found then
    raise exception 'Product is not an editable draft owned by an approved seller';
  end if;
end;
$$;

revoke execute on function public.owns_seller_store(uuid) from public, anon;
revoke execute on function public.owns_marketplace_product(uuid) from public, anon;
revoke execute on function public.owns_editable_marketplace_product(uuid) from public, anon;
revoke execute on function public.submit_product_for_review(uuid) from public, anon;
grant execute on function public.owns_seller_store(uuid), public.owns_marketplace_product(uuid),
  public.owns_editable_marketplace_product(uuid) to authenticated;
grant execute on function public.submit_product_for_review(uuid) to authenticated;

create trigger seller_stores_updated_at before update on public.seller_stores
  for each row execute procedure public.set_updated_at();
create trigger seller_orders_updated_at before update on public.seller_orders
  for each row execute procedure public.set_updated_at();
create trigger seller_payouts_updated_at before update on public.seller_payouts
  for each row execute procedure public.set_updated_at();
create trigger marketplace_settings_updated_at before update on public.marketplace_settings
  for each row execute procedure public.set_updated_at();

alter table public.marketplace_settings enable row level security;
alter table public.seller_stores enable row level security;
alter table public.seller_orders enable row level security;
alter table public.seller_payouts enable row level security;
alter table public.seller_payout_orders enable row level security;
alter table public.seller_ledger_entries enable row level security;

grant select on public.marketplace_settings to anon, authenticated;
grant select on public.seller_stores to anon, authenticated;
grant insert (owner_id, name, slug, description, logo_url, support_email, support_phone)
  on public.seller_stores to authenticated;
grant update (name, slug, description, logo_url, support_email, support_phone)
  on public.seller_stores to authenticated;
grant select on public.seller_orders, public.seller_payouts, public.seller_payout_orders,
  public.seller_ledger_entries to authenticated;

create policy "Marketplace settings are readable" on public.marketplace_settings
  for select to anon, authenticated using (true);
create policy "Admins manage marketplace settings" on public.marketplace_settings
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "Approved stores are public" on public.seller_stores
  for select to anon, authenticated using (status = 'approved');
create policy "Owners read own store application" on public.seller_stores
  for select to authenticated using (owner_id = (select auth.uid()) or public.is_admin());
create policy "Users create own seller application" on public.seller_stores
  for insert to authenticated with check (
    owner_id = (select auth.uid())
    and status = 'pending'
    and commission_rate_bps is null
    and (select seller_applications_open from public.marketplace_settings where singleton)
  );
create policy "Owners update own public store fields" on public.seller_stores
  for update to authenticated using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy "Admins manage seller stores" on public.seller_stores
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Sellers can create drafts and submit them. Only admins activate listings.
create policy "Sellers read own products" on public.products
  for select to authenticated using (seller_store_id is not null and public.owns_seller_store(seller_store_id));
create policy "Sellers create own product drafts" on public.products
  for insert to authenticated with check (
    seller_store_id is not null
    and public.owns_seller_store(seller_store_id)
    and status = 'draft'
    and review_status = 'draft'
  );
create policy "Sellers update own unapproved products" on public.products
  for update to authenticated using (
    seller_store_id is not null and public.owns_seller_store(seller_store_id)
  ) with check (
    seller_store_id is not null
    and public.owns_seller_store(seller_store_id)
    and status = 'draft'
    and review_status = 'draft'
  );

create policy "Sellers manage own product categories" on public.product_categories
  for all to authenticated using (public.owns_editable_marketplace_product(product_id))
  with check (public.owns_editable_marketplace_product(product_id));
create policy "Sellers manage own variants" on public.product_variants
  for all to authenticated using (public.owns_editable_marketplace_product(product_id))
  with check (public.owns_editable_marketplace_product(product_id));
create policy "Sellers manage own image records" on public.product_images
  for all to authenticated using (public.owns_editable_marketplace_product(product_id))
  with check (public.owns_editable_marketplace_product(product_id));
create policy "Sellers manage inventory for own variants" on public.inventory_levels
  for all to authenticated using (
    exists (
      select 1 from public.product_variants variant
      where variant.id = variant_id and public.owns_marketplace_product(variant.product_id)
    )
  ) with check (
    exists (
      select 1 from public.product_variants variant
      where variant.id = variant_id and public.owns_marketplace_product(variant.product_id)
    )
  );

create policy "Sellers read own seller orders" on public.seller_orders
  for select to authenticated using (public.owns_seller_store(seller_store_id) or public.is_admin());
create policy "Sellers update own fulfillment" on public.seller_orders
  for update to authenticated using (public.owns_seller_store(seller_store_id))
  with check (public.owns_seller_store(seller_store_id));
create policy "Sellers read own marketplace order" on public.orders
  for select to authenticated using (
    exists (
      select 1 from public.seller_orders seller_order
      where seller_order.order_id = id and public.owns_seller_store(seller_order.seller_store_id)
    )
  );
create policy "Sellers read own marketplace items" on public.order_items
  for select to authenticated using (
    seller_store_id is not null and public.owns_seller_store(seller_store_id)
  );
create policy "Sellers read own payouts" on public.seller_payouts
  for select to authenticated using (public.owns_seller_store(seller_store_id) or public.is_admin());
create policy "Sellers read own payout items" on public.seller_payout_orders
  for select to authenticated using (
    exists (
      select 1 from public.seller_payouts payout
      where payout.id = payout_id and public.owns_seller_store(payout.seller_store_id)
    ) or public.is_admin()
  );
create policy "Sellers read own ledger" on public.seller_ledger_entries
  for select to authenticated using (public.owns_seller_store(seller_store_id) or public.is_admin());

create policy "Admins manage seller orders" on public.seller_orders
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Admins manage seller payouts" on public.seller_payouts
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Admins manage payout items" on public.seller_payout_orders
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Admins manage seller ledger" on public.seller_ledger_entries
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Seller product media must live under product-images/<store-uuid>/...
create policy "Sellers upload own product images" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'product-images'
    and exists (
      select 1 from public.seller_stores store
      where store.owner_id = (select auth.uid())
        and store.status = 'approved'
        and store.id::text = (storage.foldername(name))[1]
    )
  );

comment on table public.seller_stores is 'Seller application and public marketplace storefront. Admin approval is required before listings become active.';
comment on column public.order_items.commission_rate_bps is 'Immutable effective commission rate captured at purchase time; 1500 means 15%.';
comment on table public.seller_orders is 'Per-seller fulfillment and accounting split for one customer-facing order.';
comment on table public.seller_ledger_entries is 'Auditable seller balance ledger. Never derive historical balances from the current commission setting.';
