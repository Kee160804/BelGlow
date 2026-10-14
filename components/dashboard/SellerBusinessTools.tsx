"use client";

import Link from "next/link";
import Image from "next/image";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { BadgePercent, BarChart3, ImagePlus, MessageSquareReply, Store, Users } from "lucide-react";
import { createClient } from "@/utils/supabase/client";

type Section = "customers" | "reviews" | "promotions" | "analytics" | "store-profile" | "settings";
type StoreRow = { id: string; name: string; description: string | null; support_email: string | null; support_phone: string | null; location: string | null; brand_story: string | null; logo_url: string | null; preparation_days_min: number; preparation_days_max: number; return_window_days: number; notification_preferences: Record<string, boolean> | null };
type SellerOrder = { id: string; order_id: string; seller_net_cents: number; item_subtotal_cents: number; platform_fee_cents: number; status: string; created_at: string };
type ParentOrder = { id: string; email: string; order_number: number; created_at: string };
type Review = { id: string; product_id: string; rating: number; title: string | null; body: string | null; created_at: string };
type Reply = { review_id: string; body: string };
type Promotion = { id: string; code: string; name: string; discount_type: string; discount_value: number; starts_at: string | null; ends_at: string | null; usage_count: number; usage_limit: number | null; is_active: boolean };

export default function SellerBusinessTools({ section }: { section: Section }) {
  const [store, setStore] = useState<StoreRow | null>(null);
  const [orders, setOrders] = useState<SellerOrder[]>([]);
  const [parentOrders, setParentOrders] = useState<ParentOrder[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [replies, setReplies] = useState<Map<string, string>>(new Map());
  const [productNames, setProductNames] = useState<Map<string, string>>(new Map());
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError("Sign in again to manage your seller account."); setLoading(false); return; }
    const { data: storeData, error: storeError } = await supabase.from("seller_stores").select("id, name, description, support_email, support_phone, location, brand_story, logo_url, preparation_days_min, preparation_days_max, return_window_days, notification_preferences").eq("owner_id", user.id).maybeSingle();
    if (storeError || !storeData) { setError(storeError?.message ?? "Seller store not found."); setLoading(false); return; }
    const sellerStore = storeData as StoreRow;
    setStore(sellerStore);
    const [orderResult, productResult, promotionResult] = await Promise.all([
      supabase.from("seller_orders").select("id, order_id, seller_net_cents, item_subtotal_cents, platform_fee_cents, status, created_at").eq("seller_store_id", sellerStore.id).order("created_at", { ascending: false }),
      supabase.from("products").select("id, name").eq("seller_store_id", sellerStore.id),
      supabase.from("promotions").select("id, code, name, discount_type, discount_value, starts_at, ends_at, usage_count, usage_limit, is_active").eq("seller_store_id", sellerStore.id).order("created_at", { ascending: false }),
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
  }, []);

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
    const { error: saveError } = await createClient().rpc("save_seller_store_profile", {
      store_name: store.name, store_description: store.description ?? "", store_support_email: store.support_email ?? "",
      store_support_phone: store.support_phone ?? "", store_location: store.location ?? "", store_brand_story: store.brand_story ?? "",
      prep_min: Number(form.get("prepMin")), prep_max: Number(form.get("prepMax")), return_days: Number(form.get("returnDays")),
      preferences: { new_orders: form.get("newOrders") === "on", low_stock: form.get("lowStock") === "on", reviews: form.get("reviews") === "on" },
    });
    setBusy("");
    if (saveError) setError(saveError.message); else { setNotice("Seller settings saved."); await load(); }
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

  async function createPromotion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!store) return;
    const form = new FormData(event.currentTarget);
    const type = String(form.get("type"));
    const amount = Number(form.get("value"));
    setBusy("promotion"); setError("");
    const { error: promotionError } = await createClient().from("promotions").insert({
      seller_store_id: store.id, code: String(form.get("code")).trim().toUpperCase(), name: String(form.get("name")).trim(),
      description: String(form.get("description") ?? "").trim() || null, discount_type: type,
      discount_value: type === "percentage" ? Math.round(amount) : Math.round(amount * 100),
      minimum_order_cents: Math.round(Number(form.get("minimum") ?? 0) * 100), usage_limit: form.get("limit") ? Number(form.get("limit")) : null,
      starts_at: form.get("startsAt") || null, ends_at: form.get("endsAt") || null, is_active: true,
    });
    setBusy("");
    if (promotionError) setError(promotionError.message); else { setNotice("Promotion created."); event.currentTarget.reset(); await load(); }
  }

  if (loading) return <Panel><p className="py-12 text-center text-sm text-[#817679]">Loading seller data…</p></Panel>;
  if (!store) return <Panel><p className="text-sm text-rose-700">{error || "Seller store not found."}</p></Panel>;

  return <div className="space-y-5">{error && <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}{notice && <p role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</p>}{section === "customers" ? <Customers orders={orders} parentOrders={parentOrders} /> : section === "reviews" ? <Reviews reviews={reviews} replies={replies} products={productNames} busy={busy} onReply={saveReply} /> : section === "promotions" ? <Promotions promotions={promotions} busy={busy} onCreate={createPromotion} /> : section === "analytics" ? <Analytics orders={orders} /> : section === "store-profile" ? <StoreProfile store={store} busy={busy} onSave={saveProfile} onLogo={uploadLogo} /> : <Settings store={store} busy={busy} onSave={saveSettings} />}</div>;
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

function Promotions({ promotions, busy, onCreate }: { promotions: Promotion[]; busy: string; onCreate: (event: FormEvent<HTMLFormElement>) => void }) { return <div className="grid gap-5 xl:grid-cols-[1fr_420px]"><Panel><div className="flex items-center gap-3"><BadgePercent className="text-[#b35f5b]" /><h2 className="font-bold">Your promotions</h2></div><div className="mt-4 divide-y divide-[#eee5e1]">{promotions.map((promo) => <article key={promo.id} className="flex items-center justify-between gap-4 py-4"><div><p className="font-bold">{promo.code}</p><p className="text-xs text-[#817679]">{promo.name} · {promo.discount_type === "percentage" ? `${promo.discount_value}%` : `BZ$${(promo.discount_value / 100).toFixed(2)}`} · {promo.usage_count}{promo.usage_limit ? `/${promo.usage_limit}` : ""} uses</p></div><span className={`rounded-full px-3 py-1 text-xs font-bold ${promo.is_active ? "bg-emerald-50 text-emerald-700" : "bg-stone-100 text-stone-600"}`}>{promo.is_active ? "Active" : "Inactive"}</span></article>)}{!promotions.length && <Empty text="Create your first store promotion." />}</div></Panel><form onSubmit={onCreate}><Panel><h2 className="font-bold">Create promotion</h2><div className="mt-4 grid gap-3"><Input name="code" label="Code" placeholder="WELCOME15" required /><Input name="name" label="Name" placeholder="Welcome offer" required /><Input name="description" label="Description" placeholder="Optional customer-facing details" /><label className="text-sm font-semibold">Discount type<select name="type" className="mt-2 h-12 w-full rounded-xl border border-[#ddd3d0] px-3"><option value="percentage">Percentage</option><option value="fixed_amount">Fixed amount</option></select></label><Input name="value" label="Discount value" placeholder="15" type="number" required /><Input name="minimum" label="Minimum order (BZD)" placeholder="0" type="number" /><Input name="limit" label="Usage limit" placeholder="Optional" type="number" /><Input name="startsAt" label="Starts" placeholder="" type="datetime-local" /><Input name="endsAt" label="Ends" placeholder="" type="datetime-local" /></div><button disabled={busy === "promotion"} className="mt-4 w-full rounded-xl bg-[#bf6d68] py-3 font-bold text-white disabled:opacity-50">{busy === "promotion" ? "Creating…" : "Create promotion"}</button></Panel></form></div>; }

function Analytics({ orders }: { orders: SellerOrder[] }) { const gross = orders.reduce((sum, order) => sum + order.item_subtotal_cents, 0); const fees = orders.reduce((sum, order) => sum + order.platform_fee_cents, 0); const net = orders.reduce((sum, order) => sum + order.seller_net_cents, 0); const byDay = new Map<string, number>(); for (const order of orders) { const day = order.created_at.slice(0, 10); byDay.set(day, (byDay.get(day) ?? 0) + order.seller_net_cents); } const values = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-14); const max = Math.max(...values.map(([, value]) => value), 1); return <div className="space-y-5"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Mini label="Seller orders" value={orders.length.toString()} /><Mini label="Gross sales" value={`BZ$${(gross / 100).toFixed(2)}`} /><Mini label="Platform fees" value={`BZ$${(fees / 100).toFixed(2)}`} /><Mini label="Net earnings" value={`BZ$${(net / 100).toFixed(2)}`} /></div><Panel><div className="flex items-center gap-3"><BarChart3 className="text-[#b35f5b]" /><div><h2 className="font-bold">Net earnings trend</h2><p className="text-sm text-[#756a6d]">Last 14 selling days</p></div></div><div className="mt-7 flex h-64 items-end gap-2 border-b border-[#eee5e1]">{values.map(([day, value]) => <div key={day} className="group flex h-full min-w-0 flex-1 items-end"><div title={`${day}: BZ$${(value / 100).toFixed(2)}`} className="w-full rounded-t-lg bg-[#c87870]" style={{ height: `${Math.max(4, value / max * 100)}%` }} /></div>)}{!values.length && <p className="m-auto text-sm text-[#817679]">Sales activity will appear here.</p>}</div></Panel></div>; }

function StoreProfile({ store, busy, onSave, onLogo }: { store: StoreRow; busy: string; onSave: (event: FormEvent<HTMLFormElement>) => void; onLogo: (file: File) => void }) { return <form onSubmit={onSave} className="grid gap-5 xl:grid-cols-[280px_1fr]"><Panel><div className="relative mx-auto grid h-28 w-28 overflow-hidden place-items-center rounded-full bg-[#ead1cb] text-[#a95c59]">{store.logo_url ? <Image src={store.logo_url} alt={`${store.name} logo`} fill sizes="112px" className="object-cover" unoptimized /> : <Store size={44} />}</div><label className="mx-auto mt-4 flex w-fit cursor-pointer items-center gap-2 rounded-xl border border-[#d9c2bd] px-4 py-2.5 text-xs font-bold text-[#9b5a57]"><ImagePlus size={16} />{busy === "logo" ? "Uploading…" : "Upload logo"}<input type="file" accept="image/jpeg,image/png,image/webp,image/avif" disabled={busy === "logo"} onChange={(event) => { const file = event.target.files?.[0]; if (file) void onLogo(file); }} className="sr-only" /></label><p className="mt-4 text-center text-xs text-[#817679]">Your store identity appears throughout the marketplace.</p></Panel><Panel><h2 className="text-lg font-bold">Public store details</h2><div className="mt-5 grid gap-4 sm:grid-cols-2"><Input name="name" label="Store name" placeholder="Store name" defaultValue={store.name} required /><Input name="email" label="Contact email" placeholder="hello@example.com" type="email" defaultValue={store.support_email ?? ""} /><Input name="phone" label="Contact phone" placeholder="+501" defaultValue={store.support_phone ?? ""} /><Input name="location" label="Location" placeholder="Belize City, Belize" defaultValue={store.location ?? ""} /><label className="text-sm font-semibold sm:col-span-2">Short description<textarea name="description" rows={3} defaultValue={store.description ?? ""} className="mt-2 w-full rounded-xl border border-[#ddd3d0] bg-[#fcfaf9] p-4 font-normal" /></label><label className="text-sm font-semibold sm:col-span-2">Brand story<textarea name="story" rows={6} defaultValue={store.brand_story ?? ""} className="mt-2 w-full rounded-xl border border-[#ddd3d0] bg-[#fcfaf9] p-4 font-normal" /></label><input type="hidden" name="prepMin" value={store.preparation_days_min} /><input type="hidden" name="prepMax" value={store.preparation_days_max} /><input type="hidden" name="returnDays" value={store.return_window_days} /></div><button disabled={busy === "profile"} className="mt-5 rounded-xl bg-[#bf6d68] px-6 py-3 font-bold text-white disabled:opacity-50">{busy === "profile" ? "Saving…" : "Save profile"}</button></Panel></form>; }

function Settings({ store, busy, onSave }: { store: StoreRow; busy: string; onSave: (event: FormEvent<HTMLFormElement>) => void }) { const preferences = store.notification_preferences ?? {}; return <form onSubmit={onSave} className="grid gap-5 xl:grid-cols-2"><Panel><h2 className="text-lg font-bold">Notifications</h2><Toggle name="newOrders" label="New order alerts" detail="Receive dashboard alerts whenever a customer orders." checked={preferences.new_orders ?? true} /><Toggle name="lowStock" label="Low-stock alerts" detail="Know when inventory reaches its reorder point." checked={preferences.low_stock ?? true} /><Toggle name="reviews" label="Review alerts" detail="Know when a customer leaves feedback." checked={preferences.reviews ?? true} /></Panel><Panel><h2 className="text-lg font-bold">Fulfillment</h2><div className="mt-5 grid grid-cols-2 gap-4"><Input name="prepMin" label="Minimum preparation days" placeholder="1" type="number" defaultValue={String(store.preparation_days_min)} required /><Input name="prepMax" label="Maximum preparation days" placeholder="2" type="number" defaultValue={String(store.preparation_days_max)} required /><Input name="returnDays" label="Return window (days)" placeholder="14" type="number" defaultValue={String(store.return_window_days)} required /></div><button disabled={busy === "settings"} className="mt-5 rounded-xl bg-[#bf6d68] px-6 py-3 font-bold text-white disabled:opacity-50">{busy === "settings" ? "Saving…" : "Save settings"}</button><div className="mt-7 border-t border-[#eee5e1] pt-5"><h3 className="font-bold">Account security</h3><Link href="/auth/update-password" className="mt-3 inline-block rounded-xl border border-[#d9c2bd] px-4 py-2.5 text-sm font-bold text-[#9b5a57]">Change password</Link></div></Panel></form>; }

function Panel({ children }: { children: React.ReactNode }) { return <section className="rounded-2xl border border-[#ede3df] bg-white p-5 shadow-sm">{children}</section>; }
function Empty({ text }: { text: string }) { return <p className="rounded-xl bg-[#faf6f4] p-5 text-sm text-[#756a6d]">{text}</p>; }
function Mini({ label, value }: { label: string; value: string }) { return <Panel><p className="text-xs text-[#756a6d]">{label}</p><p className="mt-1 font-serif text-2xl font-bold">{value}</p></Panel>; }
function Input({ name, label, placeholder, type = "text", defaultValue, required = false }: { name: string; label: string; placeholder: string; type?: string; defaultValue?: string; required?: boolean }) { return <label className="text-sm font-semibold">{label}<input name={name} type={type} defaultValue={defaultValue} placeholder={placeholder} required={required} min={type === "number" ? 0 : undefined} className="mt-2 h-12 w-full rounded-xl border border-[#ddd3d0] bg-[#fcfaf9] px-4 font-normal outline-none focus:border-[#bf6d68]" /></label>; }
function Toggle({ name, label, detail, checked }: { name: string; label: string; detail: string; checked: boolean }) { return <label className="mt-3 flex items-center gap-4 border-b border-[#eee5e1] py-4"><span className="flex-1"><strong className="block text-sm">{label}</strong><span className="mt-1 block text-xs text-[#817679]">{detail}</span></span><input name={name} type="checkbox" defaultChecked={checked} className="h-5 w-5 accent-[#bf6d68]" /></label>; }

