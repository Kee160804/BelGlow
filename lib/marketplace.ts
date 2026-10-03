export const DEFAULT_COMMISSION_BPS = 1500;

export type MarketplaceLineItem = {
  productId: string;
  sellerStoreId: string | null;
  quantity: number;
  unitPriceCents: number;
  commissionRateBps?: number;
};

export type SellerOrderAllocation = {
  sellerStoreId: string;
  itemSubtotalCents: number;
  platformFeeCents: number;
  sellerNetCents: number;
  itemCount: number;
};

export type MarketplaceOrderSplit = {
  customerSubtotalCents: number;
  platformCommissionCents: number;
  platformOwnedRevenueCents: number;
  sellerNetCents: number;
  sellerOrders: SellerOrderAllocation[];
};

export function calculateCommission(grossCents: number, rateBps: number) {
  assertMoney(grossCents, "grossCents");
  assertRate(rateBps);
  return Math.round((grossCents * rateBps) / 10_000);
}

// Checkout uses this calculation server-side, then stores the returned values
// as immutable order-item and seller-order snapshots.
export function splitMarketplaceOrder(
  items: MarketplaceLineItem[],
  defaultCommissionBps = DEFAULT_COMMISSION_BPS,
): MarketplaceOrderSplit {
  assertRate(defaultCommissionBps);
  const allocations = new Map<string, SellerOrderAllocation>();
  let customerSubtotalCents = 0;
  let platformCommissionCents = 0;
  let platformOwnedRevenueCents = 0;
  let sellerNetCents = 0;

  for (const item of items) {
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) throw new Error("quantity must be a positive integer");
    assertMoney(item.unitPriceCents, "unitPriceCents");
    const grossCents = item.quantity * item.unitPriceCents;
    customerSubtotalCents += grossCents;

    // Products owned directly by BelGlow have no seller split; their gross
    // revenue belongs to the platform rather than being treated as commission.
    if (!item.sellerStoreId) {
      platformOwnedRevenueCents += grossCents;
      continue;
    }

    const rateBps = item.commissionRateBps ?? defaultCommissionBps;
    const platformFeeCents = calculateCommission(grossCents, rateBps);
    const netCents = grossCents - platformFeeCents;
    const current = allocations.get(item.sellerStoreId) ?? {
      sellerStoreId: item.sellerStoreId,
      itemSubtotalCents: 0,
      platformFeeCents: 0,
      sellerNetCents: 0,
      itemCount: 0,
    };

    current.itemSubtotalCents += grossCents;
    current.platformFeeCents += platformFeeCents;
    current.sellerNetCents += netCents;
    current.itemCount += item.quantity;
    allocations.set(item.sellerStoreId, current);
    platformCommissionCents += platformFeeCents;
    sellerNetCents += netCents;
  }

  return {
    customerSubtotalCents,
    platformCommissionCents,
    platformOwnedRevenueCents,
    sellerNetCents,
    sellerOrders: [...allocations.values()],
  };
}

function assertMoney(value: number, name: string) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${name} must be a non-negative integer number of cents`);
}

function assertRate(rateBps: number) {
  if (!Number.isInteger(rateBps) || rateBps < 0 || rateBps > 10_000) throw new Error("commission rate must be between 0 and 10,000 basis points");
}
