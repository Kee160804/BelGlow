"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { Check, CircleDollarSign, Clock, PackageCheck, Store, X } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import AdminAccessManager from "@/components/admin/AdminAccessManager";
import AdminCategoryManager from "@/components/admin/AdminCategoryManager";
import AdminShippingManager from "@/components/admin/AdminShippingManager";

type Section = "overview" | "sellers" | "approvals" | "commission" | "orders" | "payouts" | "customers" | "categories" | "settings";
type SellerRow = { id: string; name: string; slug: string; status: string; created_at: string; rejection_reason: string | null };
type ProductRow = { id: string; name: string; seller_store_id: string; base_price_cents: number; submitted_at: string | null; short_description: string | null; description: string | null; ingredients: string | null; usage_instructions: string | null };
type OrderRow = { id: string; order_number: number; email: string; total_cents: number; payment_status: string; fulfillment_status: string; created_at: string };
type PayoutRow = { id: string; seller_store_id: string; status: string; net_payout_cents: number; created_at: string };
type CustomerRow = { id: string; full_name: string | null; phone: string | null; role: string; created_at: string };
type OrderRequestRow = { id: string; order_id: string; request_type: string; reason: string; status: string; created_at: string };
type ReviewRow = { id: string; product_id: string; rating: number; title: string | null; body: string | null; created_at: string };
type RefundRow = { id: string; order_id: string; amount_cents: number; reason: string | null; status: string; created_at: string };

export default function AdminMarketplaceTools({ section }: { section: Section }) {
  const [sellers, setSellers] = useState<SellerRow[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [storeNames, setStoreNames] = useState<Map<string, string>>(new Map());
  const [productImages, setProductImages] = useState<Map<string, string>>(new Map());
  const [commissionBps, setCommissionBps] = useState(1500);
  const [commissionInput, setCommissionInput] = useState("15");
  const [pendingOrders, setPendingOrders] = useState(0);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [payouts, setPayouts] = useState<PayoutRow[]>([]);
  const [customerCount, setCustomerCount] = useState(0);
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [orderRequests, setOrderRequests] = useState<OrderRequestRow[]>([]);
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [refunds, setRefunds] = useState<RefundRow[]>([]);
  const [applicationsOpen, setApplicationsOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const supabase = createClient();
    setError("");
    const needsSellers = ["overview", "sellers", "approvals", "payouts"].includes(section);
    const needsProducts = ["overview", "approvals"].includes(section);
    const needsSettings = ["overview", "commission", "settings"].includes(section);
    const needsOrders = ["overview", "orders"].includes(section);
    const [sellerResult, productResult, settingsResult, orderResult, payoutResult, customerResult, requestResult, reviewResult, refundResult, imageResult] = await Promise.all([
      needsSellers ? supabase.from("seller_stores").select("id, name, slug, status, created_at, rejection_reason").order("created_at", { ascending: false }) : Promise.resolve({ data: [], error: null }),
      needsProducts ? supabase.from("products").select("id, name, seller_store_id, base_price_cents, submitted_at, short_description, description, ingredients, usage_instructions").eq("review_status", "submitted").not("seller_store_id", "is", null).order("submitted_at", { ascending: false }) : Promise.resolve({ data: [], error: null }),
      needsSettings ? supabase.from("marketplace_settings").select("default_commission_bps, seller_applications_open").eq("singleton", true).maybeSingle() : Promise.resolve({ data: null, error: null }),
      needsOrders ? supabase.from("orders").select("id, order_number, email, total_cents, payment_status, fulfillment_status, created_at").order("created_at", { ascending: false }).limit(100) : Promise.resolve({ data: [], error: null }),
      section === "payouts" ? supabase.from("seller_payouts").select("id, seller_store_id, status, net_payout_cents, created_at").order("created_at", { ascending: false }).limit(100) : Promise.resolve({ data: [], error: null }),
      section === "customers" ? supabase.from("profiles").select("id, full_name, phone, role, created_at", { count: "exact" }).order("created_at", { ascending: false }).limit(100) : Promise.resolve({ data: [], error: null, count: 0 }),
      section === "orders" ? supabase.from("order_requests").select("id, order_id, request_type, reason, status, created_at").eq("status", "pending").order("created_at", { ascending: false }) : Promise.resolve({ data: [], error: null }),
      section === "approvals" ? supabase.from("reviews").select("id, product_id, rating, title, body, created_at").eq("is_approved", false).order("created_at", { ascending: false }) : Promise.resolve({ data: [], error: null }),
      section === "orders" ? supabase.from("refunds").select("id, order_id, amount_cents, reason, status, created_at").eq("status", "pending").order("created_at", { ascending: false }) : Promise.resolve({ data: [], error: null }),
      needsProducts ? supabase.from("product_images").select("product_id, storage_path, sort_order").order("sort_order").limit(500) : Promise.resolve({ data: [], error: null }),
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
    setCustomers((customerResult.data ?? []) as CustomerRow[]);
    setOrderRequests((requestResult.data ?? []) as OrderRequestRow[]);
    setReviews((reviewResult.data ?? []) as ReviewRow[]);
    setRefunds((refundResult.data ?? []) as RefundRow[]);
    setStoreNames(new Map(sellerRows.map((seller) => [seller.id, seller.name])));
    const firstImages = new Map<string, string>();
    for (const row of imageResult.data ?? []) if (!firstImages.has(row.product_id)) firstImages.set(row.product_id, supabase.storage.from("product-images").getPublicUrl(row.storage_path).data.publicUrl);
    setProductImages(firstImages);
    if (settingsResult.data) {
      setCommissionBps(settingsResult.data.default_commission_bps);
      setCommissionInput((settingsResult.data.default_commission_bps / 100).toString());
      setApplicationsOpen(settingsResult.data.seller_applications_open);
    }
    setPendingOrders((orderResult.data ?? []).filter((order) => order.payment_status === "paid").length);
    setLoading(false);
  }, [section]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    if (section !== "approvals") return;
    const supabase = createClient();
    const channel = supabase.channel("admin-product-approval-feed")
      .on("postgres_changes", { event: "*", schema: "public", table: "products" }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load, section]);

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

  async function setSellerStatus(sellerId: string, status: "approved" | "suspended") {
    setBusyId(sellerId); setError("");
    const { error: actionError } = await createClient().rpc("admin_set_seller_status", { target_store_id: sellerId, next_status: status, admin_note: status === "suspended" ? "Suspended by a platform administrator." : null });
    setBusyId(""); if (actionError) setError(actionError.message); else { setNotice(`Seller ${status}.`); await load(); }
  }

  async function recordPayment(orderId: string) {
    if (!window.confirm("Confirm that manual/payment-on-delivery funds were received?")) return;
    setBusyId(orderId); setError(""); const { error: actionError } = await createClient().rpc("admin_record_manual_payment", { target_order_id: orderId }); setBusyId("");
    if (actionError) setError(actionError.message); else { setNotice("Payment recorded and seller ledger credited."); await load(); }
  }

  async function addShipment(orderId: string) {
    const tracking = window.prompt("Tracking number:"); if (!tracking?.trim()) return;
    const carrier = window.prompt("Carrier name:") ?? ""; const url = window.prompt("Tracking URL (optional):") ?? "";
    setBusyId(orderId); setError(""); const { error: actionError } = await createClient().rpc("admin_save_shipment", { target_order_id: orderId, shipment_carrier: carrier, shipment_tracking_number: tracking, shipment_tracking_url: url }); setBusyId("");
    if (actionError) setError(actionError.message); else { setNotice("Shipment and tracking saved."); await load(); }
  }

  async function resolveRequest(requestId: string, approve: boolean) {
    const note = window.prompt(approve ? "Optional approval note:" : "Reason for declining:") ?? "";
    setBusyId(requestId); setError(""); const { error: actionError } = await createClient().rpc("admin_resolve_order_request", { target_request_id: requestId, approve, resolution_note: note }); setBusyId("");
    if (actionError) setError(actionError.message); else { setNotice(approve ? "Order request approved." : "Order request declined."); await load(); }
  }

  async function moderateReview(reviewId: string, approve: boolean) {
    setBusyId(reviewId); setError("");
    const result = approve ? await createClient().from("reviews").update({ is_approved: true }).eq("id", reviewId) : await createClient().from("reviews").delete().eq("id", reviewId);
    setBusyId(""); if (result.error) setError(result.error.message); else { setNotice(approve ? "Review published." : "Review removed."); await load(); }
  }

  async function preparePayouts() {
    setBusyId("prepare-payouts"); setError("");
    const { data, error: actionError } = await createClient().rpc("admin_prepare_payouts");
    setBusyId(""); if (actionError) setError(actionError.message); else { setNotice(`${data ?? 0} payout batch${data === 1 ? "" : "es"} prepared.`); await load(); }
  }

  async function markPayoutPaid(payoutId: string) {
    const reference = window.prompt("Enter the completed bank or transfer reference:"); if (!reference?.trim()) return;
    setBusyId(payoutId); setError("");
    const { error: actionError } = await createClient().rpc("admin_mark_payout_paid", { target_payout_id: payoutId, transfer_reference: reference });
    setBusyId(""); if (actionError) setError(actionError.message); else { setNotice("Payout marked paid and seller ledger updated."); await load(); }
  }

  async function completeRefund(refundId: string) {
    const reference = window.prompt("Enter the completed refund reference from your payment provider or bank:"); if (!reference?.trim()) return;
    setBusyId(refundId); setError(""); const { error: actionError } = await createClient().rpc("admin_complete_refund", { target_refund_id: refundId, external_reference: reference }); setBusyId("");
    if (actionError) setError(actionError.message); else { setNotice("Refund completed and all financial records updated."); await load(); }
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
        <section className="rounded-2xl border border-[#e9dfdc] bg-white p-5"><h2 className="text-lg font-bold">Seller applications</h2><p className="mt-1 text-sm text-[#756a6d]">New sellers remain unable to publish until approved.</p><SellerRows rows={pendingSellers} busyId={busyId} onReview={reviewSeller} onStatus={setSellerStatus} /></section>
        <section className="rounded-2xl border border-[#e9dfdc] bg-white p-5"><h2 className="text-lg font-bold">Product review queue</h2><p className="mt-1 text-sm text-[#756a6d]">Listings only appear in the shop after approval.</p><ProductRows rows={products.slice(0, 4)} stores={storeNames} images={productImages} busyId={busyId} onReview={reviewProduct} /></section>
      </div>
      <section className="rounded-2xl border border-[#e9dfdc] bg-white p-5"><h2 className="text-lg font-bold">Paid orders</h2><p className="mt-2 text-sm text-[#756a6d]">{pendingOrders} paid orders are recorded. Order fulfillment and payment-provider processing still require the selected payment integration.</p></section>
    </>}

    {section === "sellers" && !loading && <section className="rounded-2xl border border-[#e9dfdc] bg-white p-5"><h2 className="text-lg font-bold">Seller applications and stores</h2><p className="mt-1 text-sm text-[#756a6d]">Approving an application enables the seller role and product submission.</p><SellerRows rows={sellers} busyId={busyId} onReview={reviewSeller} onStatus={setSellerStatus} /></section>}

    {section === "approvals" && !loading && <><section className="rounded-2xl border border-[#e9dfdc] bg-white p-5"><h2 className="text-lg font-bold">Product approvals</h2><p className="mt-1 text-sm text-[#756a6d]">Review seller listings before making them publicly visible.</p><ProductRows rows={products} stores={storeNames} images={productImages} busyId={busyId} onReview={reviewProduct} /></section><section className="rounded-2xl border border-[#e9dfdc] bg-white p-5"><h2 className="text-lg font-bold">Review moderation</h2><p className="mt-1 text-sm text-[#756a6d]">Publish genuine customer feedback or remove inappropriate content.</p><div className="mt-4 divide-y divide-[#eee5e1]">{reviews.map((review) => <article key={review.id} className="flex flex-wrap items-center gap-3 py-4"><div className="min-w-0 flex-1"><p className="font-semibold">{review.title || "Customer review"} · {"★".repeat(review.rating)}</p><p className="mt-1 text-xs leading-5 text-[#817679]">{review.body || "No written feedback."}</p></div><button disabled={Boolean(busyId)} onClick={() => void moderateReview(review.id, false)} className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-bold text-rose-700">Remove</button><button disabled={Boolean(busyId)} onClick={() => void moderateReview(review.id, true)} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white">Publish</button></article>)}{!reviews.length && <p className="py-4 text-sm text-[#756a6d]">No reviews are awaiting moderation.</p>}</div></section></>}

    {section === "commission" && !loading && <section className="max-w-xl rounded-2xl border border-[#e9dfdc] bg-white p-6"><p className="text-sm text-[#716669]">Current default rate</p><p className="mt-2 font-serif text-5xl font-semibold">{(commissionBps / 100).toFixed(2)}%</p><p className="mt-3 text-sm leading-6 text-[#7d7275]">The SQL order-item trigger snapshots commission at checkout; changes apply to future orders, not past sales.</p><label className="mt-6 block text-sm font-semibold">New default commission (%)<input value={commissionInput} onChange={(event) => setCommissionInput(event.target.value)} type="number" min="0" max="100" step="0.01" className="mt-2 h-12 w-full rounded-xl border border-[#ddd2cf] px-4" /></label><button onClick={saveCommission} disabled={busyId === "commission"} className="mt-4 w-full rounded-xl bg-[#292326] py-3 font-bold text-white disabled:opacity-50">{busyId === "commission" ? "Saving…" : "Save commission"}</button></section>}

    {section === "orders" && !loading && <><section className="rounded-2xl border border-[#e9dfdc] bg-white p-5"><h2 className="text-lg font-bold">Customer requests</h2>{orderRequests.length ? <div className="mt-4 divide-y divide-[#eee5e1]">{orderRequests.map((request) => <article key={request.id} className="flex flex-wrap items-center gap-3 py-4"><div className="min-w-0 flex-1"><p className="font-semibold capitalize">{request.request_type} request</p><p className="mt-1 text-xs text-[#817679]">{request.reason} · {new Date(request.created_at).toLocaleDateString()}</p></div><button disabled={Boolean(busyId)} onClick={() => void resolveRequest(request.id, false)} className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-bold text-rose-700">Decline</button><button disabled={Boolean(busyId)} onClick={() => void resolveRequest(request.id, true)} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white">Approve</button></article>)}</div> : <p className="mt-3 text-sm text-[#756a6d]">No customer order requests are waiting.</p>}<h3 className="mt-6 border-t border-[#eee5e1] pt-5 font-bold">Pending refunds</h3>{refunds.map((refund) => <article key={refund.id} className="mt-2 flex flex-wrap items-center gap-3 rounded-xl bg-[#faf6f4] p-4"><div className="min-w-0 flex-1"><p className="font-semibold">BZ${(refund.amount_cents / 100).toFixed(2)} refund</p><p className="text-xs text-[#817679]">{refund.reason || "No reason supplied"}</p></div><button disabled={Boolean(busyId)} onClick={() => void completeRefund(refund.id)} className="rounded-lg bg-[#292326] px-3 py-2 text-xs font-bold text-white">Record completed refund</button></article>)}{!refunds.length && <p className="mt-2 text-sm text-[#756a6d]">No approved refunds are waiting for payment.</p>}</section><section className="rounded-2xl border border-[#e9dfdc] bg-white p-5"><h2 className="text-lg font-bold">Marketplace orders</h2>{orders.length ? <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[780px] text-left text-sm"><thead className="bg-[#f8f3f1] text-xs text-[#72686b]"><tr>{["Order", "Customer", "Total", "Payment", "Fulfillment", "Date", "Actions"].map((label) => <th key={label} className="px-3 py-3">{label}</th>)}</tr></thead><tbody>{orders.map((order) => <tr key={order.id} className="border-t border-[#eee5e2]"><td className="px-3 py-3 font-semibold">#{order.order_number}</td><td className="px-3">{order.email}</td><td className="px-3">BZ${(order.total_cents / 100).toFixed(2)}</td><td className="px-3">{order.payment_status}</td><td className="px-3">{order.fulfillment_status}</td><td className="px-3">{new Date(order.created_at).toLocaleDateString()}</td><td className="px-3"><div className="flex gap-2">{order.payment_status === "pending" && <button disabled={Boolean(busyId)} onClick={() => void recordPayment(order.id)} className="text-xs font-bold text-emerald-700 underline">Mark paid</button>}{order.fulfillment_status !== "shipped" && order.fulfillment_status !== "delivered" && <button disabled={Boolean(busyId)} onClick={() => void addShipment(order.id)} className="text-xs font-bold text-[#a85855] underline">Add tracking</button>}</div></td></tr>)}</tbody></table></div> : <p className="mt-4 text-sm text-[#756a6d]">No orders have been placed yet.</p>}</section></>}

    {section === "payouts" && !loading && <section className="rounded-2xl border border-[#e9dfdc] bg-white p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold">Seller payouts</h2><p className="mt-1 text-sm text-[#756a6d]">Prepare eligible balances, then record the completed bank or provider transfer reference.</p></div><button disabled={Boolean(busyId)} onClick={() => void preparePayouts()} className="rounded-xl bg-[#292326] px-4 py-3 text-xs font-bold text-white disabled:opacity-50">Prepare eligible payouts</button></div>{payouts.length ? <div className="mt-4 divide-y divide-[#eee5e1]">{payouts.map((payout) => <article key={payout.id} className="flex flex-wrap items-center justify-between gap-4 py-4"><div className="min-w-0 flex-1"><p className="font-semibold">{storeNames.get(payout.seller_store_id) ?? "Seller"}</p><p className="text-xs text-[#817679]">{payout.status} · {new Date(payout.created_at).toLocaleDateString()}</p></div><strong>BZ${(payout.net_payout_cents / 100).toFixed(2)}</strong>{["ready", "processing"].includes(payout.status) && <button disabled={Boolean(busyId)} onClick={() => void markPayoutPaid(payout.id)} className="rounded-lg border border-emerald-200 px-3 py-2 text-xs font-bold text-emerald-700">Mark paid</button>}</article>)}</div> : <p className="mt-4 text-sm text-[#756a6d]">No payout records yet.</p>}</section>}

    {section === "customers" && !loading && <section className="rounded-2xl border border-[#e9dfdc] bg-white p-5"><h2 className="text-lg font-bold">Customer accounts</h2><p className="mt-2 text-sm text-[#756a6d]">{customerCount} customer profiles are stored in BelGlow.</p><div className="mt-4 divide-y divide-[#eee5e1]">{customers.map((customer) => <article key={customer.id} className="flex items-center gap-4 py-4"><span className="grid h-10 w-10 place-items-center rounded-full bg-[#f2dfdb] font-bold text-[#a75754]">{(customer.full_name || "C").charAt(0)}</span><div><p className="font-semibold">{customer.full_name || "BelGlow customer"}</p><p className="text-xs text-[#817679]">{customer.phone || "No phone saved"} · {customer.role} · Joined {new Date(customer.created_at).toLocaleDateString()}</p></div></article>)}</div></section>}

    {section === "categories" && !loading && <AdminCategoryManager />}

    {section === "settings" && !loading && <div className="grid gap-5 xl:grid-cols-2"><section className="rounded-2xl border border-[#e9dfdc] bg-white p-6"><h2 className="text-lg font-bold">Seller onboarding</h2><p className="mt-2 text-sm leading-6 text-[#756a6d]">Control whether customers may submit new seller applications.</p><label className="mt-5 flex items-center justify-between gap-4 text-sm font-semibold">Accept seller applications<input type="checkbox" checked={applicationsOpen} disabled={busyId === "settings"} onChange={(event) => void updateApplicationsOpen(event.target.checked)} className="h-5 w-5 accent-[#b85f5d]" /></label></section><AdminAccessManager /><AdminShippingManager /></div>}
  </div>;
}

function SellerRows({ rows, busyId, onReview, onStatus }: { rows: SellerRow[]; busyId: string; onReview: (id: string, approve: boolean) => void; onStatus: (id: string, status: "approved" | "suspended") => void }) {
  if (!rows.length) return <p className="mt-5 rounded-xl bg-[#faf6f4] p-5 text-sm text-[#756a6d]">No seller applications to review.</p>;
  return <div className="mt-4 divide-y divide-[#eee5e1]">{rows.map((seller) => <article key={seller.id} className="flex flex-wrap items-center gap-3 py-4"><div className="min-w-0 flex-1"><p className="font-semibold">{seller.name}</p><p className="mt-1 text-xs text-[#817679]">{seller.slug} · {seller.status} · {new Date(seller.created_at).toLocaleDateString()}</p>{seller.rejection_reason && <p className="mt-1 text-xs text-rose-700">{seller.rejection_reason}</p>}</div>{seller.status === "pending" ? <div className="flex gap-2"><button disabled={Boolean(busyId)} onClick={() => onReview(seller.id, false)} className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-bold text-rose-700 disabled:opacity-50"><X size={14} className="mr-1 inline" />Reject</button><button disabled={Boolean(busyId)} onClick={() => onReview(seller.id, true)} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"><Check size={14} className="mr-1 inline" />Approve</button></div> : <button disabled={Boolean(busyId)} onClick={() => onStatus(seller.id, seller.status === "approved" ? "suspended" : "approved")} className="rounded-lg border border-[#d9b9b4] px-3 py-2 text-xs font-bold text-[#9b514f] disabled:opacity-50">{seller.status === "approved" ? "Suspend" : "Reactivate"}</button>}</article>)}</div>;
}

function ProductRows({ rows, stores, images, busyId, onReview }: { rows: ProductRow[]; stores: Map<string, string>; images: Map<string, string>; busyId: string; onReview: (id: string, approve: boolean) => void }) {
  if (!rows.length) return <p className="mt-5 rounded-xl bg-[#faf6f4] p-5 text-sm text-[#756a6d]">No products are awaiting review.</p>;
  return <div className="mt-4 divide-y divide-[#eee5e1]">{rows.map((product) => <article key={product.id} className="flex flex-wrap items-center gap-3 py-4">{images.get(product.id) && <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-[#faf6f4]"><Image src={images.get(product.id)!} alt={product.name} fill sizes="80px" className="object-cover" unoptimized /></div>}<div className="min-w-0 flex-1"><p className="font-semibold">{product.name}</p><p className="mt-1 text-xs text-[#817679]">{stores.get(product.seller_store_id) ?? "Seller store"} · BZ${(product.base_price_cents / 100).toFixed(2)} · {product.submitted_at ? new Date(product.submitted_at).toLocaleDateString() : "Submitted"}</p><p className="mt-2 text-xs leading-5 text-[#62595c]">{product.description || product.short_description || "No product description supplied."}</p>{product.ingredients && <p className="mt-1 text-[11px] text-[#817679]"><strong>Ingredients:</strong> {product.ingredients}</p>}{product.usage_instructions && <p className="mt-1 text-[11px] text-[#817679]"><strong>How to use:</strong> {product.usage_instructions}</p>}</div><div className="flex gap-2"><button disabled={Boolean(busyId)} onClick={() => onReview(product.id, false)} className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-bold text-rose-700 disabled:opacity-50">Request changes</button><button disabled={Boolean(busyId)} onClick={() => onReview(product.id, true)} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Approve</button></div></article>)}</div>;
}

function Metric({ icon, title, value }: { icon: React.ReactNode; title: string; value: string }) {
  return <article className="rounded-2xl border border-[#e9dfdc] bg-white p-5"><div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-[#f2dfdb] text-[#a75754]">{icon}</span><div><p className="text-xs text-[#756a6d]">{title}</p><p className="font-serif text-2xl font-bold">{value}</p></div></div></article>;
}
