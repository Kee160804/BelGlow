"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";

type Workspace = "orders" | "inventory" | "payouts";
type SellerOrder = { id: string; order_id: string; status: string; item_subtotal_cents: number; platform_fee_cents: number; seller_net_cents: number; created_at: string };
type CustomerOrder = { id: string; order_number: number; email: string; payment_status: string; created_at: string };
type SellerPayout = { id: string; status: string; net_payout_cents: number; created_at: string; failure_reason: string | null };
type StockRow = { variant_id: string; product_id: string; sku: string; name: string; quantity_on_hand: number; quantity_reserved: number; location_id: string };

export default function SellerOperations({ workspace }: { workspace: Workspace }) {
  const [orders, setOrders] = useState<SellerOrder[]>([]);
  const [customerOrders, setCustomerOrders] = useState<Map<string, CustomerOrder>>(new Map());
  const [payouts, setPayouts] = useState<SellerPayout[]>([]);
  const [stock, setStock] = useState<StockRow[]>([]);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError("Sign in again to access seller data.");
      setLoading(false);
      return;
    }
    const { data: store } = await supabase.from("seller_stores").select("id").eq("owner_id", user.id).maybeSingle();
    if (!store) {
      setError("No seller store is connected to this account.");
      setLoading(false);
      return;
    }

    if (workspace === "orders") {
      const { data, error: queryError } = await supabase.from("seller_orders").select("id, order_id, status, item_subtotal_cents, platform_fee_cents, seller_net_cents, created_at").eq("seller_store_id", store.id).order("created_at", { ascending: false });
      if (queryError) setError(queryError.message);
      const rows = (data ?? []) as SellerOrder[];
      setOrders(rows);
      if (rows.length) {
        const { data: orderRows } = await supabase.from("orders").select("id, order_number, email, payment_status, created_at").in("id", rows.map((row) => row.order_id));
        setCustomerOrders(new Map(((orderRows ?? []) as CustomerOrder[]).map((row) => [row.id, row])));
      }
    } else if (workspace === "payouts") {
      const { data, error: queryError } = await supabase.from("seller_payouts").select("id, status, net_payout_cents, created_at, failure_reason").eq("seller_store_id", store.id).order("created_at", { ascending: false });
      if (queryError) setError(queryError.message);
      setPayouts((data ?? []) as SellerPayout[]);
    } else {
      const { data: productRows, error: productError } = await supabase.from("products").select("id, name").eq("seller_store_id", store.id);
      if (productError) setError(productError.message);
      if (productRows?.length) {
        const { data: variants } = await supabase.from("product_variants").select("id, product_id, sku, name").in("product_id", productRows.map((row) => row.id));
        const variantRows = variants ?? [];
        if (variantRows.length) {
          const { data: levels } = await supabase.from("inventory_levels").select("variant_id, location_id, quantity_on_hand, quantity_reserved").in("variant_id", variantRows.map((row) => row.id));
          const productNames = new Map(productRows.map((row) => [row.id, row.name]));
          const variantNames = new Map(variantRows.map((row) => [row.id, row]));
          const rows = (levels ?? []).map((level) => {
            const variant = variantNames.get(level.variant_id);
            return { ...level, product_id: variant?.product_id ?? "", sku: variant?.sku ?? "", name: productNames.get(variant?.product_id ?? "") ?? variant?.name ?? "Product" } as StockRow;
          });
          setStock(rows);
          setQuantities(Object.fromEntries(rows.map((row) => [row.variant_id, String(row.quantity_on_hand)])));
        } else setStock([]);
      } else setStock([]);
    }
    setLoading(false);
  }, [workspace]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function updateStock(row: StockRow) {
    const quantity = Number(quantities[row.variant_id]);
    if (!Number.isInteger(quantity) || quantity < row.quantity_reserved || quantity > 100000) {
      setError(`Quantity must be between reserved stock (${row.quantity_reserved}) and 100,000.`);
      return;
    }
    setBusy(row.variant_id);
    setError("");
    const { error: updateError } = await createClient().from("inventory_levels").update({ quantity_on_hand: quantity }).eq("variant_id", row.variant_id).eq("location_id", row.location_id);
    setBusy("");
    if (updateError) setError(updateError.message);
    else {
      setNotice("Inventory updated.");
      await load();
    }
  }

  async function advanceFulfillment(row: SellerOrder) {
    const nextStatus = row.status === "new" ? "accepted" : row.status === "accepted" ? "processing" : row.status === "processing" ? "shipped" : null;
    if (!nextStatus) return;
    setBusy(row.id);
    setError("");
    const patch: Record<string, string> = { status: nextStatus };
    if (nextStatus === "accepted") patch.accepted_at = new Date().toISOString();
    if (nextStatus === "shipped") patch.shipped_at = new Date().toISOString();
    const { error: updateError } = await createClient().from("seller_orders").update(patch).eq("id", row.id);
    setBusy("");
    if (updateError) setError(updateError.message);
    else {
      setNotice(`Order moved to ${nextStatus}.`);
      await load();
    }
  }

  return <section className="rounded-2xl border border-[#ede3df] bg-white p-5 shadow-sm">
    <div><h2 className="text-lg font-bold">{workspace === "orders" ? "Your seller orders" : workspace === "inventory" ? "Live inventory" : "Payout history"}</h2><p className="mt-1 text-sm text-[#7b7072]">{workspace === "orders" ? "Only orders allocated to your store are shown." : workspace === "inventory" ? "Update stock levels for your own product variants." : "Balances and payout records from the seller ledger."}</p></div>
    {error && <p role="alert" className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
    {notice && <p role="status" className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</p>}
    {loading ? <p className="py-12 text-center text-sm text-[#817679]">Loading…</p> : workspace === "orders" ? orders.length ? <div className="mt-5 divide-y divide-[#eee5e1]">{orders.map((row) => {
      const order = customerOrders.get(row.order_id);
      const next = row.status === "new" ? "Accept order" : row.status === "accepted" ? "Start processing" : row.status === "processing" ? "Mark shipped" : null;
      return <article key={row.id} className="flex flex-wrap items-center gap-4 py-4"><div className="min-w-0 flex-1"><p className="font-semibold">Order #{order?.order_number ?? row.order_id.slice(0, 8)}</p><p className="mt-1 text-xs text-[#817679]">{order?.email ?? "Customer"} · {order?.payment_status ?? "Payment pending"} · {new Date(row.created_at).toLocaleDateString()}</p><p className="mt-2 text-xs text-[#817679]">Gross BZ${(row.item_subtotal_cents / 100).toFixed(2)} · Fee BZ${(row.platform_fee_cents / 100).toFixed(2)} · You BZ${(row.seller_net_cents / 100).toFixed(2)}</p></div><span className="rounded-full bg-[#fff3ef] px-3 py-1 text-xs font-semibold capitalize text-[#9b5a57]">{row.status}</span>{next && <button disabled={busy === row.id} onClick={() => void advanceFulfillment(row)} className="rounded-lg bg-[#bf6d68] px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{next}</button>}</article>;
    })}</div> : <p className="mt-5 rounded-xl bg-[#faf6f4] p-5 text-sm text-[#756a6d]">No orders have been allocated to your store.</p> : workspace === "inventory" ? stock.length ? <div className="mt-5 divide-y divide-[#eee5e1]">{stock.map((row) => <article key={`${row.variant_id}-${row.location_id}`} className="flex flex-wrap items-center gap-3 py-4"><div className="min-w-0 flex-1"><p className="font-semibold">{row.name}</p><p className="mt-1 text-xs text-[#817679]">SKU {row.sku} · {row.quantity_reserved} reserved</p></div><input aria-label={`Stock quantity for ${row.name}`} type="number" min={row.quantity_reserved} value={quantities[row.variant_id] ?? "0"} onChange={(event) => setQuantities((current) => ({ ...current, [row.variant_id]: event.target.value }))} className="h-10 w-24 rounded-lg border border-[#ddd3d0] px-3 text-sm" /><button disabled={Boolean(busy)} onClick={() => void updateStock(row)} className="rounded-lg border border-[#d9c2bd] px-3 py-2 text-xs font-bold text-[#9b5a57] disabled:opacity-50">Save stock</button></article>)}</div> : <p className="mt-5 rounded-xl bg-[#faf6f4] p-5 text-sm text-[#756a6d]">No inventory records found.</p> : payouts.length ? <div className="mt-5 divide-y divide-[#eee5e1]">{payouts.map((payout) => <article key={payout.id} className="flex justify-between gap-4 py-4"><div><p className="font-semibold capitalize">{payout.status}</p><p className="mt-1 text-xs text-[#817679]">{new Date(payout.created_at).toLocaleDateString()}{payout.failure_reason ? ` · ${payout.failure_reason}` : ""}</p></div><strong>BZ${(payout.net_payout_cents / 100).toFixed(2)}</strong></article>)}</div> : <p className="mt-5 rounded-xl bg-[#faf6f4] p-5 text-sm text-[#756a6d]">No seller payouts have been recorded yet.</p>}
  </section>;
}
