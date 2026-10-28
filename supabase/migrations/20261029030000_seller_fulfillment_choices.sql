-- Seller-configured delivery/pickup and offline payment methods.

alter table public.seller_stores
  add column if not exists offers_delivery boolean not null default true,
  add column if not exists offers_pickup boolean not null default true,
  add column if not exists delivery_fee_cents bigint check (delivery_fee_cents is null or delivery_fee_cents >= 0),
  add column if not exists pickup_address text;

alter table public.seller_orders
  add column if not exists fulfillment_method text,
  add column if not exists delivery_fee_cents bigint not null default 0 check (delivery_fee_cents >= 0),
  add column if not exists payment_method text;

alter table public.seller_orders drop constraint if exists seller_orders_payment_status_check;
alter table public.seller_orders add constraint seller_orders_payment_status_check check (
  payment_status in ('awaiting_payment', 'under_review', 'confirmed', 'rejected', 'due_on_delivery', 'due_on_pickup')
);
alter table public.seller_orders add constraint seller_orders_fulfillment_method_check check (
  fulfillment_method is null or fulfillment_method in ('delivery', 'pickup')
);
alter table public.seller_orders add constraint seller_orders_payment_method_check check (
  payment_method is null or payment_method in ('bank_transfer', 'pay_on_delivery', 'pay_on_pickup')
);

insert into public.shipping_methods(name, code, description, price_cents, estimated_days_min, estimated_days_max, sort_order, is_active)
values ('Seller fulfillment', 'SELLER-DIRECT', 'Delivery or pickup arranged by each seller.', 0, 0, 7, 0, true)
on conflict (code) do update set price_cents = 0, is_active = true, updated_at = now();

create or replace function public.save_seller_checkout_settings(
  checkout_offers_delivery boolean,
  checkout_delivery_fee_cents bigint,
  checkout_offers_pickup boolean,
  checkout_pickup_address text
)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if checkout_delivery_fee_cents is not null and checkout_delivery_fee_cents < 0 then
    raise exception 'Delivery fee cannot be negative';
  end if;
  if checkout_offers_pickup and length(trim(coalesce(checkout_pickup_address, ''))) < 5 then
    raise exception 'Enter the pickup address customers should visit';
  end if;
  update public.seller_stores set
    offers_delivery = checkout_offers_delivery,
    delivery_fee_cents = case when checkout_offers_delivery then checkout_delivery_fee_cents else null end,
    offers_pickup = checkout_offers_pickup,
    pickup_address = case when checkout_offers_pickup then left(trim(checkout_pickup_address), 500) else null end,
    updated_at = now()
  where owner_id = auth.uid() and status = 'approved';
  if not found then raise exception 'An approved seller store is required'; end if;
end;
$$;
revoke execute on function public.save_seller_checkout_settings(boolean, bigint, boolean, text) from public, anon;
grant execute on function public.save_seller_checkout_settings(boolean, bigint, boolean, text) to authenticated;

-- Make the payment-demo store immediately testable. Sellers can replace these
-- values from Dashboard > Settings.
update public.seller_stores store set
  offers_delivery = true,
  offers_pickup = true,
  delivery_fee_cents = 500,
  pickup_address = coalesce(nullif(store.location, ''), 'BelGlow Demo Pickup, Belize City'),
  updated_at = now()
where exists (
  select 1 from public.products product
  where product.seller_store_id = store.id and product.slug like 'payment-demo-%'
);

create or replace function public.finalize_seller_order_splits(target_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.seller_orders (
    order_id, seller_store_id, item_subtotal_cents, customer_payment_cents,
    platform_fee_cents, seller_net_cents, payment_status
  )
  select item.order_id, item.seller_store_id, sum(item.total_cents), sum(item.total_cents),
    round(sum(item.total_cents) * 0.10), sum(item.total_cents) - round(sum(item.total_cents) * 0.10),
    'awaiting_payment'
  from public.order_items item
  where item.order_id = target_order_id and item.seller_store_id is not null
  group by item.order_id, item.seller_store_id
  on conflict (order_id, seller_store_id) do update set
    item_subtotal_cents = excluded.item_subtotal_cents,
    updated_at = now();

  with raw as (
    select seller_order.id,
      floor(purchase.discount_cents::numeric * seller_order.item_subtotal_cents / nullif(purchase.subtotal_cents, 0))::bigint as base_discount,
      (purchase.discount_cents::numeric * seller_order.item_subtotal_cents / nullif(purchase.subtotal_cents, 0)) % 1 as fraction,
      purchase.discount_cents
    from public.seller_orders seller_order
    join public.orders purchase on purchase.id = seller_order.order_id
    where seller_order.order_id = target_order_id
  ), ranked as (
    select raw.*,
      raw.discount_cents - sum(raw.base_discount) over () as remainder,
      row_number() over (order by raw.fraction desc, raw.id) as remainder_rank
    from raw
  ), allocated as (
    select id, base_discount + case when remainder_rank <= remainder then 1 else 0 end as allocated_discount
    from ranked
  )
  update public.seller_orders seller_order set
    customer_payment_cents = greatest(0, seller_order.item_subtotal_cents - allocated.allocated_discount),
    platform_fee_cents = round(greatest(0, seller_order.item_subtotal_cents - allocated.allocated_discount) * 0.10),
    seller_net_cents = greatest(0, seller_order.item_subtotal_cents - allocated.allocated_discount)
      - round(greatest(0, seller_order.item_subtotal_cents - allocated.allocated_discount) * 0.10),
    updated_at = now()
  from allocated where allocated.id = seller_order.id;
end;
$$;

create or replace function public.create_marketplace_order_v2(
  checkout_items jsonb,
  checkout_email text,
  checkout_phone text,
  checkout_shipping_address jsonb,
  checkout_note text,
  checkout_promotion_code text,
  checkout_fulfillment_method text,
  checkout_payment_method text,
  checkout_idempotency_key uuid
)
returns table (created_order_id uuid, created_order_number bigint, created_total_cents bigint, created_payment_id uuid)
language plpgsql security definer set search_path = '' as $$
declare
  created record;
  existing_order public.orders%rowtype;
  existing_payment_id uuid;
  fee_total bigint := 0;
  effective_shipping_address jsonb := checkout_shipping_address;
begin
  select * into existing_order from public.orders where checkout_token = checkout_idempotency_key;
  if existing_order.id is not null and exists (
    select 1 from public.seller_orders where order_id = existing_order.id and payment_method is not null
  ) then
    select id into existing_payment_id from public.payments where order_id = existing_order.id order by created_at limit 1;
    return query select existing_order.id, existing_order.order_number, existing_order.total_cents, existing_payment_id;
    return;
  end if;
  if checkout_fulfillment_method not in ('delivery', 'pickup') then raise exception 'Choose delivery or pickup'; end if;
  if checkout_payment_method not in ('bank_transfer', 'pay_on_delivery', 'pay_on_pickup') then raise exception 'Choose a valid payment method'; end if;
  if checkout_payment_method = 'pay_on_delivery' and checkout_fulfillment_method <> 'delivery' then raise exception 'Pay on delivery requires delivery'; end if;
  if checkout_payment_method = 'pay_on_pickup' and checkout_fulfillment_method <> 'pickup' then raise exception 'Pay on pickup requires store pickup'; end if;
  if checkout_fulfillment_method = 'pickup' then
    effective_shipping_address := coalesce(checkout_shipping_address, '{}'::jsonb) ||
      jsonb_build_object('address_line_1', 'Store pickup', 'city', 'Seller location');
  end if;

  if checkout_fulfillment_method = 'delivery' and exists (
    select 1 from jsonb_array_elements(checkout_items) item
    join public.product_variants variant on variant.id = (item->>'variant_id')::uuid
    join public.products product on product.id = variant.product_id
    join public.seller_stores store on store.id = product.seller_store_id
    where not store.offers_delivery
  ) then raise exception 'A seller in this cart does not offer delivery'; end if;

  if checkout_fulfillment_method = 'pickup' and exists (
    select 1 from jsonb_array_elements(checkout_items) item
    join public.product_variants variant on variant.id = (item->>'variant_id')::uuid
    join public.products product on product.id = variant.product_id
    join public.seller_stores store on store.id = product.seller_store_id
    where not store.offers_pickup or nullif(trim(store.pickup_address), '') is null
  ) then raise exception 'A seller in this cart has not configured store pickup'; end if;

  if checkout_payment_method = 'bank_transfer' and exists (
    select 1 from jsonb_array_elements(checkout_items) item
    join public.product_variants variant on variant.id = (item->>'variant_id')::uuid
    join public.products product on product.id = variant.product_id
    left join public.seller_payment_profiles profile on profile.seller_store_id = product.seller_store_id and profile.is_active
    where profile.seller_store_id is null
  ) then raise exception 'A seller in this cart has not configured bank transfer payments'; end if;

  select * into created from public.create_marketplace_order(
    checkout_items, checkout_email, checkout_phone, effective_shipping_address,
    'SELLER-DIRECT', checkout_note, checkout_promotion_code, checkout_payment_method,
    checkout_idempotency_key
  );

  perform public.finalize_seller_order_splits(created.created_order_id);

  update public.seller_orders seller_order set
    fulfillment_method = checkout_fulfillment_method,
    delivery_fee_cents = case when checkout_fulfillment_method = 'delivery' then coalesce(store.delivery_fee_cents, 0) else 0 end,
    payment_method = checkout_payment_method,
    payment_status = case checkout_payment_method
      when 'pay_on_delivery' then 'due_on_delivery'
      when 'pay_on_pickup' then 'due_on_pickup'
      else 'awaiting_payment'
    end,
    customer_payment_cents = seller_order.customer_payment_cents + case when checkout_fulfillment_method = 'delivery' then coalesce(store.delivery_fee_cents, 0) else 0 end,
    seller_net_cents = seller_order.seller_net_cents + case when checkout_fulfillment_method = 'delivery' then coalesce(store.delivery_fee_cents, 0) else 0 end,
    updated_at = now()
  from public.seller_stores store
  where seller_order.order_id = created.created_order_id and store.id = seller_order.seller_store_id;

  select coalesce(sum(delivery_fee_cents), 0) into fee_total
  from public.seller_orders where order_id = created.created_order_id;

  update public.orders set
    shipping_cents = fee_total,
    total_cents = subtotal_cents - discount_cents + fee_total + tax_cents,
    shipping_method_name = case when checkout_fulfillment_method = 'delivery' then 'Seller delivery' else 'Store pickup' end,
    status = case when checkout_payment_method = 'bank_transfer' then 'pending'::public.order_status else 'confirmed'::public.order_status end,
    updated_at = now()
  where id = created.created_order_id
  returning total_cents into created.created_total_cents;

  update public.payments set provider = checkout_payment_method, amount_cents = created.created_total_cents, updated_at = now()
  where id = created.created_payment_id;

  if checkout_payment_method <> 'bank_transfer' then
    insert into public.order_status_history(order_id, status, note, changed_by)
    values (created.created_order_id, 'confirmed'::public.order_status, 'Order confirmed with payment due at fulfillment', auth.uid());
  end if;

  return query select created.created_order_id, created.created_order_number, created.created_total_cents, created.created_payment_id;
end;
$$;
revoke execute on function public.create_marketplace_order_v2(jsonb, text, text, jsonb, text, text, text, text, uuid) from public;
grant execute on function public.create_marketplace_order_v2(jsonb, text, text, jsonb, text, text, text, text, uuid) to anon, authenticated;

create or replace function public.seller_confirm_offline_payment(target_seller_order_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  seller_order_row public.seller_orders%rowtype;
  purchase public.orders%rowtype;
  store_name text;
  all_confirmed boolean;
begin
  select seller_order.* into seller_order_row
  from public.seller_orders seller_order
  join public.seller_stores store on store.id = seller_order.seller_store_id
  where seller_order.id = target_seller_order_id and store.owner_id = auth.uid()
  for update of seller_order;
  if seller_order_row.id is null then raise exception 'Seller order not found'; end if;
  if seller_order_row.payment_method not in ('pay_on_delivery', 'pay_on_pickup') then raise exception 'This order requires bank-transfer verification'; end if;
  if seller_order_row.payment_status = 'confirmed' then raise exception 'Payment is already confirmed'; end if;

  select * into purchase from public.orders where id = seller_order_row.order_id for update;
  select name into store_name from public.seller_stores where id = seller_order_row.seller_store_id;
  update public.seller_orders set payment_status = 'confirmed', updated_at = now() where id = seller_order_row.id;

  if seller_order_row.platform_fee_cents > 0 then
    insert into public.seller_commission_entries(seller_store_id, seller_order_id, entry_type, amount_cents, description)
    values (seller_order_row.seller_store_id, seller_order_row.id, 'sale_commission', seller_order_row.platform_fee_cents,
      'BelGlow 10% commission for order #' || purchase.order_number)
    on conflict (seller_order_id) where entry_type = 'sale_commission' do nothing;
  end if;

  select not exists (select 1 from public.seller_orders where order_id = purchase.id and payment_status <> 'confirmed') into all_confirmed;
  if all_confirmed then
    update public.payments set status = 'paid', processed_at = now(), updated_at = now()
    where id = (select id from public.payments where order_id = purchase.id order by created_at limit 1);
    update public.orders set payment_status = 'paid', updated_at = now() where id = purchase.id;
    perform public.commit_order_inventory(purchase.id);
  end if;

  insert into public.notification_outbox(recipient_email, kind, subject, body, order_id)
  values (purchase.email, 'payment_confirmed', 'Payment confirmed for BelGlow order #' || purchase.order_number,
    store_name || ' confirmed your ' || replace(seller_order_row.payment_method, '_', ' ') || ' payment of BZ$' ||
    to_char(seller_order_row.customer_payment_cents / 100.0, 'FM999999990.00') || '.', purchase.id);

  return jsonb_build_object('orderId', purchase.id, 'allConfirmed', all_confirmed);
end;
$$;
revoke execute on function public.seller_confirm_offline_payment(uuid) from public, anon;
grant execute on function public.seller_confirm_offline_payment(uuid) to authenticated;

create or replace function public.enforce_seller_payment_before_fulfillment()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status is distinct from old.status then
    if coalesce(new.payment_method, 'bank_transfer') = 'bank_transfer'
       and new.status in ('accepted', 'processing', 'shipped', 'delivered')
       and new.payment_status <> 'confirmed' then
      raise exception 'Confirm this bank transfer before fulfilling the order';
    end if;
    if new.payment_method in ('pay_on_delivery', 'pay_on_pickup')
       and new.status = 'delivered' and new.payment_status <> 'confirmed' then
      raise exception 'Confirm payment received before marking this order delivered';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.enforce_seller_payment_before_fulfillment() from public, anon, authenticated;

