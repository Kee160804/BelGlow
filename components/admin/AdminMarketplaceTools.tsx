"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, CircleDollarSign, Clock, PackageCheck, Store, X } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import AdminAccessManager from "@/components/admin/AdminAccessManager";

type Section = "overview" | "sellers" | "approvals" | "commission" | "orders" | "payouts" | "customers" | "settings";
type SellerRow = { id: string; name: string; slug: string; status: string; created_at: string; rejection_reason: string | null };
type ProductRow = { id: string; name: string; seller_store_id: string; base_price_cents: number; submitted_at: string | null };
type OrderRow = { id: string; order_number: number; email: string; total_cents: number; payment_status: string; fulfillment_status: string; created_at: string };
type PayoutRow = { id: string; seller_store_id: string; status: string; net_payout_cents: number; created_at: string };

export default function AdminMarketplaceTools({ section }: { section: Section }) {
  const [sellers, setSellers] = useState<SellerRow[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [storeNames, setStoreNames] = useState<Map<string, string>>(new Map());
  const [commissionBps, setCommissionBps] = useState(1500);
  const [commissionInput, setCommissionInput] = useState("15");
  const [pendingOrders, setPendingOrders] = useState(0);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [payouts, setPayouts] = useState<PayoutRow[]>([]);
  const [customerCount, setCustomerCount] = useState(0);
  const [applicationsOpen, setApplicationsOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const supabase = createClient();
    setError("");
    const [sellerResult, productResult, settingsResult, orderResult, payoutResult, customerResult] = await Promise.all([
      supabase.from("seller_stores").select("id, name, slug, status, created_at, rejection_reason").order("created_at", { ascending: false }),
      supabase.from("products").select("id, name, seller_store_id, base_price_cents, submitted_at").eq("review_status", "submitted").not("seller_store_id", "is", null).order("submitted_at", { ascending: false }),
      supabase.from("marketplace_settings").select("default_commission_bps, seller_applications_open").eq("singleton", true).maybeSingle(),
      supabase.from("orders").select("id, order_number, email, total_cents, payment_status, fulfillment_status, created_at").order("created_at", { ascending: false }).limit(100),
      supabase.from("seller_payouts").select("id, seller_store_id, status, net_payout_cents, created_at").order("created_at", { ascending: false }).limit(100),
      supabase.from("profiles").select("id", { count: "exact", head: true }),
    ]);

    if (sellerResult.error) setError(sellerResult.error.message);
    if (productResult.error) setError((current) => current || productResult.error.message);
    if (orderResult.error) setError((current) => current || orderResult.error.message);
    const sellerRows = (sellerResult.data ?? []) as SellerRow[];
    const productRows = (productResult.data ?? []) as ProductRow[];
    setSellers(sellerRows);
    setProducts(productRows);
    setOrders((orderResult.data ?? []) as OrderRow[]);
    setPayouts((payoutResult.data ?? []) as PayoutRow[]);
    setCustomerCount(customerResult.count ?? 0);
    setStoreNames(new Map(sellerRows.map((seller) => [seller.id, seller.name])));
    if (settingsResult.data) {
      setCommissionBps(settingsResult.data.default_commission_bps);
      setCommissionInput((settingsResult.data.default_commission_bps / 100).toString());
      setApplicationsOpen(settingsResult.data.seller_applications_open);
    }
    setPendingOrders((orderResult.data ?? []).filter((order) => order.payment_status === "paid").length);
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function reviewSeller(sellerId: string, approve: boolean) {
    setBusyId(sellerId);
    setError("");
    const { error: resultError } = await createClient().rpc("admin_review_seller_application", {
      target_store_id: sellerId,
      approve,
      review_note: approve ? null : "Please contact BelGlow for next steps.",
    });
    setBusyId("");
    if (resultError) setError(resultError.message);
    else {
      setNotice(approve ? "Seller application approved." : "Seller application rejected.");
      await load();
    }
  }

  async function reviewProduct(productId: string, approve: boolean) {
    setBusyId(productId);
    setError("");
    const { error: resultError } = await createClient().rpc("admin_review_product", {
      target_product_id: productId,
      approve,
      review_note: approve ? null : "Please revise this listing and submit it again.",
    });
    setBusyId("");
    if (resultError) setError(resultError.message);
    else {
      setNotice(approve ? "Product approved and published." : "Product returned to the seller for updates.");
      await load();
    }
  }

  async function saveCommission() {
    const percent = Number(commissionInput);
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
      setError("Commission must be between 0% and 100%.");
      return;
    }
    setBusyId("commission");
    setError("");
    const { error: resultError } = await createClient().rpc("admin_update_commission", { rate_bps: Math.round(percent * 100) });
    setBusyId("");
    if (resultError) setError(resultError.message);
    else {
      setNotice("Default commission updated. This applies to new orders only.");
      await load();
    }
  }

  async function updateApplicationsOpen(open: boolean) {
    setBusyId("settings");
    setError("");
    const { error: resultError } = await createClient().rpc("admin_update_seller_applications", { applications_open: open });
    setBusyId("");
    if (resultError) setError(resultError.message);
    else {
      setApplicationsOpen(open);
      setNotice("Seller application setting saved.");
    }
  }

  const pendingSellers = sellers.filter((seller) => seller.status === "pending");
  const activeSellers = sellers.filter((seller) => seller.status === "approved");

  return <div className="space-y-5">
    {error && <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
    {notice && <p role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</p>}
    {loading ? <section className="rounded-2xl border border-[#e9dfdc] bg-white p-8 text-center text-sm text-[#756a6d]">Loading marketplace data…</section> : null}

    {section === "overview" && !loading && <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={<Store />} title="Approved sellers" value={activeSellers.length.toString()} />
        <Metric icon={<Clock />} title="Seller applications" value={pendingSellers.length.toString()} />
        <Metric icon={<PackageCheck />} title="Listings awaiting review" value={products.length.toString()} />
        <Metric icon={<CircleDollarSign />} title="Default commission" value={`${(commissionBps / 100).toFixed(2)}%`} />
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <section className="rounded-2xl border border-[#e9dfdc] bg-white p-5"><h2 className="text-lg font-bold">Seller applications</h2><p className="mt-1 text-sm text-[#756a6d]">New sellers remain unable to publish until approved.</p><SellerRows rows={pendingSellers} busyId={busyId} onReview={reviewSeller} /></section>
        <section className="rounded-2xl border border-[#e9dfdc] bg-white p-5"><h2 className="text-lg font-bold">Product review queue</h2><p className="mt-1 text-sm text-[#756a6d]">Listings only appear in the shop after approval.</p><ProductRows rows={products.slice(0, 4)} stores={storeNames} busyId={busyId} onReview={reviewProduct} /></section>
      </div>
      <section className="rounded-2xl border border-[#e9dfdc] bg-white p-5"><h2 className="text-lg font-bold">Paid orders</h2><p className="mt-2 text-sm text-[#756a6d]">{pendingOrders} paid orders are recorded. Order fulfillment and payment-provider processing still require the selected payment integration.</p></section>
    </>}

    {section === "sellers" && !loading && <section className="rounded-2xl border border-[#e9dfdc] bg-white p-5"><h2 className="text-lg font-bold">Seller applications and stores</h2><p className="mt-1 text-sm text-[#756a6d]">Approving an application enables the seller role and product submission.</p><SellerRows rows={sellers} busyId={busyId} onReview={reviewSeller} /></section>}

    {section === "approvals" && !loading && <section className="rounded-2xl border border-[#e9dfdc] bg-white p-5"><h2 className="text-lg font-bold">Product approvals</h2><p className="mt-1 text-sm text-[#756a6d]">Review seller listings before making them publicly visible.</p><ProductRows rows={products} stores={storeNames} busyId={busyId} onReview={reviewProduct} /></section>}

    {section === "commission" && !loading && <section className="max-w-xl rounded-2xl border border-[#e9dfdc] bg-white p-6"><p className="text-sm text-[#716669]">Current default rate</p><p className="mt-2 font-serif text-5xl font-semibold">{(commissionBps / 100).toFixed(2)}%</p><p className="mt-3 text-sm leading-6 text-[#7d7275]">The SQL order-item trigger snapshots commission at checkout; changes apply to future orders, not past sales.</p><label className="mt-6 block text-sm font-semibold">New default commission (%)<input value={commissionInput} onChange={(event) => setCommissionInput(event.target.value)} type="number" min="0" max="100" step="0.01" className="mt-2 h-12 w-full rounded-xl border border-[#ddd2cf] px-4" /></label><button onClick={saveCommission} disabled={busyId === "commission"} className="mt-4 w-full rounded-xl bg-[#292326] py-3 font-bold text-white disabled:opacity-50">{busyId === "commission" ? "Saving…" : "Save commission"}</button></section>}

    {section === "orders" && !loading && <section className="rounded-2xl border border-[#e9dfdc] bg-white p-5"><h2 className="text-lg font-bold">Marketplace orders</h2>{orders.length ? <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead className="bg-[#f8f3f1] text-xs text-[#72686b]"><tr>{["Order", "Customer", "Total", "Payment", "Fulfillment", "Date"].map((label) => <th key={label} className="px-3 py-3">{label}</th>)}</tr></thead><tbody>{orders.map((order) => <tr key={order.id} className="border-t border-[#eee5e2]"><td className="px-3 py-3 font-semibold">#{order.order_number}</td><td className="px-3">{order.email}</td><td className="px-3">BZ${(order.total_cents / 100).toFixed(2)}</td><td className="px-3">{order.payment_status}</td><td className="px-3">{order.fulfillment_status}</td><td className="px-3">{new Date(order.created_at).toLocaleDateString()}</td></tr>)}</tbody></table></div> : <p className="mt-4 text-sm text-[#756a6d]">No orders have been placed yet.</p>}</section>}

    {section === "payouts" && !loading && <section className="rounded-2xl border border-[#e9dfdc] bg-white p-5"><h2 className="text-lg font-bold">Seller payouts</h2><p className="mt-2 text-sm text-[#756a6d]">Payout records are read-only until a Belize-supported marketplace payout provider is configured.</p>{payouts.length ? <div className="mt-4 divide-y divide-[#eee5e1]">{payouts.map((payout) => <article key={payout.id} className="flex justify-between gap-4 py-4"><div><p className="font-semibold">{storeNames.get(payout.seller_store_id) ?? "Seller"}</p><p className="text-xs text-[#817679]">{payout.status} · {new Date(payout.created_at).toLocaleDateString()}</p></div><strong>BZ${(payout.net_payout_cents / 100).toFixed(2)}</strong></article>)}</div> : <p className="mt-4 text-sm text-[#756a6d]">No payout records yet.</p>}</section>}

    {section === "customers" && !loading && <section className="rounded-2xl border border-[#e9dfdc] bg-white p-5"><h2 className="text-lg font-bold">Customer accounts</h2><p className="mt-2 text-sm text-[#756a6d]">{customerCount} customer profiles are stored in BelGlow.</p></section>}

    {section === "settings" && !loading && <div className="grid gap-5 xl:grid-cols-2"><section className="max-w-xl rounded-2xl border border-[#e9dfdc] bg-white p-6"><h2 className="text-lg font-bold">Seller onboarding</h2><p className="mt-2 text-sm leading-6 text-[#756a6d]">Control whether customers may submit new seller applications.</p><label className="mt-5 flex items-center justify-between gap-4 text-sm font-semibold">Accept seller applications<input type="checkbox" checked={applicationsOpen} disabled={busyId === "settings"} onChange={(event) => void updateApplicationsOpen(event.target.checked)} className="h-5 w-5 accent-[#b85f5d]" /></label></section><AdminAccessManager /></div>}
  </div>;
}

function SellerRows({ rows, busyId, onReview }: { rows: SellerRow[]; busyId: string; onReview: (id: string, approve: boolean) => void }) {
  if (!rows.length) return <p className="mt-5 rounded-xl bg-[#faf6f4] p-5 text-sm text-[#756a6d]">No seller applications to review.</p>;
  return <div className="mt-4 divide-y divide-[#eee5e1]">{rows.map((seller) => <article key={seller.id} className="flex flex-wrap items-center gap-3 py-4"><div className="min-w-0 flex-1"><p className="font-semibold">{seller.name}</p><p className="mt-1 text-xs text-[#817679]">{seller.slug} · {seller.status} · {new Date(seller.created_at).toLocaleDateString()}</p>{seller.rejection_reason && <p className="mt-1 text-xs text-rose-700">{seller.rejection_reason}</p>}</div>{seller.status === "pending" && <div className="flex gap-2"><button disabled={Boolean(busyId)} onClick={() => onReview(seller.id, false)} className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-bold text-rose-700 disabled:opacity-50"><X size={14} className="mr-1 inline" />Reject</button><button disabled={Boolean(busyId)} onClick={() => onReview(seller.id, true)} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"><Check size={14} className="mr-1 inline" />Approve</button></div>}</article>)}</div>;
}

function ProductRows({ rows, stores, busyId, onReview }: { rows: ProductRow[]; stores: Map<string, string>; busyId: string; onReview: (id: string, approve: boolean) => void }) {
  if (!rows.length) return <p className="mt-5 rounded-xl bg-[#faf6f4] p-5 text-sm text-[#756a6d]">No products are awaiting review.</p>;
  return <div className="mt-4 divide-y divide-[#eee5e1]">{rows.map((product) => <article key={product.id} className="flex flex-wrap items-center gap-3 py-4"><div className="min-w-0 flex-1"><p className="font-semibold">{product.name}</p><p className="mt-1 text-xs text-[#817679]">{stores.get(product.seller_store_id) ?? "Seller store"} · BZ${(product.base_price_cents / 100).toFixed(2)} · {product.submitted_at ? new Date(product.submitted_at).toLocaleDateString() : "Submitted"}</p></div><div className="flex gap-2"><button disabled={Boolean(busyId)} onClick={() => onReview(product.id, false)} className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-bold text-rose-700 disabled:opacity-50">Request changes</button><button disabled={Boolean(busyId)} onClick={() => onReview(product.id, true)} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Approve</button></div></article>)}</div>;
}

function Metric({ icon, title, value }: { icon: React.ReactNode; title: string; value: string }) {
  return <article className="rounded-2xl border border-[#e9dfdc] bg-white p-5"><div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-[#f2dfdb] text-[#a75754]">{icon}</span><div><p className="text-xs text-[#756a6d]">{title}</p><p className="font-serif text-2xl font-bold">{value}</p></div></div></article>;
}
