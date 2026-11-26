"use client";

import Link from "next/link";
import Image from "next/image";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { BadgePercent, BarChart3, ImagePlus, MessageSquareReply, Plus, Store, Trash2, Users, X } from "lucide-react";
import { createClient } from "@/utils/supabase/client";

type Section = "customers" | "reviews" | "promotions" | "analytics" | "store-profile" | "settings";
type StoreRow = { id: string; name: string; description: string | null; support_email: string | null; support_phone: string | null; location: string | null; brand_story: string | null; logo_url: string | null; preparation_days_min: number; preparation_days_max: number; return_window_days: number; notification_preferences: Record<string, boolean> | null; delivery_areas: string | null; delivery_instructions: string | null; offers_delivery: boolean; offers_pickup: boolean; delivery_fee_cents: number | null; pickup_address: string | null };
type PaymentProfile = { id: string; bank_name: string; account_name: string; account_number: string; account_type: string | null; instructions: string | null; is_active: boolean };
type SellerOrder = { id: string; order_id: string; seller_net_cents: number; item_subtotal_cents: number; platform_fee_cents: number; status: string; created_at: string };
type ParentOrder = { id: string; email: string; order_number: number; created_at: string };
type Review = { id: string; product_id: string; rating: number; title: string | null; body: string | null; created_at: string };
type Reply = { review_id: string; body: string };
type Promotion = { id: string; code: string; name: string; description?: string | null; discount_type: string; discount_value: number; minimum_order_cents?: number; starts_at: string | null; ends_at: string | null; usage_count: number; usage_limit: number | null; is_active: boolean };

export default function SellerBusinessTools({ section }: { section: Section }) {
  const [store, setStore] = useState<StoreRow | null>(null);
  const [orders, setOrders] = useState<SellerOrder[]>([]);
  const [parentOrders, setParentOrders] = useState<ParentOrder[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [replies, setReplies] = useState<Map<string, string>>(new Map());
  const [productNames, setProductNames] = useState<Map<string, string>>(new Map());
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [paymentProfiles, setPaymentProfiles] = useState<PaymentProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError("Sign in again to manage your seller account."); setLoading(false); return; }
    const storeResult = await supabase.from("seller_stores").select("id, name, description, support_email, support_phone, location, brand_story, logo_url, preparation_days_min, preparation_days_max, return_window_days, notification_preferences, delivery_areas, delivery_instructions, offers_delivery, offers_pickup, delivery_fee_cents, pickup_address").eq("owner_id", user.id).maybeSingle();
    const legacyStoreResult = storeResult.error?.message.includes("delivery_areas")
      ? await supabase.from("seller_stores").select("id, name, description, support_email, support_phone, location, brand_story, logo_url, preparation_days_min, preparation_days_max, return_window_days, notification_preferences").eq("owner_id", user.id).maybeSingle()
      : null;
    const storeData = storeResult.data ?? legacyStoreResult?.data;
    const storeError = legacyStoreResult?.error ?? storeResult.error;
    if (storeError || !storeData) { setError(storeError?.message ?? "Seller store not found."); setLoading(false); return; }
    const sellerStore = { ...storeData, delivery_areas: "delivery_areas" in storeData ? storeData.delivery_areas : null, delivery_instructions: "delivery_instructions" in storeData ? storeData.delivery_instructions : null, offers_delivery: "offers_delivery" in storeData ? storeData.offers_delivery : true, offers_pickup: "offers_pickup" in storeData ? storeData.offers_pickup : true, delivery_fee_cents: "delivery_fee_cents" in storeData ? storeData.delivery_fee_cents : null, pickup_address: "pickup_address" in storeData ? storeData.pickup_address : null } as StoreRow;
    setStore(sellerStore);
    if (section === "settings") {
      const { data: bankProfiles } = await supabase.from("seller_payment_profiles").select("id, bank_name, account_name, account_number, account_type, instructions, is_active").eq("seller_store_id", sellerStore.id).order("created_at", { ascending: true });
      setPaymentProfiles((bankProfiles as PaymentProfile[] | null) ?? []);
    }
    const needsOrders = section === "customers" || section === "analytics";
    const needsProducts = section === "reviews";
    const [orderResult, productResult, promotionResult] = await Promise.all([
      needsOrders ? supabase.from("seller_orders").select("id, order_id, seller_net_cents, item_subtotal_cents, platform_fee_cents, status, created_at").eq("seller_store_id", sellerStore.id).order("created_at", { ascending: false }).limit(50) : Promise.resolve({ data: [], error: null }),
      needsProducts ? supabase.from("products").select("id, name").eq("seller_store_id", sellerStore.id) : Promise.resolve({ data: [], error: null }),
      section === "promotions" ? supabase.from("promotions").select("id, code, name, description, discount_type, discount_value, minimum_order_cents, starts_at, ends_at, usage_count, usage_limit, is_active").eq("seller_store_id", sellerStore.id).order("created_at", { ascending: false }).limit(50) : Promise.resolve({ data: [], error: null }),
    ]);
    const sellerOrders = (orderResult.data ?? []) as SellerOrder[];
    const products = productResult.data ?? [];
    setOrders(sellerOrders);
    setProductNames(new Map(products.map((product) => [product.id, product.name])));
    setPromotions((promotionResult.data ?? []) as Promotion[]);
    if (sellerOrders.length) {
      const { data } = await supabase.from("orders").select("id, email, order_number, created_at").in("id", sellerOrders.map((order) => order.order_id));
      setParentOrders((data ?? []) as ParentOrder[]);
    } else setParentOrders([]);
    if (products.length) {
      const { data: reviewRows } = await supabase.from("reviews").select("id, product_id, rating, title, body, created_at").in("product_id", products.map((product) => product.id)).eq("is_approved", true).order("created_at", { ascending: false });
      const typedReviews = (reviewRows ?? []) as Review[];
      setReviews(typedReviews);
      if (typedReviews.length) {
        const { data: replyRows } = await supabase.from("review_replies").select("review_id, body").in("review_id", typedReviews.map((review) => review.id));
        setReplies(new Map(((replyRows ?? []) as Reply[]).map((reply) => [reply.review_id, reply.body])));
      } else setReplies(new Map());
    } else setReviews([]);
    setLoading(false);
  }, [section]);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!store) return;
    const form = new FormData(event.currentTarget);
    const preferences = store.notification_preferences ?? { new_orders: true, low_stock: true, reviews: true };
    setBusy("profile"); setError("");
    const { error: saveError } = await createClient().rpc("save_seller_store_profile", {
      store_name: form.get("name"), store_description: form.get("description"), store_support_email: form.get("email"),
      store_support_phone: form.get("phone"), store_location: form.get("location"), store_brand_story: form.get("story"),
      prep_min: Number(form.get("prepMin") ?? store.preparation_days_min), prep_max: Number(form.get("prepMax") ?? store.preparation_days_max),
      return_days: Number(form.get("returnDays") ?? store.return_window_days), preferences,
    });
    setBusy("");
    if (saveError) setError(saveError.message); else { setNotice("Store profile saved."); await load(); }
  }

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!store) return;
    const form = new FormData(event.currentTarget);
    setBusy("settings"); setError("");
    const supabase = createClient();
    const profileResult = await supabase.rpc("save_seller_store_profile", {
      store_name: store.name, store_description: store.description ?? "", store_support_email: store.support_email ?? "",
      store_support_phone: store.support_phone ?? "", store_location: store.location ?? "", store_brand_story: store.brand_story ?? "",
      prep_min: Number(form.get("prepMin")), prep_max: Number(form.get("prepMax")), return_days: Number(form.get("returnDays")),
      preferences: { new_orders: form.get("newOrders") === "on", low_stock: form.get("lowStock") === "on", reviews: form.get("reviews") === "on" },
    });
    const fulfillmentResult = await supabase.rpc("save_seller_fulfillment_profile", { fulfillment_areas: form.get("deliveryAreas"), fulfillment_instructions: form.get("deliveryInstructions") });
    const checkoutResult = await supabase.rpc("save_seller_checkout_settings", {
      checkout_offers_delivery: form.get("offersDelivery") === "on",
      checkout_delivery_fee_cents: form.get("deliveryFee") ? Math.round(Number(form.get("deliveryFee")) * 100) : null,
      checkout_offers_pickup: form.get("offersPickup") === "on",
      checkout_pickup_address: form.get("pickupAddress"),
    });
    setBusy("");
    const missingMigration = fulfillmentResult.error?.message.includes("save_seller_fulfillment_profile");
    const saveError = profileResult.error ?? (missingMigration ? null : fulfillmentResult.error) ?? checkoutResult.error;
    if (saveError) setError(saveError.message); else { setNotice(missingMigration ? "Core settings saved. Fulfillment details will become available after the pending database migration is applied." : "Seller fulfillment settings saved."); await load(); }
  }

  async function savePaymentAccount(event: FormEvent<HTMLFormElement>, accountId?: string) {
    event.preventDefault();
    if (!store) return false;
    const form = new FormData(event.currentTarget);
    setBusy("bank-account"); setError("");
    const { error: saveError } = await createClient().rpc("save_seller_payment_account", {
      target_account_id: accountId ?? null,
      payment_bank_name: form.get("bankName"), payment_account_name: form.get("accountName"),
      payment_account_number: form.get("accountNumber"), payment_account_type: form.get("accountType"),
      payment_instructions: form.get("paymentInstructions"), payment_enabled: form.get("paymentEnabled") === "on",
    });
    setBusy("");
    if (saveError) { setError(saveError.message); return false; }
    setNotice("Bank account saved."); await load(); return true;
  }

  async function removePaymentAccount(accountId: string) {
    setBusy(accountId); setError("");
    const { error: deleteError } = await createClient().rpc("delete_seller_payment_account", { target_account_id: accountId });
    setBusy("");
    if (deleteError) setError(deleteError.message);
    else { setNotice("Bank account removed."); await load(); }
  }

  async function uploadLogo(file: File) {
    if (!store) return;
    if (!file.type.startsWith("image/") || file.size > 10 * 1024 * 1024) { setError("Choose a JPG, PNG, WebP, or AVIF image no larger than 10 MB."); return; }
    setBusy("logo"); setError("");
    const supabase = createClient();
    const extension = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    const path = `${store.id}/store-logo-${Date.now()}.${extension}`;
    const { error: uploadError } = await supabase.storage.from("product-images").upload(path, file, { contentType: file.type, cacheControl: "3600" });
    if (uploadError) { setBusy(""); setError(uploadError.message); return; }
    const logoUrl = supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl;
    const { error: saveError } = await supabase.rpc("save_seller_store_logo", { store_logo_url: logoUrl });
    setBusy("");
    if (saveError) setError(saveError.message); else { setStore((current) => current ? { ...current, logo_url: logoUrl } : current); setNotice("Store logo updated."); }
  }

  async function saveReply(reviewId: string, body: string) {
    if (!store || !body.trim()) return;
    setBusy(reviewId); setError("");
    const { error: replyError } = await createClient().from("review_replies").upsert({ review_id: reviewId, seller_store_id: store.id, body: body.trim() }, { onConflict: "review_id" });
    setBusy("");
    if (replyError) setError(replyError.message); else { setNotice("Reply saved."); await load(); }
  }

  async function createPromotion(event: FormEvent<HTMLFormElement>): Promise<boolean> {
    event.preventDefault();
    if (!store) return false;
    const form = new FormData(event.currentTarget);
    const code = String(form.get("code") ?? "").trim().toUpperCase();
    const type = String(form.get("type"));
    const amount = Number(form.get("value"));
    const minimum = Number(form.get("minimum") || 0);
    const usageLimit = form.get("limit") ? Number(form.get("limit")) : null;
    const startsAt = String(form.get("startsAt") || "");
    const endsAt = String(form.get("endsAt") || "");
    if (!/^[A-Z0-9_-]{3,40}$/.test(code)) { setError("Use 3–40 letters, numbers, hyphens, or underscores for the promotion code."); return false; }
    if (!Number.isFinite(amount) || amount <= 0 || (type === "percentage" && amount > 100)) { setError(type === "percentage" ? "Enter a discount from 1% to 100%." : "Enter a fixed discount greater than zero."); return false; }
    if (!Number.isFinite(minimum) || minimum < 0 || (usageLimit !== null && (!Number.isInteger(usageLimit) || usageLimit < 1))) { setError("Check the minimum order and usage limit values."); return false; }
    if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) { setError("The end date must be after the start date."); return false; }
    setBusy("promotion"); setError("");
    const { error: promotionError } = await createClient().from("promotions").insert({
      seller_store_id: store.id, code, name: String(form.get("name") ?? "").trim(),
      description: String(form.get("description") ?? "").trim() || null, discount_type: type,
      discount_value: type === "percentage" ? Math.round(amount) : Math.round(amount * 100),
      minimum_order_cents: Math.round(minimum * 100), usage_limit: usageLimit,
      starts_at: startsAt || null, ends_at: endsAt || null, is_active: true,
    });
    setBusy("");
    if (promotionError) { setError(promotionError.message); return false; }
    setNotice("Promotion created and ready to use at checkout.");
    await load();
    return true;
  }
  if (loading) return <Panel><p className="py-12 text-center text-sm text-[#817679]">Loading seller data…</p></Panel>;
  if (!store) return <Panel><p className="text-sm text-rose-700">{error || "Seller store not found."}</p></Panel>;

  return <div className="space-y-5">{error && <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}{notice && <p role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</p>}{section === "customers" ? <Customers orders={orders} parentOrders={parentOrders} /> : section === "reviews" ? <Reviews reviews={reviews} replies={replies} products={productNames} busy={busy} onReply={saveReply} /> : section === "promotions" ? <Promotions promotions={promotions} busy={busy} onCreate={createPromotion} /> : section === "analytics" ? <Analytics orders={orders} /> : section === "store-profile" ? <StoreProfile store={store} busy={busy} onSave={saveProfile} onLogo={uploadLogo} /> : <Settings store={store} paymentProfiles={paymentProfiles} busy={busy} onSave={saveSettings} onSaveAccount={savePaymentAccount} onDeleteAccount={removePaymentAccount} />}</div>;
}

function Customers({ orders, parentOrders }: { orders: SellerOrder[]; parentOrders: ParentOrder[] }) {
  const details = new Map(parentOrders.map((order) => [order.id, order]));
  const customers = new Map<string, { email: string; count: number; spent: number; last: string }>();
  for (const order of orders) { const parent = details.get(order.order_id); if (!parent) continue; const key = parent.email.toLowerCase(); const row = customers.get(key) ?? { email: parent.email, count: 0, spent: 0, last: parent.created_at }; row.count += 1; row.spent += order.item_subtotal_cents; if (parent.created_at > row.last) row.last = parent.created_at; customers.set(key, row); }
  return <Panel><div className="flex items-center gap-3"><Users className="text-[#b35f5b]" /><div><h2 className="font-bold">Your customers</h2><p className="text-sm text-[#756a6d]">Only shoppers who purchased from your store are shown.</p></div></div><div className="mt-5 divide-y divide-[#eee5e1]">{[...customers.values()].map((customer) => <article key={customer.email} className="flex items-center gap-4 py-4"><span className="grid h-10 w-10 place-items-center rounded-full bg-[#f4dfda] font-bold text-[#a85855]">{customer.email.charAt(0).toUpperCase()}</span><div className="min-w-0 flex-1"><p className="truncate font-semibold">{customer.email}</p><p className="text-xs text-[#817679]">{customer.count} {customer.count === 1 ? "order" : "orders"} · Last order {new Date(customer.last).toLocaleDateString()}</p></div><strong className="text-sm">BZ${(customer.spent / 100).toFixed(2)}</strong></article>)}{!customers.size && <Empty text="Customers appear after they purchase from your store." />}</div></Panel>;
}

function Reviews({ reviews, replies, products, busy, onReply }: { reviews: Review[]; replies: Map<string, string>; products: Map<string, string>; busy: string; onReply: (id: string, body: string) => void }) {
  const average = reviews.length ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length : 0;
  return <div className="grid gap-5 xl:grid-cols-[280px_1fr]"><Panel><MessageSquareReply className="text-[#b35f5b]" /><p className="mt-4 text-sm text-[#756a6d]">Average rating</p><p className="mt-2 font-serif text-5xl font-bold">{average ? average.toFixed(1) : "—"}</p><p className="mt-2 text-[#d39a37]">{"★".repeat(Math.round(average))}{"☆".repeat(5 - Math.round(average))}</p><p className="mt-2 text-xs text-[#817679]">Based on {reviews.length} approved reviews</p></Panel><div className="space-y-3">{reviews.map((review) => <ReviewCard key={review.id} review={review} product={products.get(review.product_id) ?? "Product"} initialReply={replies.get(review.id) ?? ""} busy={busy === review.id} onSave={(body) => onReply(review.id, body)} />)}{!reviews.length && <Panel><Empty text="Approved customer reviews will appear here." /></Panel>}</div></div>;
}

function ReviewCard({ review, product, initialReply, busy, onSave }: { review: Review; product: string; initialReply: string; busy: boolean; onSave: (body: string) => void }) { const [reply, setReply] = useState(initialReply); return <Panel><div className="flex justify-between gap-4"><div><p className="font-bold">{review.title || "Customer review"}</p><p className="text-xs text-[#817679]">{product} · {new Date(review.created_at).toLocaleDateString()}</p></div><p className="text-[#d39a37]">{"★".repeat(review.rating)}</p></div><p className="mt-4 text-sm leading-6 text-[#62595c]">{review.body || "No written feedback."}</p><label className="mt-4 block text-xs font-bold text-[#756a6d]">Your public reply<textarea value={reply} onChange={(event) => setReply(event.target.value)} rows={3} className="mt-2 w-full rounded-xl border border-[#ddd3d0] p-3 text-sm font-normal" /></label><button disabled={busy || !reply.trim()} onClick={() => onSave(reply)} className="mt-3 rounded-xl bg-[#bf6d68] px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{busy ? "Saving…" : initialReply ? "Update reply" : "Post reply"}</button></Panel>; }

function Promotions({ promotions, busy, onCreate }: { promotions: Promotion[]; busy: string; onCreate: (event: FormEvent<HTMLFormElement>) => Promise<boolean> }) {
  const [createOpen, setCreateOpen] = useState(false);
  const [discountType, setDiscountType] = useState<"percentage" | "fixed_amount">("percentage");
  useEffect(() => {
    if (!createOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [createOpen]);

  return <>
    <Panel>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#f4dfda] text-[#a85855]"><BadgePercent size={19} /></span><div><h2 className="font-bold">Your promotions</h2><p className="text-xs text-[#817679]">{promotions.length} {promotions.length === 1 ? "offer" : "offers"} · Discounts are applied at checkout</p></div></div>
        <button type="button" onClick={() => setCreateOpen(true)} className="rounded-xl bg-[#bf6d68] px-4 py-2.5 text-sm font-bold text-white"><Plus size={16} className="mr-1.5 inline" />Create promotion</button>
      </div>
      {!promotions.length ? <Empty text="Create your first store promotion. Customers can enter its code at checkout." /> : <div className="mt-4 space-y-2">{promotions.map((promo) => {
        const now = Date.now();
        const status = !promo.is_active ? "Inactive" : promo.starts_at && new Date(promo.starts_at).getTime() > now ? "Scheduled" : promo.ends_at && new Date(promo.ends_at).getTime() <= now ? "Expired" : promo.usage_limit !== null && promo.usage_count >= promo.usage_limit ? "Used up" : "Active";
        const active = status === "Active" || status === "Scheduled";
        return <details key={promo.id} className="group rounded-xl border border-[#eee5e1] bg-white">
          <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3 p-3 [&::-webkit-details-marker]:hidden">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#faf6f4] text-[#a85855]"><BadgePercent size={17} /></span>
            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold">{promo.code}</span><span className="block truncate text-xs text-[#817679]">{promo.name} · {promo.usage_count}{promo.usage_limit ? "/" + promo.usage_limit : ""} uses</span></span>
            <strong className="rounded-full bg-[#faf6f4] px-3 py-1 text-xs text-[#5f5054]">{promo.discount_type === "percentage" ? promo.discount_value + "% off" : "BZ$" + (promo.discount_value / 100).toFixed(2) + " off"}</strong>
            <span className={"rounded-full px-2.5 py-1 text-[11px] font-bold " + (active ? "bg-emerald-50 text-emerald-700" : "bg-stone-100 text-stone-600")}>{status}</span>
            <span aria-hidden="true" className="text-xs text-[#817679] transition-transform group-open:rotate-180">▾</span>
          </summary>
          <div className="grid gap-3 border-t border-[#f0e8e5] bg-[#fcfaf9] px-4 py-3 text-xs sm:grid-cols-2">
            {promo.description && <p className="sm:col-span-2 text-sm text-[#5f5054]">{promo.description}</p>}
            <p><span className="font-semibold">Minimum order: </span>BZ${((promo.minimum_order_cents ?? 0) / 100).toFixed(2)}</p>
            <p><span className="font-semibold">Usage: </span>{promo.usage_count}{promo.usage_limit ? " of " + promo.usage_limit : " unlimited"}</p>
            <p><span className="font-semibold">Starts: </span>{promo.starts_at ? new Date(promo.starts_at).toLocaleString("en-BZ", { dateStyle: "medium", timeStyle: "short" }) : "Immediately"}</p>
            <p><span className="font-semibold">Ends: </span>{promo.ends_at ? new Date(promo.ends_at).toLocaleString("en-BZ", { dateStyle: "medium", timeStyle: "short" }) : "No end date"}</p>
          </div>
        </details>;
      })}</div>}
    </Panel>

    {createOpen && <div className="fixed inset-0 z-[110] grid place-items-center overflow-hidden bg-[#211a1d]/50 p-3 backdrop-blur-[2px]" onKeyDown={(event) => { if (event.key === "Escape" && busy !== "promotion") setCreateOpen(false); }} onMouseDown={(event) => { if (event.target === event.currentTarget && busy !== "promotion") setCreateOpen(false); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="create-promotion-title" className="flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-[#eee5e1] p-5"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-[#a85855]">Seller offer</p><h2 id="create-promotion-title" className="mt-1 text-xl font-bold">Create promotion</h2><p className="mt-1 text-sm text-[#817679]">Customers enter this code at checkout; eligible discounts calculate automatically.</p></div><button type="button" disabled={busy === "promotion"} onClick={() => setCreateOpen(false)} aria-label="Close promotion form" className="rounded-full bg-[#f4dfda] p-2 text-[#9b514f] disabled:opacity-40"><X size={18} /></button></div>
        <form onSubmit={async (event) => { if (await onCreate(event)) setCreateOpen(false); }} className="min-h-0 space-y-4 overflow-y-auto p-5">
          <div className="grid gap-3 sm:grid-cols-2"><Input name="code" label="Promotion code" placeholder="WELCOME15" required /><Input name="name" label="Offer name" placeholder="Welcome offer" required /></div>
          <Input name="description" label="Customer-facing description" placeholder="Optional offer details" />
          <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-semibold">Discount type<select name="type" value={discountType} onChange={(event) => setDiscountType(event.target.value as "percentage" | "fixed_amount")} className="mt-2 h-12 w-full rounded-xl border border-[#ddd3d0] bg-[#fcfaf9] px-3 font-normal outline-none focus:border-[#bf6d68]"><option value="percentage">Percentage off</option><option value="fixed_amount">Fixed amount off (BZD)</option></select></label><Input name="value" label={discountType === "percentage" ? "Discount percent" : "Discount amount (BZ$)"} placeholder={discountType === "percentage" ? "15" : "10.00"} type="number" step={discountType === "percentage" ? "1" : "0.01"} required /></div>
          <details className="rounded-xl border border-[#eee5e1] px-4 py-3"><summary className="cursor-pointer text-sm font-semibold">Limits and schedule <span className="ml-1 text-xs font-normal text-[#817679]">(optional)</span></summary><div className="mt-4 grid gap-3 sm:grid-cols-2"><Input name="minimum" label="Minimum order (BZ$)" placeholder="0" type="number" step="0.01" /><Input name="limit" label="Maximum uses" placeholder="Unlimited" type="number" step="1" /><Input name="startsAt" label="Starts" placeholder="" type="datetime-local" /><Input name="endsAt" label="Ends" placeholder="" type="datetime-local" /></div></details>
          <div className="flex justify-end gap-2 border-t border-[#eee5e1] pt-4"><button type="button" disabled={busy === "promotion"} onClick={() => setCreateOpen(false)} className="rounded-xl border border-[#e5d9d5] px-4 py-2.5 text-sm font-semibold">Cancel</button><button disabled={busy === "promotion"} className="rounded-xl bg-[#bf6d68] px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">{busy === "promotion" ? "Creating…" : "Create offer"}</button></div>
        </form>
      </section>
    </div>}
  </>;
}
function Analytics({ orders }: { orders: SellerOrder[] }) {
  const [range, setRange] = useState<7 | 14 | 30>(14);
  const gross = orders.reduce((sum, order) => sum + order.item_subtotal_cents, 0);
  const fees = orders.reduce((sum, order) => sum + order.platform_fee_cents, 0);
  const net = orders.reduce((sum, order) => sum + order.seller_net_cents, 0);
  const salesByDay = new Map<string, number>();
  for (const order of orders) {
    const day = order.created_at.slice(0, 10);
    salesByDay.set(day, (salesByDay.get(day) ?? 0) + order.seller_net_cents);
  }

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const days = Array.from({ length: range }, (_, index) => {
    const date = new Date(today);
    date.setUTCDate(today.getUTCDate() - (range - index - 1));
    const key = date.toISOString().slice(0, 10);
    return { key, value: salesByDay.get(key) ?? 0 };
  });
  const maxValue = Math.max(...days.map((day) => day.value), 0);
  const tickStep = Math.max(100, Math.ceil(maxValue / 4 / 100) * 100);
  const chartMax = tickStep * 4;
  const plot = { left: 76, right: 22, top: 18, bottom: 54, width: 800, height: 280 };
  const plotWidth = plot.width - plot.left - plot.right;
  const plotHeight = plot.height - plot.top - plot.bottom;
  const points = days.map((day, index) => ({
    x: plot.left + (index / Math.max(days.length - 1, 1)) * plotWidth,
    y: plot.top + (1 - day.value / chartMax) * plotHeight,
  }));
  const linePath = points.map((point, index) => (index === 0 ? "M" : "L") + " " + point.x + " " + point.y).join(" ");
  const areaPath = linePath + " L " + points[points.length - 1].x + " " + (plot.top + plotHeight) + " L " + points[0].x + " " + (plot.top + plotHeight) + " Z";
  const labelStep = Math.ceil(days.length / 7);

  return <div className="space-y-5">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Mini label="Seller orders" value={orders.length.toString()} />
      <Mini label="Gross sales" value={`BZ${(gross / 100).toFixed(2)}`} />
      <Mini label="Platform fees" value={`BZ${(fees / 100).toFixed(2)}`} />
      <Mini label="Net earnings" value={`BZ${(net / 100).toFixed(2)}`} />
    </div>

    <Panel>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#f4dfda] text-[#a85855]"><BarChart3 size={20} /></span>
          <div><h2 className="font-bold">Net earnings trend</h2><p className="text-sm text-[#756a6d]">Daily seller earnings after platform fees</p></div>
        </div>
        <label className="flex items-center gap-2 text-xs font-semibold text-[#756a6d]">Period
          <select aria-label="Analytics chart period" value={range} onChange={(event) => setRange(Number(event.target.value) as 7 | 14 | 30)} className="rounded-lg border border-[#e5d9d5] bg-white px-3 py-2 text-sm text-[#342c2e] outline-none focus:border-[#bf6d68]">
            <option value={7}>7 days</option><option value={14}>14 days</option><option value={30}>30 days</option>
          </select>
        </label>
      </div>

      {maxValue > 0 ? <div className="mt-5 overflow-hidden rounded-xl border border-[#eee5e1] bg-[#fdfbfa] p-3 sm:p-4">
        <svg viewBox={`0 0 ${plot.width} ${plot.height}`} role="img" aria-label={`Net earnings over the last ${range} days`} className="h-[250px] w-full overflow-visible sm:h-[290px]">
          <title>Net earnings over the last {range} days</title>
          <desc>Line chart of daily seller net earnings in Belize dollars.</desc>
          <defs><linearGradient id="seller-earnings-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#bf6d68" stopOpacity="0.22" /><stop offset="100%" stopColor="#bf6d68" stopOpacity="0.02" /></linearGradient></defs>
          {[0, 1, 2, 3, 4].map((tick) => {
            const y = plot.top + plotHeight * (tick / 4);
            const amount = tickStep * (4 - tick);
            return <g key={tick}>
              <line x1={plot.left} x2={plot.width - plot.right} y1={y} y2={y} stroke="#e9dfdc" strokeDasharray={tick === 4 ? undefined : "3 5"} />
              <text x={plot.left - 10} y={y + 4} textAnchor="end" fill="#817679" fontSize="11">BZ${(amount / 100).toFixed(0)}</text>
            </g>;
          })}
          <path d={areaPath} fill="url(#seller-earnings-fill)" />
          <path d={linePath} fill="none" stroke="#a85855" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          {points.map((point, index) => <g key={days[index].key}>
            <title>{days[index].key}: BZ${(days[index].value / 100).toFixed(2)}</title>
            <circle cx={point.x} cy={point.y} r="4" fill="#fff" stroke="#a85855" strokeWidth="2.5" />
          </g>)}
          {days.map((day, index) => index % labelStep === 0 || index === days.length - 1 ? <text key={day.key} x={points[index].x} y={plot.height - 16} textAnchor="middle" fill="#817679" fontSize="11">{new Intl.DateTimeFormat("en-BZ", { month: "short", day: "numeric" }).format(new Date(day.key + "T12:00:00"))}</text> : null)}
        </svg>
      </div> : <div className="mt-5 grid min-h-[240px] place-items-center rounded-xl border border-dashed border-[#e5d9d5] bg-[#faf6f4] px-6 text-center"><div><span className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-white text-[#a85855] shadow-sm"><BarChart3 size={20} /></span><p className="mt-3 font-semibold">No sales in the last {range} days</p><p className="mt-1 max-w-sm text-sm text-[#817679]">Your daily earnings chart will fill in as customers complete orders.</p></div></div>}
    </Panel>
  </div>;
}
function StoreProfile({ store, busy, onSave, onLogo }: { store: StoreRow; busy: string; onSave: (event: FormEvent<HTMLFormElement>) => void; onLogo: (file: File) => void }) {
  const [activeModal, setActiveModal] = useState<"details" | "story" | null>(null);
  return <div className="grid gap-5 xl:grid-cols-[300px_1fr]">
    <Panel><div className="relative mx-auto grid h-28 w-28 overflow-hidden place-items-center rounded-full bg-[#ead1cb] text-[#a95c59]">{store.logo_url ? <Image src={store.logo_url} alt={`${store.name} logo`} fill sizes="112px" className="object-cover" unoptimized /> : <Store size={44} />}</div><label className="mx-auto mt-4 flex w-fit cursor-pointer items-center gap-2 rounded-xl border border-[#d9c2bd] px-4 py-2.5 text-xs font-bold text-[#9b5a57]"><ImagePlus size={16} />{busy === "logo" ? "Uploading…" : "Upload logo"}<input type="file" accept="image/jpeg,image/png,image/webp,image/avif" disabled={busy === "logo"} onChange={(event) => { const file = event.target.files?.[0]; if (file) void onLogo(file); }} className="sr-only" /></label><p className="mt-4 text-center text-xs leading-5 text-[#817679]">Your store identity appears throughout the marketplace.</p></Panel>
    <Panel><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-[#b35f5b]">Public storefront</p><h2 className="mt-2 text-2xl font-bold">{store.name}</h2><p className="mt-1 text-sm text-[#756a6d]">{store.location || "Add a store location"}</p></div><button type="button" onClick={() => setActiveModal("details")} className="rounded-xl bg-[#bf6d68] px-4 py-2.5 text-sm font-bold text-white">Edit store details</button></div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2"><ProfileSummary label="Contact email" value={store.support_email || "Not added"} /><ProfileSummary label="Contact phone" value={store.support_phone || "Not added"} /><div className="rounded-xl bg-[#faf6f4] p-4 sm:col-span-2"><p className="text-xs font-bold uppercase tracking-wide text-[#817679]">Short description</p><p className="mt-1 text-sm leading-6">{store.description || "Add a short description for customers."}</p></div><div className="rounded-xl bg-[#faf6f4] p-4 sm:col-span-2"><div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs font-bold uppercase tracking-wide text-[#817679]">Brand story</p><button type="button" onClick={() => setActiveModal("story")} className="text-sm font-bold text-[#9b5a57]">Edit story</button></div><p className="mt-1 line-clamp-3 whitespace-pre-wrap text-sm leading-6">{store.brand_story || "Share your brand story with customers."}</p></div></div>
    </Panel>
    <form onSubmit={onSave} className="contents">
      <div hidden={activeModal !== "details"} className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 p-4" role="presentation" onKeyDown={(event) => { if (event.key === "Escape") setActiveModal(null); }} onMouseDown={(event) => { if (event.target === event.currentTarget) setActiveModal(null); }}><section role="dialog" aria-modal="true" aria-labelledby="store-details-title" className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl sm:p-6"><div className="flex items-start justify-between gap-4"><div><h2 id="store-details-title" className="text-xl font-bold">Public store details</h2><p className="mt-1 text-sm text-[#756a6d]">Keep your marketplace contact information current.</p></div><button type="button" onClick={() => setActiveModal(null)} aria-label="Close" className="rounded-full p-2 hover:bg-[#faf6f4]"><X size={20} /></button></div><div className="mt-5 grid gap-4 sm:grid-cols-2"><Input name="name" label="Store name" placeholder="Store name" defaultValue={store.name} required /><Input name="email" label="Contact email" placeholder="hello@example.com" type="email" defaultValue={store.support_email ?? ""} /><Input name="phone" label="Contact phone" placeholder="+501" defaultValue={store.support_phone ?? ""} /><Input name="location" label="Location" placeholder="Belize City, Belize" defaultValue={store.location ?? ""} /><label className="text-sm font-semibold sm:col-span-2">Short description<textarea name="description" rows={4} maxLength={1000} defaultValue={store.description ?? ""} placeholder="A short introduction to your store" className="mt-2 w-full rounded-xl border border-[#ddd3d0] bg-[#fcfaf9] p-4 font-normal" /></label></div><input type="hidden" name="prepMin" value={store.preparation_days_min} /><input type="hidden" name="prepMax" value={store.preparation_days_max} /><input type="hidden" name="returnDays" value={store.return_window_days} /><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setActiveModal(null)} className="rounded-xl border border-[#e5d9d5] px-4 py-2.5 font-semibold">Back</button><button className="rounded-xl bg-[#bf6d68] px-5 py-2.5 font-bold text-white">{busy === "profile" ? "Saving…" : "Save details"}</button></div></section></div>
      <div hidden={activeModal !== "story"} className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 p-4" role="presentation" onKeyDown={(event) => { if (event.key === "Escape") setActiveModal(null); }} onMouseDown={(event) => { if (event.target === event.currentTarget) setActiveModal(null); }}><section role="dialog" aria-modal="true" aria-labelledby="brand-story-title" className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl sm:p-6"><div className="flex items-start justify-between gap-4"><div><h2 id="brand-story-title" className="text-xl font-bold">Brand story</h2><p className="mt-1 text-sm text-[#756a6d]">Tell shoppers what makes your business special.</p></div><button type="button" onClick={() => setActiveModal(null)} aria-label="Close" className="rounded-full p-2 hover:bg-[#faf6f4]"><X size={20} /></button></div><label className="mt-5 block text-sm font-semibold">Your story<textarea name="story" rows={9} maxLength={5000} defaultValue={store.brand_story ?? ""} placeholder="Share your inspiration, products, and what customers can expect." className="mt-2 w-full rounded-xl border border-[#ddd3d0] bg-[#fcfaf9] p-4 font-normal" /></label><input type="hidden" name="name" value={store.name} /><input type="hidden" name="email" value={store.support_email ?? ""} /><input type="hidden" name="phone" value={store.support_phone ?? ""} /><input type="hidden" name="location" value={store.location ?? ""} /><input type="hidden" name="description" value={store.description ?? ""} /><input type="hidden" name="prepMin" value={store.preparation_days_min} /><input type="hidden" name="prepMax" value={store.preparation_days_max} /><input type="hidden" name="returnDays" value={store.return_window_days} /><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setActiveModal(null)} className="rounded-xl border border-[#e5d9d5] px-4 py-2.5 font-semibold">Back</button><button className="rounded-xl bg-[#bf6d68] px-5 py-2.5 font-bold text-white">{busy === "profile" ? "Saving…" : "Save story"}</button></div></section></div>
    </form>
  </div>;
}

function ProfileSummary({ label, value }: { label: string; value: string }) { return <div className="rounded-xl bg-[#faf6f4] p-4"><p className="text-xs font-bold uppercase tracking-wide text-[#817679]">{label}</p><p className="mt-1 break-words text-sm font-semibold">{value}</p></div>; }
function Settings({ store, paymentProfiles, busy, onSave, onSaveAccount, onDeleteAccount }: { store: StoreRow; paymentProfiles: PaymentProfile[]; busy: string; onSave: (event: FormEvent<HTMLFormElement>) => void; onSaveAccount: (event: FormEvent<HTMLFormElement>, accountId?: string) => Promise<boolean>; onDeleteAccount: (accountId: string) => Promise<void> }) {
  const preferences = store.notification_preferences ?? {};
  const [activeSettingsModal, setActiveSettingsModal] = useState<"delivery" | "coverage" | "notifications" | null>(null);
  const [passwordModal, setPasswordModal] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [manageAccounts, setManageAccounts] = useState(false);
  const [editing, setEditing] = useState<PaymentProfile | null>(null);
  const [adding, setAdding] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [submitBusy, setSubmitBusy] = useState(false);
  const closeEditor = () => { setEditing(null); setAdding(false); };
  const closePasswordModal = () => { setPasswordModal(false); setPasswordError(""); setPasswordSaved(false); };
  async function updateSellerPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get("newPassword") ?? "");
    if (password !== String(form.get("confirmPassword") ?? "")) { setPasswordError("The passwords do not match."); return; }
    setPasswordBusy(true); setPasswordError("");
    const { error: updateError } = await createClient().auth.updateUser({ password });
    setPasswordBusy(false);
    if (updateError) setPasswordError(updateError.message); else setPasswordSaved(true);
  }
  return <div className="grid gap-5 xl:grid-cols-2">
    <Panel>
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-bold">Customer bank transfers</h2><p className="mt-1 text-sm text-[#756a6d]">Customers see your active account details after placing an order.</p></div><button type="button" onClick={() => setManageAccounts(true)} className="flex items-center gap-2 rounded-xl bg-[#bf6d68] px-4 py-2.5 text-sm font-bold text-white"><Plus size={16} />Manage accounts</button></div>
      <div className="mt-4 space-y-2">{paymentProfiles.map((profile) => <div key={profile.id} className="flex items-center justify-between gap-3 rounded-xl bg-[#faf6f4] px-4 py-3"><div className="min-w-0"><p className="truncate font-semibold">{profile.bank_name} · {profile.account_name}</p><p className="text-xs text-[#817679]">{profile.account_number} · {profile.is_active ? "Accepting transfers" : "Disabled"}</p></div><button type="button" onClick={() => setEditing(profile)} className="shrink-0 rounded-lg border border-[#e5d9d5] px-3 py-2 text-xs font-bold">Edit</button></div>)}{!paymentProfiles.length && <p className="rounded-xl bg-[#faf6f4] p-4 text-sm text-[#756a6d]">No bank accounts added yet.</p>}</div>
      <p className="mt-3 text-xs leading-5 text-[#817679]">Never enter online-banking passwords, PINs, one-time codes, or card details.</p>
    </Panel>
    <form onSubmit={onSave}>
      <Panel>
        <h2 className="text-lg font-bold">Delivery and store preferences</h2><p className="mt-1 text-sm text-[#756a6d]">Open a section only when you need to change it.</p>
        <div className="mt-4 space-y-3">
          <SettingsOption title="Delivery and pickup" detail="Delivery fees, pickup availability, and pickup address" onClick={() => setActiveSettingsModal("delivery")} />
          <SettingsOption title="Preparation and coverage" detail="Preparation times, return window, and service areas" onClick={() => setActiveSettingsModal("coverage")} />
          <SettingsOption title="Notifications" detail="Choose which seller alerts you receive" onClick={() => setActiveSettingsModal("notifications")} />
        </div>
        <div hidden={activeSettingsModal !== "delivery"} className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 p-4" role="presentation" onKeyDown={(event) => { if (event.key === "Escape") setActiveSettingsModal(null); }} onMouseDown={(event) => { if (event.target === event.currentTarget) setActiveSettingsModal(null); }}><section role="dialog" aria-modal="true" aria-labelledby="delivery-settings-title" className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl sm:p-6"><div className="flex items-center justify-between"><div><h3 id="delivery-settings-title" className="text-xl font-bold">Delivery and pickup</h3><p className="mt-1 text-sm text-[#756a6d]">Set the fulfillment options customers can choose.</p></div><button type="button" onClick={() => setActiveSettingsModal(null)} aria-label="Close" className="rounded-full px-3 py-2 text-xl hover:bg-[#faf6f4]">×</button></div><div className="mt-4"><Toggle name="offersDelivery" label="Offer delivery" detail="Customers can enter a delivery address." checked={store.offers_delivery} /><Input name="deliveryFee" label="Delivery fee (BZD, optional)" placeholder="5.00" type="number" defaultValue={store.delivery_fee_cents === null ? "" : (store.delivery_fee_cents / 100).toFixed(2)} /><Toggle name="offersPickup" label="Offer store pickup" detail="Customers will see your pickup address." checked={store.offers_pickup} /><label className="mt-3 block text-sm font-semibold">Pickup address<textarea name="pickupAddress" rows={3} maxLength={500} defaultValue={store.pickup_address ?? store.location ?? ""} placeholder="Full address and pickup directions" className="mt-2 w-full rounded-xl border border-[#ddd3d0] bg-[#fcfaf9] p-3 font-normal" /></label></div><div className="mt-5 flex justify-end"><button type="button" onClick={() => setActiveSettingsModal(null)} className="rounded-xl bg-[#bf6d68] px-5 py-2.5 font-bold text-white">Done</button></div></section></div>
        <div hidden={activeSettingsModal !== "coverage"} className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 p-4" role="presentation" onKeyDown={(event) => { if (event.key === "Escape") setActiveSettingsModal(null); }} onMouseDown={(event) => { if (event.target === event.currentTarget) setActiveSettingsModal(null); }}><section role="dialog" aria-modal="true" aria-labelledby="coverage-settings-title" className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl sm:p-6"><div className="flex items-center justify-between"><div><h3 id="coverage-settings-title" className="text-xl font-bold">Preparation and coverage</h3><p className="mt-1 text-sm text-[#756a6d]">Set the timelines and areas you support.</p></div><button type="button" onClick={() => setActiveSettingsModal(null)} aria-label="Close" className="rounded-full px-3 py-2 text-xl hover:bg-[#faf6f4]">×</button></div><div className="mt-4 grid gap-3 sm:grid-cols-2"><Input name="prepMin" label="Minimum preparation days" placeholder="1" type="number" defaultValue={String(store.preparation_days_min)} required /><Input name="prepMax" label="Maximum preparation days" placeholder="2" type="number" defaultValue={String(store.preparation_days_max)} required /><Input name="returnDays" label="Return window (days)" placeholder="14" type="number" defaultValue={String(store.return_window_days)} required /><label className="text-sm font-semibold sm:col-span-2">Delivery coverage<textarea name="deliveryAreas" rows={3} maxLength={1000} defaultValue={store.delivery_areas ?? ""} placeholder="Areas your business serves" className="mt-2 w-full rounded-xl border border-[#ddd3d0] bg-[#fcfaf9] p-3 font-normal" /></label><label className="text-sm font-semibold sm:col-span-2">Customer fulfillment information<textarea name="deliveryInstructions" rows={3} maxLength={2000} defaultValue={store.delivery_instructions ?? ""} placeholder="Expected contact time and fulfillment instructions" className="mt-2 w-full rounded-xl border border-[#ddd3d0] bg-[#fcfaf9] p-3 font-normal" /></label></div><div className="mt-5 flex justify-end"><button type="button" onClick={() => setActiveSettingsModal(null)} className="rounded-xl bg-[#bf6d68] px-5 py-2.5 font-bold text-white">Done</button></div></section></div>
        <div hidden={activeSettingsModal !== "notifications"} className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 p-4" role="presentation" onKeyDown={(event) => { if (event.key === "Escape") setActiveSettingsModal(null); }} onMouseDown={(event) => { if (event.target === event.currentTarget) setActiveSettingsModal(null); }}><section role="dialog" aria-modal="true" aria-labelledby="notifications-settings-title" className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl sm:p-6"><div className="flex items-center justify-between"><div><h3 id="notifications-settings-title" className="text-xl font-bold">Notifications</h3><p className="mt-1 text-sm text-[#756a6d]">Choose the alerts you want in your seller dashboard.</p></div><button type="button" onClick={() => setActiveSettingsModal(null)} aria-label="Close" className="rounded-full px-3 py-2 text-xl hover:bg-[#faf6f4]">×</button></div><div className="mt-3"><Toggle name="newOrders" label="New order alerts" detail="Dashboard alerts when customers order." checked={preferences.new_orders ?? true} /><Toggle name="lowStock" label="Low-stock alerts" detail="Know when inventory needs restocking." checked={preferences.low_stock ?? true} /><Toggle name="reviews" label="Review alerts" detail="Know when a customer leaves a review." checked={preferences.reviews ?? true} /></div><div className="mt-5 flex justify-end"><button type="button" onClick={() => setActiveSettingsModal(null)} className="rounded-xl bg-[#bf6d68] px-5 py-2.5 font-bold text-white">Done</button></div></section></div>`r`n        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[#eee5e1] pt-4"><button type="button" onClick={() => setPasswordModal(true)} className="text-sm font-bold text-[#9b5a57]">Change password</button><button disabled={busy === "settings"} className="rounded-xl bg-[#bf6d68] px-5 py-3 font-bold text-white disabled:opacity-50">{busy === "settings" ? "Saving…" : "Save settings"}</button></div>
      </Panel>
    </form>
    {passwordModal && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 p-4" role="presentation" onKeyDown={(event) => { if (event.key === "Escape") closePasswordModal(); }} onMouseDown={(event) => { if (event.target === event.currentTarget) closePasswordModal(); }}><section role="dialog" aria-modal="true" aria-labelledby="password-modal-title" className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl sm:p-6"><div className="flex items-start justify-between gap-4"><div><h2 id="password-modal-title" className="text-xl font-bold">Change password</h2><p className="mt-1 text-sm text-[#756a6d]">Use at least 8 characters for your account password.</p></div><button type="button" onClick={closePasswordModal} aria-label="Close" className="rounded-full p-2 hover:bg-[#faf6f4]"><X size={20} /></button></div>{passwordSaved ? <div role="status" className="mt-5 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800"><p>Your password has been updated.</p><button type="button" onClick={closePasswordModal} className="mt-3 font-bold underline">Done</button></div> : <form onSubmit={updateSellerPassword} className="mt-5 space-y-4"><label className="block text-sm font-semibold">New password<input name="newPassword" type="password" minLength={8} autoComplete="new-password" required className="mt-2 h-12 w-full rounded-xl border border-[#ddd3d0] bg-[#fcfaf9] px-4 font-normal" /></label><label className="block text-sm font-semibold">Confirm new password<input name="confirmPassword" type="password" minLength={8} autoComplete="new-password" required className="mt-2 h-12 w-full rounded-xl border border-[#ddd3d0] bg-[#fcfaf9] px-4 font-normal" /></label>{passwordError && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{passwordError}</p>}<div className="flex justify-end gap-2"><button type="button" onClick={closePasswordModal} className="rounded-xl border border-[#e5d9d5] px-4 py-2.5 font-semibold">Back</button><button disabled={passwordBusy} className="rounded-xl bg-[#bf6d68] px-5 py-2.5 font-bold text-white disabled:opacity-50">{passwordBusy ? "Updating…" : "Update password"}</button></div></form>}</section></div>}    {(manageAccounts || editing || adding) && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) { setManageAccounts(false); closeEditor(); } }}><section role="dialog" aria-modal="true" aria-labelledby="bank-dialog-title" className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl sm:p-6"><div className="flex items-center justify-between gap-3"><div><h2 id="bank-dialog-title" className="text-xl font-bold">{editing || adding ? (editing ? "Edit bank account" : "Add bank account") : "Manage bank accounts"}</h2><p className="mt-1 text-sm text-[#756a6d]">Add accounts customers can use for direct transfers.</p></div><button type="button" onClick={() => { setManageAccounts(false); closeEditor(); }} aria-label="Close" className="rounded-full p-2 hover:bg-[#faf6f4]"><X size={20} /></button></div>
      {editing || adding ? <form className="mt-5 space-y-4" onSubmit={async (event) => { setSubmitBusy(true); const saved = await onSaveAccount(event, editing?.id); setSubmitBusy(false); if (saved) { closeEditor(); setManageAccounts(false); } }}><div className="grid gap-4 sm:grid-cols-2"><Input name="bankName" label="Bank name" placeholder="Bank name" defaultValue={editing?.bank_name ?? ""} required /><Input name="accountName" label="Account holder name" placeholder="Registered account name" defaultValue={editing?.account_name ?? ""} required /><Input name="accountNumber" label="Account number" placeholder="Account number" defaultValue={editing?.account_number ?? ""} required /><Input name="accountType" label="Account type" placeholder="Savings or chequing" defaultValue={editing?.account_type ?? ""} /></div><label className="block text-sm font-semibold">Transfer instructions<textarea name="paymentInstructions" rows={3} maxLength={1000} defaultValue={editing?.instructions ?? ""} placeholder="Transfer reference or safe payment guidance" className="mt-2 w-full rounded-xl border border-[#ddd3d0] bg-[#fcfaf9] p-3 font-normal" /></label><Toggle name="paymentEnabled" label="Accept transfers to this account" detail="Active accounts are shown to customers at checkout." checked={editing?.is_active ?? true} /><div className="flex justify-end gap-2"><button type="button" onClick={closeEditor} className="rounded-xl border px-4 py-2.5 font-semibold">Back</button><button disabled={submitBusy || busy === "bank-account"} className="rounded-xl bg-[#bf6d68] px-5 py-2.5 font-bold text-white disabled:opacity-50">{submitBusy || busy === "bank-account" ? "Saving…" : "Save account"}</button></div></form> : <><div className="mt-5 space-y-3">{paymentProfiles.map((profile) => <article key={profile.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#eee5e1] p-4"><div><p className="font-bold">{profile.bank_name} · {profile.account_name}</p><p className="text-sm text-[#756a6d]">{profile.account_number} · {profile.is_active ? "Active" : "Disabled"}</p></div><div className="flex gap-2"><button type="button" onClick={() => setEditing(profile)} className="rounded-lg border px-3 py-2 text-sm font-semibold">Edit</button>{confirmDelete === profile.id ? <><button type="button" onClick={() => setConfirmDelete(null)} className="rounded-lg border px-3 py-2 text-sm">Keep</button><button type="button" disabled={busy === profile.id} onClick={() => { setConfirmDelete(null); void onDeleteAccount(profile.id); }} className="rounded-lg bg-rose-600 px-3 py-2 text-sm font-bold text-white">Remove</button></> : <button type="button" onClick={() => setConfirmDelete(profile.id)} aria-label={`Remove ${profile.bank_name} account`} className="rounded-lg border border-rose-200 p-2 text-rose-700"><Trash2 size={16} /></button>}</div></article>)}{!paymentProfiles.length && <p className="rounded-xl bg-[#faf6f4] p-4 text-sm text-[#756a6d]">No bank accounts yet.</p>}</div><button type="button" onClick={() => setAdding(true)} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#bf6d68] px-4 py-3 font-bold text-white"><Plus size={17} />Add bank account</button></>}
    </section></div>}
  </div>;
}
function Panel({ children }: { children: React.ReactNode }) { return <section className="rounded-2xl border border-[#ede3df] bg-white p-5 shadow-sm">{children}</section>; }
function SettingsOption({ title, detail, onClick }: { title: string; detail: string; onClick: () => void }) { return <button type="button" onClick={onClick} className="flex w-full items-center justify-between gap-4 rounded-xl border border-[#eee5e1] p-4 text-left transition hover:border-[#d5a09b] hover:bg-[#fffafa]"><span><strong className="block">{title}</strong><span className="mt-1 block text-sm font-normal text-[#756a6d]">{detail}</span></span><span aria-hidden="true" className="text-xl text-[#bf6d68]">›</span></button>; }
function Empty({ text }: { text: string }) { return <p className="rounded-xl bg-[#faf6f4] p-5 text-sm text-[#756a6d]">{text}</p>; }
function Mini({ label, value }: { label: string; value: string }) { return <Panel><p className="text-xs text-[#756a6d]">{label}</p><p className="mt-1 font-serif text-2xl font-bold">{value}</p></Panel>; }
function Input({ name, label, placeholder, type = "text", defaultValue, required = false, step }: { name: string; label: string; placeholder: string; type?: string; defaultValue?: string; required?: boolean; step?: string }) { return <label className="text-sm font-semibold">{label}<input name={name} type={type} defaultValue={defaultValue} placeholder={placeholder} required={required} min={type === "number" ? 0 : undefined} step={step ?? (type === "number" ? "any" : undefined)} className="mt-2 h-12 w-full rounded-xl border border-[#ddd3d0] bg-[#fcfaf9] px-4 font-normal outline-none focus:border-[#bf6d68]" /></label>; }
function Toggle({ name, label, detail, checked }: { name: string; label: string; detail: string; checked: boolean }) { return <label className="mt-3 flex items-center gap-4 border-b border-[#eee5e1] py-4"><span className="flex-1"><strong className="block text-sm">{label}</strong><span className="mt-1 block text-xs text-[#817679]">{detail}</span></span><input name={name} type="checkbox" defaultChecked={checked} className="h-5 w-5 accent-[#bf6d68]" /></label>; }

