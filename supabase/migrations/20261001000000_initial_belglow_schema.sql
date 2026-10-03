-- BelGlow initial commerce schema for Supabase/PostgreSQL.
-- Monetary values are stored as integer cents to avoid floating-point errors.

create extension if not exists pgcrypto with schema extensions;

create type public.user_role as enum ('customer', 'seller', 'staff', 'admin');
create type public.product_status as enum ('draft', 'active', 'archived');
create type public.cart_status as enum ('active', 'converted', 'abandoned');
create type public.order_status as enum ('pending', 'confirmed', 'processing', 'completed', 'cancelled', 'refunded');
create type public.payment_status as enum ('pending', 'authorized', 'paid', 'failed', 'partially_refunded', 'refunded');
create type public.fulfillment_status as enum ('unfulfilled', 'processing', 'shipped', 'delivered', 'returned', 'cancelled');
create type public.discount_type as enum ('percentage', 'fixed_amount');
create type public.interaction_type as enum ('view', 'favorite', 'unfavorite', 'add_to_cart', 'purchase', 'search');

-- Identity and customer data ---------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.user_role not null default 'customer',
  full_name text,
  phone text,
  avatar_url text,
  date_of_birth date,
  marketing_opt_in boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  label text not null default 'Home',
  recipient_name text not null,
  phone text,
  address_line_1 text not null,
  address_line_2 text,
  city text not null,
  district text,
  postal_code text,
  country_code char(2) not null default 'BZ',
  delivery_notes text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index addresses_one_default_per_user
  on public.addresses(user_id) where is_default;
create index addresses_user_id_idx on public.addresses(user_id);

-- Catalog ----------------------------------------------------------------------

create table public.brands (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  description text,
  logo_url text,
  website_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.categories(id) on delete set null,
  name text not null,
  slug text not null unique,
  description text,
  image_url text,
  sort_order integer not null default 0 check (sort_order >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index categories_parent_id_idx on public.categories(parent_id);
create index categories_active_sort_idx on public.categories(is_active, sort_order);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references public.brands(id) on delete set null,
  name text not null,
  slug text not null unique,
  short_description text,
  description text,
  status public.product_status not null default 'draft',
  base_price_cents bigint not null check (base_price_cents >= 0),
  compare_at_price_cents bigint check (compare_at_price_cents is null or compare_at_price_cents >= base_price_cents),
  cost_price_cents bigint check (cost_price_cents is null or cost_price_cents >= 0),
  currency char(3) not null default 'BZD',
  ingredients text,
  usage_instructions text,
  attributes jsonb not null default '{}'::jsonb,
  is_featured boolean not null default false,
  seo_title text,
  seo_description text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index products_brand_id_idx on public.products(brand_id);
create index products_status_featured_idx on public.products(status, is_featured);
create index products_name_search_idx on public.products using gin (to_tsvector('english', name || ' ' || coalesce(short_description, '')));

create table public.product_categories (
  product_id uuid not null references public.products(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  is_primary boolean not null default false,
  primary key (product_id, category_id)
);

create index product_categories_category_idx on public.product_categories(category_id);
create unique index product_categories_one_primary_idx
  on public.product_categories(product_id) where is_primary;

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  sku text not null unique,
  barcode text unique,
  name text not null default 'Default',
  price_cents bigint check (price_cents is null or price_cents >= 0),
  compare_at_price_cents bigint check (compare_at_price_cents is null or compare_at_price_cents >= 0),
  attributes jsonb not null default '{}'::jsonb,
  weight_grams integer check (weight_grams is null or weight_grams >= 0),
  is_active boolean not null default true,
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index product_variants_product_id_idx on public.product_variants(product_id);

create table public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  variant_id uuid references public.product_variants(id) on delete cascade,
  storage_path text not null,
  alt_text text not null default '',
  sort_order integer not null default 0 check (sort_order >= 0),
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);

create index product_images_product_sort_idx on public.product_images(product_id, sort_order);
create unique index product_images_one_primary_idx
  on public.product_images(product_id) where is_primary and variant_id is null;

-- Inventory --------------------------------------------------------------------

create table public.inventory_locations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  address jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.inventory_levels (
  variant_id uuid not null references public.product_variants(id) on delete cascade,
  location_id uuid not null references public.inventory_locations(id) on delete cascade,
  quantity_on_hand integer not null default 0 check (quantity_on_hand >= 0),
  quantity_reserved integer not null default 0 check (quantity_reserved >= 0 and quantity_reserved <= quantity_on_hand),
  reorder_point integer not null default 5 check (reorder_point >= 0),
  updated_at timestamptz not null default now(),
  primary key (variant_id, location_id)
);

-- Shopping and saved products --------------------------------------------------

create table public.wishlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null default 'Saved products',
  is_default boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index wishlists_one_default_per_user
  on public.wishlists(user_id) where is_default;
create index wishlists_user_id_idx on public.wishlists(user_id);

create table public.wishlist_items (
  wishlist_id uuid not null references public.wishlists(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (wishlist_id, product_id)
);

create table public.carts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  session_token uuid,
  status public.cart_status not null default 'active',
  currency char(3) not null default 'BZD',
  expires_at timestamptz not null default (now() + interval '30 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint carts_has_owner check (user_id is not null or session_token is not null)
);

create unique index carts_active_user_idx
  on public.carts(user_id) where status = 'active' and user_id is not null;
create unique index carts_active_session_idx
  on public.carts(session_token) where status = 'active' and session_token is not null;

create table public.cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references public.carts(id) on delete cascade,
  variant_id uuid not null references public.product_variants(id) on delete cascade,
  quantity integer not null default 1 check (quantity > 0 and quantity <= 99),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cart_id, variant_id)
);

create index cart_items_cart_id_idx on public.cart_items(cart_id);

-- Checkout and fulfillment -----------------------------------------------------

create table public.shipping_methods (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  description text,
  price_cents bigint not null default 0 check (price_cents >= 0),
  estimated_days_min integer check (estimated_days_min is null or estimated_days_min >= 0),
  estimated_days_max integer check (estimated_days_max is null or estimated_days_max >= estimated_days_min),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number bigint generated always as identity unique,
  user_id uuid references public.profiles(id) on delete set null,
  email text not null,
  phone text,
  status public.order_status not null default 'pending',
  payment_status public.payment_status not null default 'pending',
  fulfillment_status public.fulfillment_status not null default 'unfulfilled',
  currency char(3) not null default 'BZD',
  subtotal_cents bigint not null check (subtotal_cents >= 0),
  discount_cents bigint not null default 0 check (discount_cents >= 0),
  shipping_cents bigint not null default 0 check (shipping_cents >= 0),
  tax_cents bigint not null default 0 check (tax_cents >= 0),
  total_cents bigint not null check (total_cents >= 0),
  shipping_method_name text,
  shipping_address jsonb not null,
  billing_address jsonb,
  customer_note text,
  internal_note text,
  placed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint orders_total_matches check (total_cents = subtotal_cents - discount_cents + shipping_cents + tax_cents)
);

create index orders_user_id_created_idx on public.orders(user_id, created_at desc);
create index orders_status_idx on public.orders(status, fulfillment_status);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  variant_id uuid references public.product_variants(id) on delete set null,
  sku text not null,
  product_name text not null,
  variant_name text,
  quantity integer not null check (quantity > 0),
  unit_price_cents bigint not null check (unit_price_cents >= 0),
  total_cents bigint generated always as (quantity * unit_price_cents) stored,
  product_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index order_items_order_id_idx on public.order_items(order_id);

create table public.order_status_history (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  status public.order_status not null,
  note text,
  changed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index order_status_history_order_idx on public.order_status_history(order_id, created_at);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  provider text not null,
  provider_reference text unique,
  status public.payment_status not null default 'pending',
  amount_cents bigint not null check (amount_cents >= 0),
  currency char(3) not null default 'BZD',
  provider_payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index payments_order_id_idx on public.payments(order_id);

create table public.shipments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  carrier text,
  tracking_number text,
  tracking_url text,
  status public.fulfillment_status not null default 'processing',
  shipped_at timestamptz,
  delivered_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index shipments_order_id_idx on public.shipments(order_id);
create unique index shipments_tracking_number_idx
  on public.shipments(tracking_number) where tracking_number is not null;

create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  payment_id uuid references public.payments(id) on delete set null,
  provider_reference text unique,
  amount_cents bigint not null check (amount_cents > 0),
  currency char(3) not null default 'BZD',
  status public.payment_status not null default 'pending',
  reason text,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index refunds_order_id_idx on public.refunds(order_id);

-- Promotions and reviews -------------------------------------------------------

create table public.promotions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  discount_type public.discount_type not null,
  discount_value integer not null check (discount_value > 0),
  minimum_order_cents bigint not null default 0 check (minimum_order_cents >= 0),
  maximum_discount_cents bigint check (maximum_discount_cents is null or maximum_discount_cents > 0),
  usage_limit integer check (usage_limit is null or usage_limit > 0),
  usage_count integer not null default 0 check (usage_count >= 0),
  per_user_limit integer check (per_user_limit is null or per_user_limit > 0),
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint promotions_valid_window check (ends_at is null or starts_at is null or ends_at > starts_at),
  constraint promotions_percentage_range check (discount_type <> 'percentage' or discount_value <= 100)
);

create table public.promotion_products (
  promotion_id uuid not null references public.promotions(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  primary key (promotion_id, product_id)
);

create table public.promotion_categories (
  promotion_id uuid not null references public.promotions(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  primary key (promotion_id, category_id)
);

create table public.promotion_redemptions (
  id uuid primary key default gen_random_uuid(),
  promotion_id uuid not null references public.promotions(id) on delete restrict,
  user_id uuid references public.profiles(id) on delete set null,
  order_id uuid not null unique references public.orders(id) on delete restrict,
  discount_cents bigint not null check (discount_cents >= 0),
  created_at timestamptz not null default now()
);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  order_item_id uuid references public.order_items(id) on delete set null,
  rating smallint not null check (rating between 1 and 5),
  title text,
  body text,
  is_verified_purchase boolean not null default false,
  is_approved boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, user_id)
);

create index reviews_product_approved_idx on public.reviews(product_id, is_approved, created_at desc);

-- Recommendation and analytics signals ---------------------------------------

create table public.product_interactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  session_id uuid,
  product_id uuid references public.products(id) on delete cascade,
  interaction public.interaction_type not null,
  search_query text,
  weight numeric(6,2) not null default 1,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint product_interactions_has_actor check (user_id is not null or session_id is not null),
  constraint product_interactions_has_subject check (product_id is not null or interaction = 'search')
);

create index product_interactions_user_time_idx on public.product_interactions(user_id, created_at desc);
create index product_interactions_session_time_idx on public.product_interactions(session_id, created_at desc);
create index product_interactions_product_idx on public.product_interactions(product_id, interaction);

create table public.user_category_preferences (
  user_id uuid not null references public.profiles(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  score numeric(10,2) not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, category_id)
);

-- Shared trigger functions -----------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture')
  );

  insert into public.wishlists (user_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role in ('staff', 'admin')
  );
$$;

revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.profiles where id = (select auth.uid());
$$;

revoke execute on function public.current_user_role() from public, anon;
grant execute on function public.current_user_role() to authenticated;

-- Public product media lives in Supabase Storage; staff/admin writes are RLS protected.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Product images are publicly readable"
  on storage.objects for select to public
  using (bucket_id = 'product-images');

create policy "Admins upload product images"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images' and public.is_admin());

create policy "Admins update product images"
  on storage.objects for update to authenticated
  using (bucket_id = 'product-images' and public.is_admin())
  with check (bucket_id = 'product-images' and public.is_admin());

create policy "Admins delete product images"
  on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and public.is_admin());

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'profiles', 'addresses', 'brands', 'categories', 'products', 'product_variants',
    'inventory_locations', 'wishlists', 'carts', 'cart_items', 'shipping_methods',
    'orders', 'payments', 'shipments', 'refunds', 'promotions', 'reviews'
  ]
  loop
    execute format(
      'create trigger %I_updated_at before update on public.%I for each row execute procedure public.set_updated_at()',
      table_name, table_name
    );
  end loop;
end;
$$;

-- Row-level security -----------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.addresses enable row level security;
alter table public.brands enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.product_categories enable row level security;
alter table public.product_variants enable row level security;
alter table public.product_images enable row level security;
alter table public.inventory_locations enable row level security;
alter table public.inventory_levels enable row level security;
alter table public.wishlists enable row level security;
alter table public.wishlist_items enable row level security;
alter table public.carts enable row level security;
alter table public.cart_items enable row level security;
alter table public.shipping_methods enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_status_history enable row level security;
alter table public.payments enable row level security;
alter table public.shipments enable row level security;
alter table public.refunds enable row level security;
alter table public.promotions enable row level security;
alter table public.promotion_products enable row level security;
alter table public.promotion_categories enable row level security;
alter table public.promotion_redemptions enable row level security;
alter table public.reviews enable row level security;
alter table public.product_interactions enable row level security;
alter table public.user_category_preferences enable row level security;

-- Start from least privilege; service_role continues to bypass RLS server-side.
revoke all on all tables in schema public from anon, authenticated;

grant select on public.brands, public.categories, public.products,
  public.product_categories, public.product_variants, public.product_images,
  public.shipping_methods, public.reviews to anon, authenticated;

grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.addresses, public.wishlists,
  public.wishlist_items, public.carts, public.cart_items to authenticated;
grant select on public.orders, public.order_items, public.order_status_history,
  public.payments, public.shipments, public.refunds, public.promotion_redemptions to authenticated;
grant insert, select on public.product_interactions to anon, authenticated;
grant select, insert, update, delete on public.user_category_preferences to authenticated;
grant insert, update, delete on public.reviews to authenticated;

-- Public catalog policies.
create policy "Active brands are public" on public.brands for select to anon, authenticated using (is_active);
create policy "Active categories are public" on public.categories for select to anon, authenticated using (is_active);
create policy "Active products are public" on public.products for select to anon, authenticated using (status = 'active');
create policy "Active product category links are public" on public.product_categories for select to anon, authenticated using (exists (select 1 from public.products p where p.id = product_id and p.status = 'active'));
create policy "Active variants are public" on public.product_variants for select to anon, authenticated using (is_active and exists (select 1 from public.products p where p.id = product_id and p.status = 'active'));
create policy "Product images are public" on public.product_images for select to anon, authenticated using (exists (select 1 from public.products p where p.id = product_id and p.status = 'active'));
create policy "Active shipping methods are public" on public.shipping_methods for select to anon, authenticated using (is_active);
create policy "Approved reviews are public" on public.reviews for select to anon, authenticated using (is_approved);

-- A signed-in shopper controls only their own personal records.
create policy "Users read own profile" on public.profiles for select to authenticated using ((select auth.uid()) = id or public.is_admin());
create policy "Users update own profile" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id and role = public.current_user_role());
create policy "Admins update profiles" on public.profiles for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "Users read own addresses" on public.addresses for select to authenticated using ((select auth.uid()) = user_id or public.is_admin());
create policy "Users create own addresses" on public.addresses for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users update own addresses" on public.addresses for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users delete own addresses" on public.addresses for delete to authenticated using ((select auth.uid()) = user_id);

create policy "Users read own wishlists" on public.wishlists for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users create own wishlists" on public.wishlists for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users update own wishlists" on public.wishlists for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users delete own wishlists" on public.wishlists for delete to authenticated using ((select auth.uid()) = user_id);
create policy "Users read own wishlist items" on public.wishlist_items for select to authenticated using (exists (select 1 from public.wishlists w where w.id = wishlist_id and w.user_id = (select auth.uid())));
create policy "Users add own wishlist items" on public.wishlist_items for insert to authenticated with check (exists (select 1 from public.wishlists w where w.id = wishlist_id and w.user_id = (select auth.uid())));
create policy "Users remove own wishlist items" on public.wishlist_items for delete to authenticated using (exists (select 1 from public.wishlists w where w.id = wishlist_id and w.user_id = (select auth.uid())));

create policy "Users read own carts" on public.carts for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users create own carts" on public.carts for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users update own carts" on public.carts for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users delete own carts" on public.carts for delete to authenticated using ((select auth.uid()) = user_id);
create policy "Users read own cart items" on public.cart_items for select to authenticated using (exists (select 1 from public.carts c where c.id = cart_id and c.user_id = (select auth.uid())));
create policy "Users add own cart items" on public.cart_items for insert to authenticated with check (exists (select 1 from public.carts c where c.id = cart_id and c.user_id = (select auth.uid())));
create policy "Users update own cart items" on public.cart_items for update to authenticated using (exists (select 1 from public.carts c where c.id = cart_id and c.user_id = (select auth.uid()))) with check (exists (select 1 from public.carts c where c.id = cart_id and c.user_id = (select auth.uid())));
create policy "Users delete own cart items" on public.cart_items for delete to authenticated using (exists (select 1 from public.carts c where c.id = cart_id and c.user_id = (select auth.uid())));

-- Checkout records are readable by their owner but created by trusted server code.
create policy "Users read own orders" on public.orders for select to authenticated using ((select auth.uid()) = user_id or public.is_admin());
create policy "Users read own order items" on public.order_items for select to authenticated using (exists (select 1 from public.orders o where o.id = order_id and (o.user_id = (select auth.uid()) or public.is_admin())));
create policy "Users read own order history" on public.order_status_history for select to authenticated using (exists (select 1 from public.orders o where o.id = order_id and (o.user_id = (select auth.uid()) or public.is_admin())));
create policy "Users read own payments" on public.payments for select to authenticated using (exists (select 1 from public.orders o where o.id = order_id and (o.user_id = (select auth.uid()) or public.is_admin())));
create policy "Users read own shipments" on public.shipments for select to authenticated using (exists (select 1 from public.orders o where o.id = order_id and (o.user_id = (select auth.uid()) or public.is_admin())));
create policy "Users read own refunds" on public.refunds for select to authenticated using (exists (select 1 from public.orders o where o.id = order_id and (o.user_id = (select auth.uid()) or public.is_admin())));
create policy "Users read own redemptions" on public.promotion_redemptions for select to authenticated using ((select auth.uid()) = user_id or public.is_admin());

create policy "Users read own reviews" on public.reviews for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users create own reviews" on public.reviews for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users update own pending reviews" on public.reviews for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id and not is_approved);
create policy "Users delete own reviews" on public.reviews for delete to authenticated using ((select auth.uid()) = user_id);

create policy "Anonymous sessions record interactions" on public.product_interactions for insert to anon with check (user_id is null and session_id is not null);
create policy "Users record own interactions" on public.product_interactions for insert to authenticated with check (user_id = (select auth.uid()));
create policy "Users read own interactions" on public.product_interactions for select to authenticated using (user_id = (select auth.uid()));
create policy "Users read own category preferences" on public.user_category_preferences for select to authenticated using (user_id = (select auth.uid()));
create policy "Users create own category preferences" on public.user_category_preferences for insert to authenticated with check (user_id = (select auth.uid()));
create policy "Users update own category preferences" on public.user_category_preferences for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Users delete own category preferences" on public.user_category_preferences for delete to authenticated using (user_id = (select auth.uid()));

-- Admin write access for catalog and operations. Browser admin screens can use
-- these policies; payment-provider secrets must still stay server-side.
create policy "Admins manage brands" on public.brands for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Admins manage categories" on public.categories for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Admins manage products" on public.products for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Admins manage product categories" on public.product_categories for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Admins manage variants" on public.product_variants for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Admins manage images" on public.product_images for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Admins manage inventory locations" on public.inventory_locations for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Admins manage inventory" on public.inventory_levels for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Admins manage shipping methods" on public.shipping_methods for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Admins manage orders" on public.orders for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Admins manage order items" on public.order_items for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Admins manage order history" on public.order_status_history for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Admins manage promotions" on public.promotions for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Admins manage promotion products" on public.promotion_products for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Admins manage promotion categories" on public.promotion_categories for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Admins moderate reviews" on public.reviews for all to authenticated using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.brands, public.categories, public.products,
  public.product_categories, public.product_variants, public.product_images,
  public.inventory_locations, public.inventory_levels, public.shipping_methods, public.promotions,
  public.promotion_products, public.promotion_categories to authenticated;
grant update on public.orders to authenticated;

comment on table public.products is 'Sellable BelGlow catalog products. Variant-specific pricing overrides base_price_cents.';
comment on table public.orders is 'Immutable checkout snapshots. Create through trusted server code, never directly from browser totals.';
comment on table public.product_interactions is 'Behavioral signals used to personalize Recommended For You.';
comment on column public.payments.provider_payload is 'Redacted provider metadata only. Never store card numbers, CVV, or payment secrets.';
