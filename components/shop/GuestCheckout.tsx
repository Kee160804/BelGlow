"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, LoaderCircle } from "lucide-react";
import { useStore } from "@/components/providers/StoreProvider";
import { createClient } from "@/utils/supabase/client";

type ShippingMethod = { code: string; name: string; description: string | null; price_cents: number };
type SavedAddress = { id: string; label: string; recipient_name: string; phone: string | null; address_line_1: string; address_line_2: string | null; city: string; district: string | null; postal_code: string | null; delivery_notes: string | null; is_default: boolean };

export default function GuestCheckout({ shippingMethods }: { shippingMethods: ShippingMethod[] }) {
  const { cart, products, userName, openAuth, completeCheckout } = useStore();
  const [shippingCode, setShippingCode] = useState(shippingMethods[0]?.code ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmation, setConfirmation] = useState<{ orderNumber: number; totalCents: number; paymentMethod: string } | null>(null);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
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
  const shipping = shippingMethods.find((method) => method.code === shippingCode)?.price_cents ?? 0;

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

  async function placeOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!shippingCode) {
      setError("Choose a delivery option before placing your order.");
      return;
    }
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          idempotencyKey,
          email: form.get("email"), phone: form.get("phone"), recipientName: form.get("recipientName"),
          addressLine1: form.get("addressLine1"), addressLine2: form.get("addressLine2"), city: form.get("city"),
          district: form.get("district"), postalCode: form.get("postalCode"), deliveryNotes: form.get("deliveryNotes"),
          customerNote: form.get("customerNote"), shippingCode,
          promotionCode: form.get("promotionCode"),
          items: lines.map((line) => ({ variantId: line.variantId, quantity: line.quantity })),
        }),
      });
      const result = await response.json() as { error?: string; orderNumber?: number; totalCents?: number; paymentMethod?: string };
      if (!response.ok || !result.orderNumber) throw new Error(result.error || "Unable to place the order.");
      setConfirmation({ orderNumber: result.orderNumber, totalCents: result.totalCents ?? subtotal + shipping, paymentMethod: result.paymentMethod ?? "Payment pending" });
      completeCheckout();
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : "Unable to place the order. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (confirmation) return <section className="mt-7 rounded-[24px] border border-emerald-200 bg-emerald-50 p-7 text-center text-emerald-950">
    <CheckCircle2 className="mx-auto" size={42} /><h2 className="mt-4 text-2xl font-black">Order #{confirmation.orderNumber} is confirmed</h2>
    <p className="mt-2 text-sm leading-6">Product total: BZ${(confirmation.totalCents / 100).toFixed(2)} · {confirmation.paymentMethod}. Each seller is responsible for contacting you to arrange delivery or pickup and confirm any separate delivery charge.</p>
    <div className="mt-5 flex flex-wrap justify-center gap-3"><Link href="/shop" className="rounded-full bg-[#ef4b74] px-5 py-3 text-sm font-bold text-white">Continue shopping</Link>{userName && <Link href="/account" className="rounded-full border border-emerald-300 bg-white px-5 py-3 text-sm font-bold">View my orders</Link>}</div>
  </section>;

  return <>
    <p className="mt-3 text-sm leading-6 text-[#75696e]">You can shop and check out as a guest—no shopper account is required. Your seller or admin account is only needed for marketplace tools.</p>
    {!userName && <section className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-950" role="status"><h2 className="font-bold">Your guest checkout is temporary</h2><p className="mt-2">Your cart exists only in this open page session. Refreshing or reloading, closing the tab, or losing the session before the order is confirmed will clear your selections and abandon the unfinished checkout.</p><p className="mt-2">Create a free customer account if you want BelGlow to keep your favorites, cart, delivery details, and order history for later.</p><button type="button" onClick={openAuth} className="mt-4 rounded-full bg-[#2b2427] px-5 py-2.5 text-sm font-bold text-white">Create an account or sign in</button></section>}
    {!lines.length ? <section className="mt-7 rounded-2xl bg-[#fff5f7] p-5 text-sm text-[#75696e]">Your bag is empty.<Link href="/shop" className="ml-2 font-bold text-[#df3765] underline">Browse products</Link></section> : <form ref={formRef} onSubmit={placeOrder}>
      <section className="mt-7 rounded-2xl border border-[#f0e2e6] p-5"><h2 className="font-bold">Your bag ({cart.length} {cart.length === 1 ? "item" : "items"})</h2><div className="mt-3 divide-y divide-[#f0e2e6]">{lines.map((line) => <div key={line.variantId} className="flex justify-between gap-4 py-3"><div><p className="font-semibold">{line.product.name}</p><p className="text-xs text-[#817679]">{line.optionName && line.optionName !== "Default" ? `${line.optionName} · ` : ""}{line.product.category} · Qty {line.quantity}</p></div><strong className="shrink-0">BZ${(line.price * line.quantity).toFixed(2)}</strong></div>)}</div><p className="mt-3 flex justify-between border-t border-[#f0e2e6] pt-4 font-bold"><span>Subtotal</span><span>BZ${(subtotal / 100).toFixed(2)}</span></p></section>
      <section className="mt-5 rounded-2xl border border-[#f0e2e6] p-5"><h2 className="font-bold">Contact and delivery details</h2>{savedAddresses.length > 0 && <label className="mt-4 block text-sm font-semibold">Use a saved address<select defaultValue={savedAddresses[0]?.id} onChange={(event) => { const address = savedAddresses.find((item) => item.id === event.target.value); if (address) applyAddress(address); }} className="mt-2 h-12 w-full rounded-xl border border-[#e7dade] bg-white px-4 font-normal"><option value="">Enter another address</option>{savedAddresses.map((address) => <option key={address.id} value={address.id}>{address.label} — {address.address_line_1}, {address.city}</option>)}</select></label>}<div className="mt-4 grid gap-4 sm:grid-cols-2"><CheckoutField name="email" label="Email" type="email" autoComplete="email" placeholder="you@example.com" required /><CheckoutField name="phone" label="Phone" type="tel" autoComplete="tel" placeholder="+501" /><CheckoutField name="recipientName" label="Recipient name" autoComplete="name" placeholder="Name for delivery" required wide /><CheckoutField name="addressLine1" label="Street address" autoComplete="address-line1" placeholder="Street address" required wide /><CheckoutField name="addressLine2" label="Address line 2" autoComplete="address-line2" placeholder="Apartment or landmark (optional)" wide /><CheckoutField name="city" label="City or town" autoComplete="address-level2" placeholder="Belize City" required /><CheckoutField name="district" label="District" autoComplete="address-level1" placeholder="Belize District" /><CheckoutField name="postalCode" label="Postal code" autoComplete="postal-code" placeholder="Optional" /><CheckoutField name="deliveryNotes" label="Delivery notes" placeholder="Gate, landmark, or delivery instructions" wide /></div></section>
      <section className="mt-5 rounded-2xl border border-[#f0e2e6] p-5"><h2 className="font-bold">Seller-arranged fulfillment</h2><p className="mt-2 text-sm leading-6 text-[#75696e]">BelGlow does not provide or price delivery. These details are shared with the seller or sellers in this order so they can arrange delivery or pickup with you.</p>{shippingMethods.length ? <div className="mt-3 space-y-3">{shippingMethods.map((method) => <label key={method.code} className="flex cursor-pointer items-start justify-between gap-4 rounded-xl bg-[#fff8fa] p-4"><span className="flex gap-3"><input type="radio" name="shipping" value={method.code} checked={shippingCode === method.code} onChange={() => setShippingCode(method.code)} className="mt-1 accent-[#ef4b74]" /><span><span className="block font-semibold">{method.name}</span><span className="mt-1 block text-xs text-[#817679]">{method.description}</span></span></span><strong className="shrink-0">Not included</strong></label>)}</div> : <p className="mt-3 text-sm text-[#75696e]">Seller-arranged fulfillment is not configured yet.</p>}</section>
      <section className="mt-5 rounded-2xl border border-[#f0e2e6] p-5"><label className="text-sm font-semibold">Promotion code<input name="promotionCode" placeholder="Optional code" className="mt-2 h-12 w-full rounded-xl border border-[#e7dade] px-4 font-normal uppercase" /></label><label className="mt-4 block text-sm font-semibold">Order note<textarea name="customerNote" rows={3} placeholder="Optional note for your order" className="mt-2 w-full rounded-xl border border-[#e7dade] p-4 font-normal" /></label><div className="mt-4 flex justify-between border-t border-[#f0e2e6] pt-4 text-lg font-black"><span>Product total</span><span>BZ${((subtotal + shipping) / 100).toFixed(2)}</span></div><p className="mt-1 text-xs leading-5 text-[#817679]">This total covers marketplace products only. A seller may agree a separate delivery charge directly with you. A valid promotion is applied securely when the order is created.</p>{error && <p role="alert" className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}<p className="mt-4 text-xs leading-5 text-[#75696e]">No card details are collected by BelGlow. The currently configured checkout method is pay on delivery/manual payment until a supported external processor is connected.</p><button disabled={busy || !shippingMethods.length} className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-[#ef4b74] py-3.5 font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">{busy && <LoaderCircle size={18} className="animate-spin" />}{busy ? "Placing order…" : "Place order"}</button></section>
    </form>}
  </>;
}

function CheckoutField({ name, label, type = "text", autoComplete, placeholder, required = false, wide = false }: { name: string; label: string; type?: string; autoComplete?: string; placeholder: string; required?: boolean; wide?: boolean }) {
  return <label className={`text-sm font-semibold ${wide ? "sm:col-span-2" : ""}`}>{label}<input name={name} type={type} autoComplete={autoComplete} placeholder={placeholder} required={required} className="mt-2 h-12 w-full rounded-xl border border-[#e7dade] px-4 font-normal outline-none focus:border-[#ef4b74]" /></label>;
}
