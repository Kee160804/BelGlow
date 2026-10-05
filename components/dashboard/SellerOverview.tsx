"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";

type OrderRow = { id: string; order_id: string; status: string; item_subtotal_cents: number; platform_fee_cents: number; seller_net_cents: number; created_at: string };
type OrderDetail = { id: string; order_number: number; payment_status: string; created_at: string };
type LedgerEntry = { amount_cents: number; entry_type: string; available_at: string };

export default function SellerOverview({ userName }: { userName: string }) {
  const [storeName, setStoreName] = useState("");
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [orderNumbers, setOrderNumbers] = useState<Map<string, OrderDetail>>(new Map());
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [productCount, setProductCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError("Your session expired. Sign in again."); setLoading(false); return; }
    const { data: store } = await supabase.from("seller_stores").select("id, name").eq("owner_id", user.id).maybeSingle();
    if (!store) { setError("No seller store is connected to your account."); setLoading(false); return; }
    setStoreName(store.name);
    const [orderResult, ledgerResult, productsResult] = await Promise.all([
      supabase.from("seller_orders").select("id, order_id, status, item_subtotal_cents, platform_fee_cents, seller_net_cents, created_at").eq("seller_store_id", store.id).order("created_at", { ascending: false }).limit(10),
      supabase.from("seller_ledger_entries").select("amount_cents, entry_type, available_at").eq("seller_store_id", store.id),
      supabase.from("products").select("id", { count: "exact", head: true }).eq("seller_store_id", store.id),
    ]);
    if (orderResult.error) setError(orderResult.error.message);
    const orderRows = (orderResult.data ?? []) as OrderRow[];
    setOrders(orderRows);
    setLedger((ledgerResult.data ?? []) as LedgerEntry[]);
    setProductCount(productsResult.count ?? 0);
    if (orderRows.length) {
      const { data } = await supabase.from("orders").select("id, order_number, payment_status, created_at").in("id", orderRows.map((row) => row.order_id));
      setOrderNumbers(new Map(((data ?? []) as OrderDetail[]).map((row) => [row.id, row])));
    }
    setLoading(false);
  }, []);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  const grossSales = orders.reduce((sum, row) => sum + row.item_subtotal_cents, 0);
  const platformFees = orders.reduce((sum, row) => sum + row.platform_fee_cents, 0);
  const availableBalance = ledger.filter((entry) => entry.available_at <= new Date().toISOString()).reduce((sum, entry) => sum + entry.amount_cents, 0);

  return <div className="p-4 sm:p-7 lg:p-8">
    <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm text-[#8b7877]">Seller dashboard</p><h1 className="mt-1 font-serif text-3xl font-semibold sm:text-4xl">Welcome, {userName}</h1><p className="mt-1 text-[#695f62]">{storeName || "Your store"} · Live marketplace data</p></div><Link href="/dashboard/add-product" className="rounded-xl bg-[#bf6d68] px-5 py-3 text-center font-bold text-white">Add product</Link></div>
    {error && <p role="alert" className="mt-5 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
    {loading ? <p className="py-16 text-center text-sm text-[#817679]">Loading your seller data…</p> : <>
      <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Live seller summary"><Metric label="Gross sales" value={`BZ$${(grossSales / 100).toFixed(2)}`} /><Metric label="Seller orders" value={orders.length.toString()} /><Metric label="Platform commission" value={`BZ$${(platformFees / 100).toFixed(2)}`} /><Metric label="Available ledger balance" value={`BZ$${(availableBalance / 100).toFixed(2)}`} /></section>
      <div className="mt-5 grid gap-5 xl:grid-cols-[1.3fr_.7fr]"><section className="rounded-2xl border border-[#ede3df] bg-white p-5"><div className="flex items-center justify-between"><h2 className="text-lg font-bold">Recent orders</h2><Link href="/dashboard/orders" className="text-sm font-semibold text-[#a95b58] underline">View all</Link></div>{orders.length ? <div className="mt-3 divide-y divide-[#eee5e1]">{orders.slice(0, 6).map((row) => <div key={row.id} className="flex flex-wrap items-center gap-3 py-3"><div className="min-w-0 flex-1"><p className="font-semibold">Order #{orderNumbers.get(row.order_id)?.order_number ?? row.order_id.slice(0, 8)}</p><p className="mt-1 text-xs text-[#817679]">{new Date(row.created_at).toLocaleDateString()} · {orderNumbers.get(row.order_id)?.payment_status ?? "payment pending"}</p></div><span className="text-right text-xs text-[#817679]">{row.status}<strong className="mt-1 block text-sm text-[#292527]">BZ${(row.seller_net_cents / 100).toFixed(2)}</strong></span></div>)}</div> : <p className="mt-4 rounded-xl bg-[#faf6f4] p-5 text-sm text-[#756a6d]">Orders will appear here after customers place paid orders.</p>}</section>
        <div className="grid gap-5"><section className="rounded-2xl border border-[#ede3df] bg-white p-5"><h2 className="text-lg font-bold">Catalog</h2><p className="mt-2 text-3xl font-black">{productCount}</p><p className="mt-1 text-sm text-[#756a6d]">Products, including drafts and pending reviews</p><Link href="/dashboard/products" className="mt-4 inline-block text-sm font-bold text-[#a95b58] underline">Manage products</Link></section><section className="rounded-2xl border border-[#ede3df] bg-white p-5"><h2 className="text-lg font-bold">Payout status</h2><p className="mt-2 text-sm leading-6 text-[#756a6d]">Your seller balance is calculated from the ledger and the configured payout hold. Actual transfers require a supported payout provider.</p><Link href="/dashboard/payouts" className="mt-4 inline-block text-sm font-bold text-[#a95b58] underline">View payout records</Link></section></div>
      </div>
    </>}
  </div>;
}

function Metric({ label, value }: { label: string; value: string }) { return <article className="rounded-2xl border border-[#ede3df] bg-white p-4 shadow-sm"><p className="text-xs text-[#766c6e]">{label}</p><p className="mt-1 font-serif text-2xl font-bold">{value}</p></article>; }
