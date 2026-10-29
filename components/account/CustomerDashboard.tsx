"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { ArrowRight, Heart, LogOut, MapPin, PackageCheck, Pencil, Plus, ShoppingBag, Trash2, UserRound, X } from "lucide-react";
import SiteHeader from "@/components/layout/SiteHeader";
import PaymentCenter from "@/components/orders/PaymentCenter";
import { useStore } from "@/components/providers/StoreProvider";
import DashboardSwitcher, { type DashboardRole } from "@/components/dashboard/DashboardSwitcher";
import { createClient } from "@/utils/supabase/client";

type PaymentAttention = "rejected" | "under_review" | "awaiting_payment" | "confirmed" | "mixed";
type CustomerOrder = { id: string; order_number: number; status: string; payment_status: string; fulfillment_status: string; total_cents: number; placed_at: string; payments?: { provider: string }[] | null; payment_attention?: PaymentAttention | null };
type CustomerAddress = { id: string; label: string; recipient_name: string; phone: string | null; address_line_1: string; address_line_2: string | null; city: string; district: string | null; postal_code: string | null; delivery_notes: string | null; is_default: boolean };
type OrderItem = { id: string; product_id: string | null; product_name: string; variant_name: string | null; quantity: number; unit_price_cents: number };
type Shipment = { id: string; carrier: string | null; tracking_number: string | null; tracking_url: string | null; status: string; shipped_at: string | null; delivered_at: string | null };

export default function CustomerDashboard({ name, email, phone, role, orders, addresses, initialOrderNumber }: { name: string; email: string; phone: string; role: DashboardRole; orders: CustomerOrder[]; addresses: CustomerAddress[]; initialOrderNumber?: number }) {
  const { favoriteIds, savedStoreIds, products, openWishlist, signOut } = useStore();
  const [profileName, setProfileName] = useState(name);
  const [profilePhone, setProfilePhone] = useState(phone);
  const [savedAddresses, setSavedAddresses] = useState(addresses);
  const [addressOpen, setAddressOpen] = useState(false);
  const [editingAddress, setEditingAddress] = useState<CustomerAddress | null>(null);
  const [expandedOrder, setExpandedOrder] = useState<string | null>(() => orders.find((order) => order.order_number === initialOrderNumber)?.id ?? null);
  const [paymentAttention, setPaymentAttention] = useState<Record<string, PaymentAttention | null>>(() => Object.fromEntries(orders.map((order) => [order.id, order.payment_attention ?? null])));
  const [orderItems, setOrderItems] = useState<Record<string, OrderItem[]>>({});
  const [shipments, setShipments] = useState<Record<string, Shipment[]>>({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const firstName = profileName.trim().split(/\s+/)[0] || "there";
  const selectedOrder = orders.find((order) => order.id === expandedOrder) ?? null;

  useEffect(() => {
    if (!expandedOrder || orderItems[expandedOrder]) return;
    let active = true;
    void (async () => {
      const supabase = createClient();
      const [itemResult, shipmentResult] = await Promise.all([
        supabase.from("order_items").select("id, product_id, product_name, variant_name, quantity, unit_price_cents").eq("order_id", expandedOrder),
        supabase.from("shipments").select("id, carrier, tracking_number, tracking_url, status, shipped_at, delivered_at").eq("order_id", expandedOrder).order("created_at", { ascending: false }),
      ]);
      if (!active) return;
      if (itemResult.error || shipmentResult.error) setError(itemResult.error?.message ?? shipmentResult.error?.message ?? "Unable to load order details.");
      else { setOrderItems((current) => ({ ...current, [expandedOrder]: (itemResult.data ?? []) as OrderItem[] })); setShipments((current) => ({ ...current, [expandedOrder]: (shipmentResult.data ?? []) as Shipment[] })); }
    })();
    return () => { active = false; };
  }, [expandedOrder, orderItems]);

  useEffect(() => {
    if (!selectedOrder) return;
    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`;
    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPaddingRight;
    };
  }, [selectedOrder]);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy("profile"); setError("");
    const { error: saveError } = await createClient().rpc("update_customer_profile", { profile_name: profileName, profile_phone: profilePhone, profile_marketing_opt_in: false });
    setBusy(""); if (saveError) setError(saveError.message); else setNotice("Account details saved.");
  }

  async function saveAddress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); setBusy("address"); setError("");
    const { data: id, error: saveError } = await createClient().rpc("save_customer_address", {
      target_address_id: editingAddress?.id ?? null, address_label: form.get("label"), address_recipient: form.get("recipient"), address_phone: form.get("phone"),
      address_line_1: form.get("line1"), address_line_2: form.get("line2"), address_city: form.get("city"), address_district: form.get("district"),
      address_postal_code: form.get("postal"), address_delivery_notes: form.get("notes"), make_default: form.get("default") === "on",
    });
    setBusy("");
    if (saveError) setError(saveError.message); else {
      const address: CustomerAddress = { id: String(id), label: String(form.get("label") || "Home"), recipient_name: String(form.get("recipient")), phone: String(form.get("phone") || "") || null, address_line_1: String(form.get("line1")), address_line_2: String(form.get("line2") || "") || null, city: String(form.get("city")), district: String(form.get("district") || "") || null, postal_code: String(form.get("postal") || "") || null, delivery_notes: String(form.get("notes") || "") || null, is_default: form.get("default") === "on" };
      setSavedAddresses((current) => [...current.filter((item) => item.id !== address.id).map((item) => address.is_default ? { ...item, is_default: false } : item), address].sort((a, b) => Number(b.is_default) - Number(a.is_default)));
      setEditingAddress(null); setAddressOpen(false); setNotice("Delivery address saved.");
    }
  }

  async function deleteAddress(addressId: string) {
    if (!window.confirm("Remove this delivery address?")) return;
    setBusy(addressId); const { error: deleteError } = await createClient().from("addresses").delete().eq("id", addressId); setBusy("");
    if (deleteError) setError(deleteError.message); else setSavedAddresses((current) => current.filter((address) => address.id !== addressId));
  }

  function toggleOrder(orderId: string) { setExpandedOrder((current) => current === orderId ? null : orderId); }

  async function reviewProduct(item: OrderItem) {
    if (!item.product_id) return;
    const rating = Number(window.prompt("Rate this product from 1 to 5:", "5")); if (!Number.isInteger(rating) || rating < 1 || rating > 5) return;
    const body = window.prompt("Share your experience with this product:") ?? ""; if (!body.trim()) return;
    setBusy(item.id); const supabase = createClient(); const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setBusy(""); setError("Sign in again to submit your review."); return; }
    const { error: reviewError } = await supabase.from("reviews").upsert({ product_id: item.product_id, user_id: user.id, order_item_id: item.id, rating, body: body.trim(), is_verified_purchase: true, is_approved: false }, { onConflict: "product_id,user_id" });
    setBusy(""); if (reviewError) setError(reviewError.message); else setNotice("Review submitted for approval. Thank you!");
  }

  async function requestOrderAction(orderId: string, requestType: "cancel" | "return" | "refund") {
    const reason = window.prompt(`Tell BelGlow why you want to request this ${requestType}:`); if (!reason?.trim()) return;
    setBusy(orderId); const supabase = createClient(); const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setBusy(""); setError("Sign in again to send this request."); return; }
    const { error: requestError } = await supabase.from("order_requests").insert({ order_id: orderId, user_id: user.id, request_type: requestType, reason: reason.trim() });
    setBusy(""); if (requestError) setError(requestError.message); else setNotice(`${requestType.charAt(0).toUpperCase() + requestType.slice(1)} request sent to BelGlow for review with the seller.`);
  }

  async function requestCancellation(orderId: string) {
    await requestOrderAction(orderId, "cancel");
  }

  return <main className="min-h-screen bg-[#fbf6f4]">
    <SiteHeader />
    <section className="border-b border-[#eadfdb] bg-[radial-gradient(circle_at_top_left,#ffe8ee,transparent_45%),linear-gradient(135deg,#fffaf8,#f5e7e2)] px-5 py-10 sm:px-8 lg:px-16 lg:py-14"><div className="mx-auto flex max-w-7xl flex-col gap-6 sm:flex-row sm:items-end sm:justify-between"><div><DashboardSwitcher role={role} className="mb-6" /><p className="text-xs font-bold uppercase tracking-[.22em] text-[#d8446e]">My BelGlow account</p><h1 className="mt-3 font-serif text-4xl font-semibold tracking-[-.03em] sm:text-5xl">Welcome, {firstName}</h1><p className="mt-3 text-sm text-[#75696b]">Track orders, revisit saved beauty finds, and manage your account.</p></div><button onClick={() => void signOut()} className="inline-flex w-fit items-center gap-2 rounded-full border border-[#d9c7c3] bg-white px-5 py-3 text-sm font-bold text-[#8f514f] shadow-sm"><LogOut size={17} /> Sign out</button></div></section>
    <div className="mx-auto grid max-w-7xl gap-6 px-5 py-8 sm:px-8 lg:grid-cols-[1fr_340px] lg:px-16 lg:py-10"><div className="space-y-6">{error && <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}{notice && <p role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</p>}
      <section className="grid gap-4 sm:grid-cols-3"><SummaryCard icon={<ShoppingBag size={20} />} label="Orders" value={String(orders.length)} detail="Placed with this account" /><SummaryCard icon={<Heart size={20} />} label="Saved items" value={String(favoriteIds.length)} detail="Ready to revisit" /><SummaryCard icon={<MapPin size={20} />} label="Addresses" value={String(savedAddresses.length)} detail="Saved delivery locations" /></section>
      <section className="rounded-[24px] border border-[#eadfdb] bg-white p-5 shadow-sm sm:p-7"><div className="flex items-center justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-[#b55f5c]">Purchase history</p><h2 className="mt-1 text-xl font-bold">Recent orders</h2></div><Link href="/shop" className="inline-flex items-center gap-1 text-sm font-bold text-[#b05a58]">Continue shopping <ArrowRight size={16} /></Link></div>
        {orders.length ? <div className="mt-5 divide-y divide-[#eee5e1]">{orders.map((order) => <article key={order.id} className="py-4"><button onClick={() => void toggleOrder(order.id)} className="group flex w-full flex-col gap-3 rounded-xl p-2 text-left transition hover:bg-[#fff8fa] sm:flex-row sm:items-center"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#fff1f3] text-[#d8446e]"><PackageCheck size={21} /></span><span className="min-w-0 flex-1"><span className="block font-bold">Order #{order.order_number}</span><span className="mt-1 block text-xs capitalize text-[#817679]">{new Date(order.placed_at).toLocaleDateString()} · {order.fulfillment_status.replaceAll("_", " ")}</span></span><span className="sm:text-right"><span className="block font-bold">BZ${(order.total_cents / 100).toFixed(2)}</span><CustomerPaymentStatus attention={paymentAttention[order.id]} paymentStatus={order.payment_status} orderStatus={order.status} /></span><span className="inline-flex items-center gap-1 text-xs font-bold text-[#b05a58] sm:ml-2">View details <ArrowRight size={14} className="transition group-hover:translate-x-0.5" /></span></button></article>)}</div> : <div className="mt-5 rounded-2xl bg-[#fbf6f4] p-7 text-center"><ShoppingBag className="mx-auto text-[#d98a86]" /><p className="mt-3 font-bold">No orders yet</p><p className="mt-1 text-sm text-[#756a6d]">Your BelGlow purchases will appear here.</p><Link href="/shop" className="mt-4 inline-flex rounded-full bg-[#ef4b74] px-5 py-2.5 text-sm font-bold text-white">Explore the shop</Link></div>}
      </section></div>
      <aside className="space-y-6"><section className="rounded-[24px] border border-[#eadfdb] bg-white p-6 shadow-sm"><span className="grid h-12 w-12 place-items-center rounded-full bg-[#282326] font-serif text-xl text-white">{profileName.charAt(0).toUpperCase()}</span><h2 className="mt-4 text-lg font-bold">{profileName}</h2><p className="mt-1 break-all text-sm text-[#756a6d]">{email}</p><div className="mt-5 border-t border-[#eee5e1] pt-5"><p className="flex items-center gap-2 text-sm font-semibold"><UserRound size={17} className="text-[#b55f5c]" /> Customer account</p></div><form onSubmit={saveProfile} className="mt-4 space-y-3"><label className="block text-xs font-bold">Full name<input value={profileName} onChange={(event) => setProfileName(event.target.value)} required className="mt-1 h-10 w-full rounded-lg border border-[#eadfdb] px-3 font-normal" /></label><label className="block text-xs font-bold">Phone<input value={profilePhone} onChange={(event) => setProfilePhone(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-[#eadfdb] px-3 font-normal" /></label><button disabled={busy === "profile"} className="w-full rounded-xl bg-[#282326] py-2.5 text-xs font-bold text-white disabled:opacity-50">Save account details</button></form></section>
        <section className="rounded-[24px] border border-[#eadfdb] bg-white p-6 shadow-sm"><h2 className="font-bold">Quick actions</h2><button onClick={openWishlist} className="mt-4 flex w-full items-center justify-between rounded-xl bg-[#fff5f6] px-4 py-3 text-left text-sm font-bold text-[#9b514f]"><span className="flex items-center gap-2"><Heart size={17} /> View saved items</span><ArrowRight size={16} /></button>{savedStoreIds.length > 0 && <div className="mt-3 rounded-xl border border-[#eadfdb] p-3"><p className="text-xs font-bold uppercase tracking-[.12em] text-[#817679]">Favorite businesses</p>{savedStoreIds.map((storeId) => { const product = products.find((item) => item.sellerStoreId === storeId); return product?.sellerSlug ? <Link key={storeId} href={`/store/${product.sellerSlug}`} className="mt-2 flex items-center justify-between text-sm font-bold text-[#9b514f]"><span>{product.sellerName}</span><ArrowRight size={15} /></Link> : null; })}</div>}<Link href="/seller-application" className="mt-3 flex items-center justify-between rounded-xl border border-[#eadfdb] px-4 py-3 text-sm font-bold text-[#5f5557]"><span>Apply to sell</span><ArrowRight size={16} /></Link></section>
        <section className="rounded-[24px] border border-[#eadfdb] bg-white p-6 shadow-sm"><div className="flex items-center justify-between gap-3"><h2 className="font-bold">Delivery addresses</h2><button onClick={() => { setEditingAddress(null); setAddressOpen(true); }} aria-label="Add address" className="rounded-full bg-[#fff1f3] p-2 text-[#b55f5c]"><Plus size={17} /></button></div>{savedAddresses.length ? <div className="mt-3 space-y-3">{savedAddresses.map((address) => <div key={address.id} className="rounded-xl bg-[#fbf6f4] p-4 text-sm"><div className="flex items-center gap-2 font-bold"><MapPin size={15} className="text-[#b55f5c]" /> {address.label}{address.is_default && <span className="rounded-full bg-white px-2 py-0.5 text-[10px] uppercase text-[#a35754]">Default</span>}<span className="ml-auto flex gap-1"><button onClick={() => { setEditingAddress(address); setAddressOpen(true); }} aria-label={`Edit ${address.label}`} className="p-1"><Pencil size={14} /></button><button disabled={busy === address.id} onClick={() => void deleteAddress(address.id)} aria-label={`Delete ${address.label}`} className="p-1 text-rose-700"><Trash2 size={14} /></button></span></div><p className="mt-2 leading-5 text-[#756a6d]">{address.recipient_name}<br />{address.address_line_1}{address.address_line_2 ? `, ${address.address_line_2}` : ""}<br />{address.city}{address.district ? `, ${address.district}` : ""}</p></div>)}</div> : <p className="mt-3 rounded-xl bg-[#fbf6f4] p-4 text-sm leading-6 text-[#756a6d]">No delivery address has been saved yet.</p>}</section>
      </aside></div>
    {selectedOrder && <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden overscroll-none bg-[#211a1d]/45 p-2 backdrop-blur-[2px] sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setExpandedOrder(null); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="order-dialog-title" className="relative flex h-[min(900px,calc(100dvh-1rem))] w-full max-w-4xl flex-col overflow-hidden rounded-[26px] bg-[#fffaf9] shadow-[0_30px_90px_rgba(55,31,39,.28)] sm:h-[min(900px,calc(100dvh-2rem))]">
        <header className="z-10 flex shrink-0 items-start justify-between gap-4 border-b border-[#eee1e5] bg-white px-5 py-4 sm:px-7">
          <div><p className="text-xs font-bold uppercase tracking-[.16em] text-[#d8446e]">Order details</p><h2 id="order-dialog-title" className="mt-1 text-2xl font-black">Order #{selectedOrder.order_number}</h2><p className="mt-1 text-xs capitalize text-[#817679]">{new Date(selectedOrder.placed_at).toLocaleDateString()} · {selectedOrder.fulfillment_status.replaceAll("_", " ")} · {selectedOrder.payment_status.replaceAll("_", " ")}</p></div>
          <button type="button" onClick={() => setExpandedOrder(null)} aria-label="Close order details" className="rounded-full bg-[#fff1f3] p-2 text-[#9b514f]"><X size={20} /></button>
        </header>
        <div className="min-h-0 flex-1 touch-pan-y space-y-4 overflow-y-auto overscroll-contain p-4 sm:p-6">
          <section className="rounded-2xl border border-[#eadfdb] bg-white p-5">
            <div className="flex items-center justify-between gap-4"><h3 className="font-bold">Order items</h3><strong className="text-lg">BZ${(selectedOrder.total_cents / 100).toFixed(2)}</strong></div>
            {orderItems[selectedOrder.id] ? <div className="mt-3 divide-y divide-[#eadfdb]">{orderItems[selectedOrder.id].map((item) => <div key={item.id} className="flex items-center justify-between gap-4 py-3 text-sm"><span>{item.product_name}{item.variant_name && item.variant_name !== "Default" ? ` · ${item.variant_name}` : ""} × {item.quantity}</span><span className="text-right"><strong>BZ${(item.unit_price_cents * item.quantity / 100).toFixed(2)}</strong>{selectedOrder.fulfillment_status === "delivered" && item.product_id && <button disabled={busy === item.id} onClick={() => void reviewProduct(item)} className="mt-1 block text-xs font-bold text-[#b05a58] underline">Write review</button>}</span></div>)}</div> : <p className="mt-3 text-sm text-[#817679]">Loading order items…</p>}
            {(shipments[selectedOrder.id] ?? []).map((shipment) => <div key={shipment.id} className="mt-3 rounded-xl bg-[#fbf6f4] p-3 text-xs"><p className="font-bold capitalize">Shipment: {shipment.status.replaceAll("_", " ")}</p><p className="mt-1 text-[#756a6d]">{shipment.carrier || "Delivery carrier"}{shipment.tracking_number ? ` · ${shipment.tracking_number}` : ""}</p>{shipment.tracking_url && <a href={shipment.tracking_url} target="_blank" rel="noreferrer" className="mt-2 inline-block font-bold text-[#b05a58] underline">Track shipment</a>}</div>)}
            {["pending", "confirmed"].includes(selectedOrder.status) && <button disabled={busy === selectedOrder.id} onClick={() => void requestCancellation(selectedOrder.id)} className="mt-4 text-xs font-bold text-rose-700 underline">Request cancellation</button>}
          </section>
          {selectedOrder.payments?.[0]?.provider === "bank_transfer" ? <section><div className="mb-3"><p className="text-xs font-bold uppercase tracking-[.16em] text-[#d8446e]">Payment</p><h3 className="mt-1 text-xl font-black">Bank transfer and receipt</h3><p className="mt-1 text-sm text-[#75696b]">Use the seller’s payment details and upload the matching receipt here.</p></div><PaymentCenter key={selectedOrder.id} initialOrderNumber={selectedOrder.order_number} initialEmail={email} onPaymentStatusChange={(status) => setPaymentAttention((current) => ({ ...current, [selectedOrder.id]: status }))} /></section> : <section className="rounded-2xl border border-[#eadfdb] bg-white p-5"><h3 className="font-bold">Payment method</h3><p className="mt-2 text-sm text-[#75696b]">{selectedOrder.payments?.[0]?.provider === "pay_on_delivery" ? "Payment is due when your order is delivered." : selectedOrder.payments?.[0]?.provider === "pay_on_pickup" ? "Payment is due when you collect your order." : "No bank-transfer receipt is required for this order."}</p></section>}
        </div>
      </section>
    </div>}
    {addressOpen && <div className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-black/35 p-4"><form onSubmit={saveAddress} className="relative w-full max-w-xl rounded-[24px] bg-white p-6 shadow-2xl"><button type="button" onClick={() => setAddressOpen(false)} aria-label="Close address form" className="absolute right-4 top-4 rounded-full bg-[#fff1f3] p-2"><X size={18} /></button><h2 className="text-xl font-bold">{editingAddress ? "Edit address" : "Add delivery address"}</h2><div className="mt-5 grid gap-3 sm:grid-cols-2"><AddressInput name="label" label="Label" defaultValue={editingAddress?.label ?? "Home"} required /><AddressInput name="recipient" label="Recipient name" defaultValue={editingAddress?.recipient_name ?? profileName} required /><AddressInput name="phone" label="Phone" defaultValue={editingAddress?.phone ?? profilePhone} /><AddressInput name="line1" label="Street address" defaultValue={editingAddress?.address_line_1 ?? ""} required wide /><AddressInput name="line2" label="Address line 2" defaultValue={editingAddress?.address_line_2 ?? ""} wide /><AddressInput name="city" label="City or town" defaultValue={editingAddress?.city ?? ""} required /><AddressInput name="district" label="District" defaultValue={editingAddress?.district ?? ""} /><AddressInput name="postal" label="Postal code" defaultValue={editingAddress?.postal_code ?? ""} /><AddressInput name="notes" label="Delivery notes" defaultValue={editingAddress?.delivery_notes ?? ""} wide /></div><label className="mt-4 flex items-center gap-2 text-sm font-semibold"><input name="default" type="checkbox" defaultChecked={editingAddress?.is_default ?? !savedAddresses.length} className="h-4 w-4 accent-[#d8446e]" /> Use as default address</label><button disabled={busy === "address"} className="mt-5 w-full rounded-full bg-[#ef4b74] py-3 font-bold text-white disabled:opacity-50">{busy === "address" ? "Saving…" : "Save address"}</button></form></div>}
  </main>;
}

function SummaryCard({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: string; detail: string }) { return <article className="rounded-[22px] border border-[#eadfdb] bg-white p-5 shadow-sm"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#fff0f3] text-[#d8446e]">{icon}</span><p className="mt-4 text-xs font-bold uppercase tracking-[.14em] text-[#817679]">{label}</p><p className="mt-1 text-3xl font-black">{value}</p><p className="mt-1 text-xs text-[#817679]">{detail}</p></article>; }
function CustomerPaymentStatus({ attention, paymentStatus, orderStatus }: { attention?: PaymentAttention | null; paymentStatus: string; orderStatus: string }) {
  if (attention === "rejected") return <span className="mt-1 inline-flex rounded-full bg-rose-100 px-3 py-1 text-xs font-black text-rose-700">Payment rejected — action required</span>;
  if (attention === "under_review") return <span className="mt-1 inline-flex rounded-full bg-sky-100 px-3 py-1 text-xs font-bold text-sky-700">Receipt under review</span>;
  if (attention === "awaiting_payment") return <span className="mt-1 inline-flex rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700">Awaiting payment</span>;
  if (attention === "confirmed") return <span className="mt-1 inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">Payment confirmed</span>;
  return <span className="mt-1 block text-xs capitalize text-[#817679]">{paymentStatus.replaceAll("_", " ")} · {orderStatus.replaceAll("_", " ")}</span>;
}
function AddressInput({ name, label, defaultValue, required = false, wide = false }: { name: string; label: string; defaultValue: string; required?: boolean; wide?: boolean }) { return <label className={`text-xs font-bold ${wide ? "sm:col-span-2" : ""}`}>{label}<input name={name} defaultValue={defaultValue} required={required} className="mt-1 h-11 w-full rounded-xl border border-[#eadfdb] px-3 font-normal" /></label>; }
