-- Customer-facing order tracking, cancellation, and seller-status notifications.

create or replace function public.cancel_customer_order(
  target_order_id uuid,
  cancellation_note text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  purchase public.orders%rowtype;
  payment_row public.payments%rowtype;
  refund_already bigint := 0;
  refund_due bigint := 0;
  refund_pending boolean := false;
  safe_reason text := left(nullif(trim(coalesce(cancellation_note, '')), ''), 500);
begin
  if actor_id is null then raise exception 'Sign in to cancel this order'; end if;

  select * into purchase
  from public.orders
  where id = target_order_id and user_id = actor_id
  for update;
  if not found then raise exception 'Order not found'; end if;
  if purchase.status not in ('pending', 'confirmed', 'processing')
     or purchase.fulfillment_status not in ('unfulfilled', 'processing') then
    raise exception 'This order can no longer be cancelled';
  end if;
  if exists (
    select 1 from public.seller_orders seller_order
    where seller_order.order_id = target_order_id
      and seller_order.status in ('shipped', 'delivered', 'refunded')
  ) then raise exception 'A seller has already shipped this order'; end if;

  select * into payment_row
  from public.payments
  where order_id = target_order_id and status in ('paid', 'partially_refunded')
  order by processed_at desc nulls last, created_at desc
  limit 1
  for update;

  if purchase.payment_status in ('paid', 'partially_refunded') and payment_row.id is null then
    raise exception 'We could not verify the payment for this order. Contact support before cancelling.';
  end if;

  if payment_row.id is not null then
    select coalesce(sum(amount_cents), 0)::bigint into refund_already
    from public.refunds
    where order_id = target_order_id and status in ('pending', 'refunded');
    refund_due := greatest(purchase.total_cents - refund_already, 0);
    if refund_due > 0 then
      insert into public.refunds(order_id, payment_id, amount_cents, currency, status, reason)
      values (target_order_id, payment_row.id, refund_due, payment_row.currency, 'pending', coalesce(safe_reason, 'Customer cancelled before shipment'));
      refund_pending := true;
    elsif exists (select 1 from public.refunds where order_id = target_order_id and status = 'pending') then
      refund_pending := true;
    end if;
  end if;

  if purchase.inventory_committed then
    perform public.restore_order_inventory(target_order_id);
  else
    perform public.release_order_inventory(target_order_id);
  end if;

  update public.orders
  set status = 'cancelled', fulfillment_status = 'cancelled',
      cancellation_reason = coalesce(safe_reason, 'Cancelled by customer'), updated_at = now()
  where id = target_order_id;

  update public.seller_orders
  set status = 'cancelled', updated_at = now()
  where order_id = target_order_id and status not in ('shipped', 'delivered', 'refunded', 'cancelled');

  update public.order_requests
  set status = 'completed', admin_note = 'Order cancelled by customer', resolved_by = actor_id,
      resolved_at = now(), updated_at = now()
  where order_id = target_order_id and user_id = actor_id and request_type = 'cancel' and status = 'pending';

  insert into public.order_status_history(order_id, status, note, changed_by)
  values (target_order_id, 'cancelled', coalesce(safe_reason, 'Cancelled by customer'), actor_id);

  insert into public.notifications(user_id, kind, title, body, href)
  values (
    actor_id,
    'order_cancelled',
    'Order cancelled',
    'Order #' || purchase.order_number || ' was cancelled.' || case when refund_pending then ' Your refund is pending processing.' else '' end,
    '/account?order=' || purchase.order_number
  );

  insert into public.notifications(user_id, kind, title, body, href)
  select distinct store.owner_id, 'seller_order_cancelled', 'Customer cancelled an order',
    'Order #' || purchase.order_number || ' was cancelled by the customer.', '/dashboard/orders'
  from public.seller_orders seller_order
  join public.seller_stores store on store.id = seller_order.seller_store_id
  where seller_order.order_id = target_order_id;

  return jsonb_build_object('refundPending', refund_pending, 'refundAmountCents', case when refund_pending then refund_due else 0 end);
end;
$$;

revoke execute on function public.cancel_customer_order(uuid, text) from public, anon;
grant execute on function public.cancel_customer_order(uuid, text) to authenticated;

create or replace function public.notify_customer_seller_order_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  purchase public.orders%rowtype;
  business_name text;
  notification_title text;
  notification_body text;
  history_status public.order_status;
begin
  if new.status is not distinct from old.status then return new; end if;
  if new.status not in ('accepted', 'processing', 'shipped', 'delivered') then return new; end if;

  select * into purchase from public.orders where id = new.order_id;
  if purchase.id is null or purchase.user_id is null then return new; end if;
  select name into business_name from public.seller_stores where id = new.seller_store_id;
  business_name := coalesce(nullif(trim(business_name), ''), 'A BelGlow business');

  if new.status = 'accepted' then
    notification_title := business_name || ' confirmed your order';
    notification_body := business_name || ' confirmed order #' || purchase.order_number || '.';
    history_status := 'confirmed';
  elsif new.status = 'processing' then
    notification_title := business_name || ' is preparing your order';
    notification_body := business_name || ' started preparing order #' || purchase.order_number || '.';
    history_status := 'processing';
  elsif new.status = 'shipped' then
    notification_title := business_name || ' marked your order ready';
    notification_body := 'Order #' || purchase.order_number || ' from ' || business_name || ' is ready. Open the order to see delivery or tracking details.';
    history_status := 'processing';
  else
    notification_title := 'Order delivered';
    notification_body := business_name || ' marked order #' || purchase.order_number || ' as delivered.';
    history_status := case when not exists (
      select 1 from public.seller_orders seller_order
      where seller_order.order_id = purchase.id and seller_order.status <> 'delivered'
    ) then 'completed' else 'processing' end;
  end if;

  insert into public.notifications(user_id, kind, title, body, href)
  values (purchase.user_id, 'seller_order_' || new.status::text, notification_title, notification_body,
    '/account?order=' || purchase.order_number);

  insert into public.order_status_history(order_id, status, note, changed_by)
  values (purchase.id, history_status, notification_body, auth.uid());

  return new;
end;
$$;

drop trigger if exists notify_customer_seller_order_status on public.seller_orders;
create trigger notify_customer_seller_order_status
  after update of status on public.seller_orders
  for each row execute function public.notify_customer_seller_order_status();

revoke execute on function public.notify_customer_seller_order_status() from public, anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;

notify pgrst, 'reload schema';
