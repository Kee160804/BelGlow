-- The commission ledger was introduced after seller orders already existed.
-- Add charges for prior confirmed orders so sellers' balances include their
-- earned fees and payments can reconcile against the same ledger.
begin;

insert into public.seller_commission_entries(
  seller_store_id, seller_order_id, entry_type, amount_cents, description
)
select
  seller_order.seller_store_id,
  seller_order.id,
  'sale_commission',
  seller_order.platform_fee_cents,
  'BelGlow commission for order #' || purchase.order_number
from public.seller_orders seller_order
join public.orders purchase on purchase.id = seller_order.order_id
where seller_order.payment_status = 'confirmed'
  and seller_order.platform_fee_cents > 0
on conflict (seller_order_id) where entry_type = 'sale_commission' do nothing;

commit;
