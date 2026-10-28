-- Fix PostgreSQL enum inference in checkout status CASE expressions.
-- Replaces the deployed checkout function without changing its signature.

create or replace function public.create_marketplace_order(
  checkout_items jsonb,
  checkout_email text,
  checkout_phone text,
  checkout_shipping_address jsonb,
  checkout_shipping_code text,
  checkout_note text,
  checkout_promotion_code text,
  checkout_provider text,
  checkout_idempotency_key uuid
)
returns table (created_order_id uuid, created_order_number bigint, created_total_cents bigint, created_payment_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  created_order_uuid uuid;
  order_no bigint;
  payment_id uuid;
  existing_order public.orders%rowtype;
  shipping_row public.shipping_methods%rowtype;
  item jsonb;
  variant_row record;
  requested_quantity integer;
  unit_price bigint;
  subtotal bigint := 0;
  total bigint;
  stock_row record;
  promotion_row public.promotions%rowtype;
  eligible_subtotal bigint := 0;
  discount_total bigint := 0;
begin
  if checkout_idempotency_key is null then raise exception 'Checkout token is required'; end if;
  select * into existing_order from public.orders where checkout_token = checkout_idempotency_key;
  if found then
    select payment.id into payment_id from public.payments payment where payment.order_id = existing_order.id order by payment.created_at limit 1;
    return query select existing_order.id, existing_order.order_number, existing_order.total_cents, payment_id;
    return;
  end if;
  if checkout_items is null or jsonb_typeof(checkout_items) <> 'array' or jsonb_array_length(checkout_items) < 1 or jsonb_array_length(checkout_items) > 100 then
    raise exception 'Your cart is empty or too large';
  end if;
  if checkout_email !~* '^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$' then raise exception 'Enter a valid email address'; end if;
  if length(trim(coalesce(checkout_shipping_address->>'recipient_name', ''))) < 2 or
     length(trim(coalesce(checkout_shipping_address->>'address_line_1', ''))) < 3 or
     length(trim(coalesce(checkout_shipping_address->>'city', ''))) < 2 then
    raise exception 'Complete the delivery address';
  end if;
  select * into shipping_row from public.shipping_methods method
  where method.code = checkout_shipping_code and method.is_active for share;
  if not found then raise exception 'Choose a valid delivery option'; end if;
  if nullif(trim(coalesce(checkout_promotion_code, '')), '') is not null then
    select * into promotion_row from public.promotions promotion
    where upper(promotion.code) = upper(trim(checkout_promotion_code)) and promotion.is_active
      and (promotion.starts_at is null or promotion.starts_at <= now())
      and (promotion.ends_at is null or promotion.ends_at > now())
      and (promotion.usage_limit is null or promotion.usage_count < promotion.usage_limit)
    for update;
    if promotion_row.id is null then raise exception 'This promotion code is not active'; end if;
    if actor_id is not null and promotion_row.per_user_limit is not null and
       (select count(*) from public.promotion_redemptions redemption where redemption.promotion_id = promotion_row.id and redemption.user_id = actor_id) >= promotion_row.per_user_limit then
      raise exception 'You have already used this promotion';
    end if;
  end if;

  -- Lock and price each variant from trusted catalog rows.
  for item in select value from jsonb_array_elements(checkout_items)
  loop
    requested_quantity := coalesce((item->>'quantity')::integer, 0);
    if requested_quantity < 1 or requested_quantity > 99 then raise exception 'Invalid product quantity'; end if;
    select variant.id, variant.product_id, variant.sku, variant.name as variant_name,
           product.name as product_name, product.attributes,
           coalesce(variant.price_cents, product.base_price_cents) as price_cents
      into variant_row
    from public.product_variants variant
    join public.products product on product.id = variant.product_id
    where variant.id = (item->>'variant_id')::uuid and variant.is_active and product.status = 'active'
    for share of variant, product;
    if variant_row.id is null then raise exception 'A product in your cart is no longer available'; end if;
    select level.variant_id, level.location_id, level.quantity_on_hand, level.quantity_reserved
      into stock_row from public.inventory_levels level
    where level.variant_id = variant_row.id and level.quantity_on_hand - level.quantity_reserved >= requested_quantity
    order by level.quantity_on_hand - level.quantity_reserved desc limit 1 for update;
    if stock_row.variant_id is null then raise exception 'Not enough stock is available for %', variant_row.product_name; end if;
    unit_price := variant_row.price_cents;
    subtotal := subtotal + unit_price * requested_quantity;
    if promotion_row.id is not null and (promotion_row.seller_store_id is null or promotion_row.seller_store_id = (select seller_store_id from public.products where id = variant_row.product_id)) then
      eligible_subtotal := eligible_subtotal + unit_price * requested_quantity;
    end if;
  end loop;
  if promotion_row.id is not null then
    if eligible_subtotal < promotion_row.minimum_order_cents then raise exception 'This order does not meet the promotion minimum'; end if;
    discount_total := case when promotion_row.discount_type = 'percentage' then round(eligible_subtotal * promotion_row.discount_value / 100.0) else least(eligible_subtotal, promotion_row.discount_value) end;
    if promotion_row.maximum_discount_cents is not null then discount_total := least(discount_total, promotion_row.maximum_discount_cents); end if;
  end if;
  total := subtotal - discount_total + shipping_row.price_cents;

  insert into public.orders (
    user_id, email, phone, status, payment_status, fulfillment_status, currency,
    subtotal_cents, discount_cents, shipping_cents, total_cents, shipping_method_name,
    shipping_address, customer_note, checkout_token
  ) values (
    actor_id, lower(trim(checkout_email)), nullif(left(trim(coalesce(checkout_phone, '')), 40), ''),
    case when lower(coalesce(checkout_provider, 'manual')) in ('manual', 'cash_on_delivery') then 'confirmed'::public.order_status else 'pending'::public.order_status end,
    'pending', 'unfulfilled', 'BZD', subtotal, discount_total, shipping_row.price_cents, total, shipping_row.name,
    checkout_shipping_address, nullif(left(trim(coalesce(checkout_note, '')), 2000), ''), checkout_idempotency_key
  ) returning id, order_number into created_order_uuid, order_no;

  for item in select value from jsonb_array_elements(checkout_items)
  loop
    requested_quantity := (item->>'quantity')::integer;
    select variant.id, variant.product_id, variant.sku, variant.name as variant_name,
           product.name as product_name, product.attributes,
           coalesce(variant.price_cents, product.base_price_cents) as price_cents
      into variant_row
    from public.product_variants variant join public.products product on product.id = variant.product_id
    where variant.id = (item->>'variant_id')::uuid;
    select level.variant_id, level.location_id, level.quantity_on_hand, level.quantity_reserved
      into stock_row from public.inventory_levels level
    where level.variant_id = variant_row.id and level.quantity_on_hand - level.quantity_reserved >= requested_quantity
    order by level.quantity_on_hand - level.quantity_reserved desc limit 1 for update;
    if stock_row.variant_id is null then raise exception 'Not enough stock is available for %', variant_row.product_name; end if;
    update public.inventory_levels set quantity_reserved = quantity_reserved + requested_quantity, updated_at = now()
    where variant_id = stock_row.variant_id and location_id = stock_row.location_id;
    insert into public.order_items (
      order_id, product_id, variant_id, sku, product_name, variant_name,
      quantity, unit_price_cents, product_snapshot
    ) values (
      created_order_uuid, variant_row.product_id, variant_row.id, variant_row.sku,
      variant_row.product_name, variant_row.variant_name, requested_quantity,
      variant_row.price_cents, jsonb_build_object('attributes', variant_row.attributes)
    );
  end loop;

  perform public.finalize_seller_order_splits(created_order_uuid);
  if promotion_row.id is not null then
    insert into public.promotion_redemptions(promotion_id, user_id, order_id, discount_cents)
    values (promotion_row.id, actor_id, created_order_uuid, discount_total);
    update public.promotions set usage_count = usage_count + 1, updated_at = now() where id = promotion_row.id;
  end if;
  insert into public.payments (order_id, provider, status, amount_cents, currency)
  values (created_order_uuid, left(coalesce(nullif(trim(checkout_provider), ''), 'manual'), 60), 'pending', total, 'BZD')
  returning id into payment_id;
  insert into public.order_status_history(order_id, status, note, changed_by)
  values (created_order_uuid, case when lower(coalesce(checkout_provider, 'manual')) in ('manual', 'cash_on_delivery') then 'confirmed'::public.order_status else 'pending'::public.order_status end,
          'Order created at checkout', actor_id);

  if actor_id is not null then
    update public.carts set status = 'converted', updated_at = now()
    where user_id = actor_id and status = 'active';
    insert into public.notifications(user_id, kind, title, body, href)
    values (actor_id, 'order_created', 'Order received', 'Your BelGlow order #' || order_no || ' has been received.', '/account');
  end if;
  insert into public.notifications(user_id, kind, title, body, href)
  select store.owner_id, 'seller_order', 'New order', 'A new order is ready in your seller dashboard.', '/dashboard/orders'
  from public.seller_orders seller_order join public.seller_stores store on store.id = seller_order.seller_store_id
  where seller_order.order_id = created_order_uuid;
  return query select created_order_uuid, order_no, total, payment_id;
end;
$$;

