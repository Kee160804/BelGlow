"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Banknote, Check, CheckCircle2, Landmark, LoaderCircle, MapPin, Store, Truck } from "lucide-react";
import PaymentCenter, { type PaymentOrder } from "@/components/orders/PaymentCenter";
import { useStore } from "@/components/providers/StoreProvider";
import { createClient } from "@/utils/supabase/client";

type SavedAddress = { id: string; label: string; recipient_name: string; phone: string | null; address_line_1: string; address_line_2: string | null; city: string; district: string | null; postal_code: string | null; delivery_notes: string | null; is_default: boolean };
type SellerOption = { id: string; name: string; offers_delivery: boolean; offers_pickup: boolean; delivery_fee_cents: number | null; pickup_address: string | null };

export default function GuestCheckout() {
  const { cart, products, userName, completeCheckout } = useStore();
  const [step, setStep] = useState(1);
  const [fulfillmentMethod, setFulfillmentMethod] = useState<"delivery" | "pickup">("delivery");
  const [paymentMethod, setPaymentMethod] = useState<"bank_transfer" | "pay_on_delivery" | "pay_on_pickup">("bank_transfer");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmation, setConfirmation] = useState<{ orderNumber: number; totalCents: number; email: string; paymentDetails: PaymentOrder | null } | null>(null);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
  const [sellerOptions, setSellerOptions] = useState<SellerOption[]>([]);
  const formRef = useRef<HTMLFormElement>(null);
  const prefilled = useRef(false);

  const lines = useMemo(() => {
    const grouped = new Map<string, { variantId: string; quantity: number; product: (typeof products)[number]; optionName?: string; price: number }>();
    for (const item of cart) {
      const product = products.find((candidate) => candidate.id === item.productId);
      const variantId = item.variantId ?? product?.variantId;
      if (!product || !variantId) continue;
      const current = grouped.get(variantId);
      if (current) current.quantity += 1;
      else grouped.set(variantId, { variantId, quantity: 1, product, optionName: item.optionName, price: item.price ?? product.price });
    }
    return [...grouped.values()];
  }, [cart, products]);

  const subtotal = lines.reduce((sum, line) => sum + Math.round(line.price * 100) * line.quantity, 0);
  const sellerIds = useMemo(() => [...new Set(lines.map((line) => line.product.sellerStoreId).filter((id): id is string => Boolean(id)))], [lines]);
  const deliveryFee = fulfillmentMethod === "delivery" ? sellerOptions.reduce((sum, seller) => sum + (seller.delivery_fee_cents ?? 0), 0) : 0;
  const total = subtotal + deliveryFee;

  const fillCheckout = useCallback((values: Record<string, string>) => {
    const form = formRef.current;
    if (!form) return;
    for (const [name, value] of Object.entries(values)) {
      const field = form.elements.namedItem(name);
      if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) field.value = value;
    }
  }, []);

  const applyAddress = useCallback((address: SavedAddress) => {
    fillCheckout({ recipientName: address.recipient_name, phone: address.phone ?? "", addressLine1: address.address_line_1, addressLine2: address.address_line_2 ?? "", city: address.city, district: address.district ?? "", postalCode: address.postal_code ?? "", deliveryNotes: address.delivery_notes ?? "" });
  }, [fillCheckout]);

  useEffect(() => {
    if (!lines.length || prefilled.current) return;
    prefilled.current = true;
    let active = true;
    void (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !active) return;
      const [profileResult, addressResult] = await Promise.all([
        supabase.from("profiles").select("full_name, phone").eq("id", user.id).maybeSingle(),
        supabase.from("addresses").select("id, label, recipient_name, phone, address_line_1, address_line_2, city, district, postal_code, delivery_notes, is_default").eq("user_id", user.id).order("is_default", { ascending: false }).order("created_at"),
      ]);
      if (!active) return;
      const addresses = (addressResult.data ?? []) as SavedAddress[];
      setSavedAddresses(addresses);
      fillCheckout({ email: user.email ?? "", phone: profileResult.data?.phone ?? "", recipientName: profileResult.data?.full_name ?? "" });
      if (addresses[0]) applyAddress(addresses[0]);
    })();
    return () => { active = false; };
  }, [applyAddress, fillCheckout, lines.length]);

  useEffect(() => {
    if (!sellerIds.length) return;
    let active = true;
    void createClient().from("seller_stores").select("id, name, offers_delivery, offers_pickup, delivery_fee_cents, pickup_address").in("id", sellerIds).then(({ data }) => {
      if (active) setSellerOptions((data ?? []) as SellerOption[]);
    });
    return () => { active = false; };
  }, [sellerIds]);

  function continueCheckout() {
    if (step === 1) {
      if (fulfillmentMethod === "delivery" && sellerOptions.some((seller) => !seller.offers_delivery)) { setError("A seller in this order does not offer delivery."); return; }
      if (fulfillmentMethod === "pickup" && sellerOptions.some((seller) => !seller.offers_pickup || !seller.pickup_address)) { setError("A seller in this order has not configured pickup."); return; }
      if (!formRef.current?.reportValidity()) return;
    }
    setError("");
    setStep((current) => Math.min(3, current + 1));
  }

  async function placeOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step < 3) { continueCheckout(); return; }
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          idempotencyKey, email: form.get("email"), phone: form.get("phone"), recipientName: form.get("recipientName"),
          addressLine1: form.get("addressLine1"), addressLine2: form.get("addressLine2"), city: form.get("city"), district: form.get("district"),
          postalCode: form.get("postalCode"), deliveryNotes: form.get("deliveryNotes"), customerNote: form.get("customerNote"),
          fulfillmentMethod, paymentMethod, promotionCode: form.get("promotionCode"), items: lines.map((line) => ({ variantId: line.variantId, quantity: line.quantity })),
        }),
      });
      const result = await response.json() as { error?: string; orderNumber?: number; totalCents?: number; paymentDetails?: PaymentOrder };
      if (!response.ok || !result.orderNumber) throw new Error(result.error || "Unable to place the order.");
      setConfirmation({ orderNumber: result.orderNumber, totalCents: result.totalCents ?? total, email: String(form.get("email") ?? ""), paymentDetails: result.paymentDetails ?? null });
      completeCheckout();
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : "Unable to place the order.");
    } finally {
      setBusy(false);
    }
  }

  if (confirmation) return <section className="mt-5"><div className="rounded-[22px] border border-emerald-200 bg-emerald-50 p-6 text-center text-emerald-950"><CheckCircle2 className="mx-auto" size={38} /><h2 className="mt-3 text-2xl font-black">Order #{confirmation.orderNumber} was placed</h2><p className="mt-2 text-sm">{"BZ$" + (confirmation.totalCents / 100).toFixed(2)} · {paymentMethod === "bank_transfer" ? "Upload your receipt for seller verification." : paymentMethod === "pay_on_delivery" ? "Payment is due when your order is delivered." : "Payment is due when you collect your order."}</p></div>{confirmation.paymentDetails && <div className="mt-4"><PaymentCenter initialOrder={confirmation.paymentDetails} initialEmail={confirmation.email} /></div>}<div className="mt-4 flex justify-center gap-3"><Link href="/shop" className="rounded-full bg-[#ef4b74] px-5 py-2.5 text-sm font-bold text-white">Continue shopping</Link>{userName && <Link href="/account" className="rounded-full border border-emerald-300 bg-white px-5 py-2.5 text-sm font-bold">My orders</Link>}</div></section>;
  if (!lines.length) return <section className="mt-6 rounded-2xl bg-[#fff5f7] p-6 text-center text-sm text-[#75696e]">Your bag is empty.<Link href="/shop" className="ml-2 font-bold text-[#df3765] underline">Browse products</Link></section>;

  return <form ref={formRef} onSubmit={placeOrder} className="mt-3 flex min-h-[500px] flex-col rounded-[22px] border border-[#f0dce2] bg-white p-4 shadow-[0_18px_55px_rgba(107,44,62,.10)] sm:p-5">
    <CheckoutSteps step={step} />
    <div className="mt-5 flex-1">
      <section className={step === 1 ? "block" : "hidden"} aria-hidden={step !== 1}>
        <div className="flex items-center justify-between"><div><h2 className="text-lg font-black">Contact information</h2><p className="text-xs text-[#817679]">Where the seller can reach you.</p></div>{savedAddresses.length > 0 && <select aria-label="Use a saved address" defaultValue={savedAddresses[0]?.id} onChange={(event) => { const address = savedAddresses.find((item) => item.id === event.target.value); if (address) applyAddress(address); }} className="h-9 max-w-44 rounded-lg border border-[#e7dade] bg-white px-2 text-xs"><option value="">New address</option>{savedAddresses.map((address) => <option key={address.id} value={address.id}>{address.label}</option>)}</select>}</div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3"><Field name="recipientName" label="Full name" autoComplete="name" placeholder="Your name" required /><Field name="email" label="Email address" type="email" autoComplete="email" placeholder="you@example.com" required /><Field name="phone" label="Phone number" type="tel" autoComplete="tel" placeholder="+501" /></div>
        <h3 className="mt-4 text-sm font-black">Receive your order</h3>
        <div className="mt-2 grid grid-cols-2 gap-3"><ChoiceCard selected={fulfillmentMethod === "delivery"} icon={<Truck size={22} />} title="Delivery" detail="Delivered to your address" onSelect={() => { setFulfillmentMethod("delivery"); if (paymentMethod === "pay_on_pickup") setPaymentMethod("bank_transfer"); }} /><ChoiceCard selected={fulfillmentMethod === "pickup"} icon={<Store size={22} />} title="Store pickup" detail="Collect from each seller" onSelect={() => { setFulfillmentMethod("pickup"); if (paymentMethod === "pay_on_delivery") setPaymentMethod("bank_transfer"); }} /></div>
        <div className="mt-3 rounded-xl bg-[#fbf7f8] p-3">{fulfillmentMethod === "delivery" ? <><div className="flex items-center justify-between"><h3 className="text-sm font-black">Delivery address</h3>{deliveryFee > 0 && <span className="text-xs font-bold text-[#df3765]">Delivery fee: {"BZ$" + (deliveryFee / 100).toFixed(2)}</span>}</div><div className="mt-2 grid gap-3 sm:grid-cols-[2fr_1fr_1fr]"><Field name="addressLine1" label="Street address" autoComplete="address-line1" placeholder="23 Albert Street" required /><Field name="city" label="City or town" autoComplete="address-level2" placeholder="Belize City" required /><Field name="district" label="District" autoComplete="address-level1" placeholder="Belize" /></div><details className="mt-2 text-xs"><summary className="cursor-pointer font-bold text-[#75696e]">Optional address details</summary><div className="mt-2 grid gap-3 sm:grid-cols-3"><Field name="addressLine2" label="Apartment / landmark" autoComplete="address-line2" placeholder="Optional" /><Field name="postalCode" label="Postal code" autoComplete="postal-code" placeholder="Optional" /><Field name="deliveryNotes" label="Delivery note" placeholder="Gate or landmark" /></div></details></> : <div><h3 className="text-sm font-black">Seller pickup {sellerOptions.length === 1 ? "address" : "addresses"}</h3><div className="mt-2 grid gap-2 sm:grid-cols-2">{sellerOptions.map((seller) => <div key={seller.id} className="rounded-lg border border-[#eadfe2] bg-white p-3"><p className="text-xs font-black">{seller.name}</p><p className="mt-1 flex gap-1 text-[11px] text-[#75696e]"><MapPin size={13} className="shrink-0" />{seller.pickup_address || "Pickup is not configured"}</p></div>)}</div></div>}</div>
      </section>

      <section className={step === 2 ? "block" : "hidden"} aria-hidden={step !== 2}>
        <h2 className="text-lg font-black">Payment method</h2><p className="mt-1 text-xs text-[#817679]">Select how you will pay each seller.</p>
        <div className="mt-3 space-y-2"><PaymentChoice selected={paymentMethod === "bank_transfer"} icon={<Landmark size={19} />} title="Bank transfer (Pay online)" detail="Transfer to each seller's bank account and upload the receipt." onSelect={() => setPaymentMethod("bank_transfer")} /><PaymentChoice selected={paymentMethod === "pay_on_delivery"} disabled={fulfillmentMethod !== "delivery"} icon={<Truck size={19} />} title="Pay on delivery" detail="Pay when the seller delivers your order." onSelect={() => setPaymentMethod("pay_on_delivery")} /><PaymentChoice selected={paymentMethod === "pay_on_pickup"} disabled={fulfillmentMethod !== "pickup"} icon={<Banknote size={19} />} title="Pay on pickup" detail="Pay when you collect your order." onSelect={() => setPaymentMethod("pay_on_pickup")} /></div>
        {deliveryFee > 0 && <div className="mt-3 flex items-center justify-between rounded-xl bg-[#fff0f4] p-3 text-sm"><span><strong>Delivery fee</strong><span className="ml-2 text-xs text-[#817679]">Set by {sellerOptions.length === 1 ? "the seller" : "the sellers"}</span></span><strong>{"BZ$" + (deliveryFee / 100).toFixed(2)}</strong></div>}
        <div className="mt-3 rounded-xl border border-[#eadfe2] p-3 text-sm"><p className="flex justify-between"><span>Items</span><strong>{"BZ$" + (subtotal / 100).toFixed(2)}</strong></p>{deliveryFee > 0 && <p className="mt-2 flex justify-between"><span>Delivery</span><strong>{"BZ$" + (deliveryFee / 100).toFixed(2)}</strong></p>}<p className="mt-2 flex justify-between border-t border-[#eee1e5] pt-2 text-base"><strong>Total</strong><strong>{"BZ$" + (total / 100).toFixed(2)}</strong></p></div>
      </section>

      <section className={step === 3 ? "block" : "hidden"} aria-hidden={step !== 3}>
        <div className="flex items-end justify-between"><div><h2 className="text-lg font-black">Review your order</h2><p className="text-xs text-[#817679]">{cart.length} {cart.length === 1 ? "item" : "items"} · {fulfillmentMethod === "delivery" ? "Delivery" : "Store pickup"}</p></div><strong className="text-xl">{"BZ$" + (total / 100).toFixed(2)}</strong></div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">{lines.slice(0, 4).map((line) => <div key={line.variantId} className="flex items-center justify-between rounded-xl bg-[#fbf6f8] px-3 py-2.5 text-sm"><span className="min-w-0 truncate"><strong>{line.product.name}</strong><span className="ml-1 text-xs text-[#817679]">× {line.quantity}</span></span><strong className="ml-3 shrink-0">{"BZ$" + (line.price * line.quantity).toFixed(2)}</strong></div>)}</div>{lines.length > 4 && <p className="mt-2 text-xs text-[#817679]">And {lines.length - 4} additional product lines.</p>}
        <div className="mt-4 grid gap-3 sm:grid-cols-2"><Field name="promotionCode" label="Promotion code" placeholder="Optional" /><label className="text-xs font-bold">Order note<textarea name="customerNote" rows={2} placeholder="Optional instructions" className="mt-1.5 w-full rounded-lg border border-[#e7dade] px-3 py-2 text-sm font-normal outline-none focus:border-[#ef4b74]" /></label></div>
        <div className="mt-4 rounded-xl bg-[#fff5f7] p-4 text-xs leading-5 text-[#75696e]"><strong className="text-[#292527]">You will not enter banking credentials on BelGlow.</strong> Seller bank instructions appear only after this order is placed.</div>
      </section>
    </div>

    {error && <p role="alert" className="mt-3 rounded-xl bg-rose-50 px-4 py-2.5 text-sm text-rose-700">{error}</p>}
    <div className="mt-4 flex gap-3 border-t border-[#f0e2e6] pt-4">{step > 1 && <button type="button" onClick={() => { setError(""); setStep((current) => current - 1); }} className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-[#e3d4d9] py-3 text-sm font-bold"><ArrowLeft size={17} />Back</button>}<button type={step === 3 ? "submit" : "button"} onClick={step === 3 ? undefined : continueCheckout} disabled={busy} className="flex flex-[2] items-center justify-center gap-2 rounded-xl bg-[#ef4b74] py-3 text-sm font-bold text-white disabled:opacity-50">{busy ? <LoaderCircle size={18} className="animate-spin" /> : step === 3 ? <Check size={18} /> : <ArrowRight size={18} />}{busy ? "Placing order…" : step === 3 ? "Place order" : step === 1 ? "Continue to payment" : "Review order"}</button></div>
  </form>;
}

function CheckoutSteps({ step }: { step: number }) {
  return <ol className="grid grid-cols-3" aria-label="Checkout progress">{["Information", "Payment", "Review"].map((label, index) => {
    const number = index + 1; const active = number === step; const done = number < step;
    return <li key={label} className="relative text-center"><span className={"relative z-10 mx-auto grid h-7 w-7 place-items-center rounded-full border text-xs font-black " + (active || done ? "border-[#ef4b74] bg-[#ef4b74] text-white" : "border-[#d9d0d4] bg-white text-[#817679]")}>{done ? <Check size={14} /> : number}</span><span className={"mt-1 block text-[10px] font-bold " + (active ? "text-[#292527]" : "text-[#817679]")}>{label}</span>{index < 2 && <span className={"absolute left-[55%] top-3 h-px w-[90%] " + (done ? "bg-[#ef4b74]" : "bg-[#e5dce0]")} />}</li>;
  })}</ol>;
}

function Field({ name, label, type = "text", autoComplete, placeholder, required = false }: { name: string; label: string; type?: string; autoComplete?: string; placeholder: string; required?: boolean }) {
  return <label className="text-xs font-bold">{label}{required && <span className="text-[#ef4b74]"> *</span>}<input name={name} type={type} autoComplete={autoComplete} placeholder={placeholder} required={required} className="mt-1.5 h-10 w-full rounded-lg border border-[#e7dade] px-3 text-sm font-normal outline-none focus:border-[#ef4b74]" /></label>;
}

function ChoiceCard({ selected, icon, title, detail, onSelect }: { selected: boolean; icon: React.ReactNode; title: string; detail: string; onSelect: () => void }) {
  return <button type="button" onClick={onSelect} className={"rounded-xl border p-3 text-center transition " + (selected ? "border-[#ef4b74] bg-[#fff2f6] text-[#df3765]" : "border-[#eadfe2] text-[#292527]")}>{icon}<span className="mt-1 block text-xs font-black">{title}</span><span className="mt-0.5 block text-[10px] text-[#817679]">{detail}</span></button>;
}

function PaymentChoice({ selected, disabled = false, icon, title, detail, onSelect }: { selected: boolean; disabled?: boolean; icon: React.ReactNode; title: string; detail: string; onSelect: () => void }) {
  return <button type="button" disabled={disabled} onClick={onSelect} className={"flex w-full items-center gap-3 rounded-xl border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-40 " + (selected ? "border-[#ef4b74] bg-[#fff2f6]" : "border-[#eadfe2]")}><span className={"grid h-8 w-8 shrink-0 place-items-center rounded-full " + (selected ? "bg-[#ef4b74] text-white" : "bg-[#f7f1f3] text-[#75696e]")}>{icon}</span><span className="min-w-0 flex-1"><strong className="block text-sm">{title}</strong><span className="block text-[11px] text-[#817679]">{detail}</span></span><span className={"h-4 w-4 rounded-full border-2 " + (selected ? "border-[5px] border-[#ef4b74]" : "border-[#b9afb3]")} /></button>;
}

