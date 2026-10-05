"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { createSellerProduct } from "@/app/dashboard/products/actions";

type SellerProduct = {
  id: string;
  name: string;
  base_price_cents: number;
  status: string;
  review_status: string;
  rejection_reason: string | null;
  created_at: string;
  imagePath?: string;
};

type Category = { slug: string; name: string };

export default function SellerProductManager({ mode }: { mode: "list" | "create" }) {
  const [products, setProducts] = useState<SellerProduct[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const loadProducts = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError("Sign in again to manage your products.");
      setLoading(false);
      return;
    }

    const [{ data: store }, { data: categoryRows, error: categoryError }] = await Promise.all([
      supabase.from("seller_stores").select("id").eq("owner_id", user.id).maybeSingle(),
      supabase.from("categories").select("slug, name").eq("is_active", true).order("sort_order"),
    ]);
    if (categoryError) setError(categoryError.message);
    setCategories(categoryRows ?? []);
    if (!store) {
      setProducts([]);
      setLoading(false);
      return;
    }

    const { data: rows, error: productError } = await supabase
      .from("products")
      .select("id, name, base_price_cents, status, review_status, rejection_reason, created_at")
      .eq("seller_store_id", store.id)
      .order("created_at", { ascending: false });
    if (productError) setError(productError.message);
    const productRows = (rows ?? []) as SellerProduct[];
    if (productRows.length) {
      const { data: images } = await supabase.from("product_images").select("product_id, storage_path").in("product_id", productRows.map((product) => product.id)).eq("is_primary", true);
      const imageByProduct = new Map((images ?? []).map((image) => [image.product_id, image.storage_path]));
      for (const product of productRows) product.imagePath = imageByProduct.get(product.id);
    }
    setProducts(productRows);
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadProducts(), 0);
    return () => window.clearTimeout(timer);
  }, [loadProducts]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    const result = await createSellerProduct(new FormData(event.currentTarget));
    setSaving(false);
    if (result.error) setError(result.error);
    else {
      setMessage(result.message ?? "Product saved.");
      event.currentTarget.reset();
      await loadProducts();
    }
  }

  if (mode === "create") return <form onSubmit={submit} className="grid gap-5 xl:grid-cols-[1.3fr_.7fr]">
    <section className="rounded-2xl border border-[#ede3df] bg-white p-5 shadow-sm"><h2 className="text-lg font-bold">Product details</h2><div className="mt-5 grid gap-4 sm:grid-cols-2">
      <label className="text-sm font-semibold sm:col-span-2">Product name<input name="name" required minLength={2} maxLength={160} placeholder="e.g. Hibiscus Glow Oil" className="mt-2 h-12 w-full rounded-xl border border-[#ddd3d0] bg-[#fcfaf9] px-4 font-normal" /></label>
      <label className="text-sm font-semibold">Category<select name="category" required defaultValue="" className="mt-2 h-12 w-full rounded-xl border border-[#ddd3d0] bg-[#fcfaf9] px-4 font-normal"><option value="" disabled>Select a category</option>{categories.map((category) => <option key={category.slug} value={category.slug}>{category.name}</option>)}</select></label>
      <label className="text-sm font-semibold">Price (BZD)<input name="price" type="number" min="0.01" step="0.01" required placeholder="0.00" className="mt-2 h-12 w-full rounded-xl border border-[#ddd3d0] bg-[#fcfaf9] px-4 font-normal" /></label>
      <label className="text-sm font-semibold">Available quantity<input name="quantity" type="number" min="0" max="100000" step="1" required defaultValue="0" className="mt-2 h-12 w-full rounded-xl border border-[#ddd3d0] bg-[#fcfaf9] px-4 font-normal" /></label>
      <label className="text-sm font-semibold sm:col-span-2">Description<textarea name="description" maxLength={5000} rows={6} placeholder="Tell customers what makes this product special..." className="mt-2 w-full rounded-xl border border-[#ddd3d0] bg-[#fcfaf9] p-4 font-normal" /></label>
    </div></section>
    <div className="space-y-5">
      <section className="rounded-2xl border border-[#ede3df] bg-white p-5 shadow-sm"><h2 className="text-lg font-bold">Product image</h2><input name="image" type="file" accept="image/jpeg,image/png,image/webp,image/avif" className="mt-4 block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-[#fbf3f1] file:px-4 file:py-3 file:font-semibold file:text-[#9b5a57]" /><p className="mt-2 text-xs text-[#817477]">Optional. JPEG, PNG, WebP, or AVIF up to 10 MB.</p></section>
      <section className="rounded-2xl border border-[#ede3df] bg-white p-5 shadow-sm"><label className="flex items-center gap-3 text-sm font-semibold"><input name="submitForReview" type="checkbox" defaultChecked className="h-5 w-5 accent-[#bf6d68]" />Submit for marketplace review</label><p className="mt-2 text-xs leading-5 text-[#817477]">Submitted listings are reviewed before shoppers can see them. Unchecked saves a draft.</p>
        {error && <p role="alert" className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}{message && <p role="status" className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{message}</p>}
        <button disabled={saving} className="mt-5 w-full rounded-xl bg-[#bf6d68] py-3 font-bold text-white disabled:opacity-50">{saving ? "Saving…" : "Save product"}</button><Link href="/dashboard/products" className="mt-3 block text-center text-sm font-semibold text-[#9b5a57]">Back to products</Link>
      </section>
    </div>
  </form>;

  return <section className="rounded-2xl border border-[#ede3df] bg-white p-5 shadow-sm">
    <div className="flex items-center justify-between gap-4"><div><h2 className="text-lg font-bold">Your products</h2><p className="mt-1 text-sm text-[#7b7072]">Listings are published after marketplace review.</p></div><Link href="/dashboard/add-product" className="rounded-xl bg-[#bf6d68] px-4 py-2.5 text-sm font-bold text-white">Add product</Link></div>
    {error && <p role="alert" className="mt-5 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
    {loading ? <p className="py-12 text-center text-sm text-[#817679]">Loading products…</p> : products.length === 0 ? <p className="mt-5 rounded-2xl bg-[#fbf4f2] p-8 text-center text-sm text-[#756a6d]">No products yet. Add a product to start your seller catalog.</p> : <div className="mt-5 divide-y divide-[#eee5e1]">{products.map((product) => {
      const { data } = product.imagePath ? createClient().storage.from("product-images").getPublicUrl(product.imagePath) : { data: { publicUrl: "" } };
      const status = product.review_status === "submitted" ? "In review" : product.review_status === "approved" ? "Approved" : product.rejection_reason ? "Changes requested" : "Draft";
      return <article key={product.id} className="flex items-center gap-4 py-4"><div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-[#fff0f4]">{data.publicUrl ? <Image src={data.publicUrl} alt="" fill sizes="64px" unoptimized className="object-cover" /> : <Image src="/images/belglow-hero-products.png" alt="" fill sizes="64px" className="scale-150 object-cover" />}</div><div className="min-w-0 flex-1"><h3 className="truncate font-semibold">{product.name}</h3><p className="mt-1 text-xs text-[#817679]">BZ${(product.base_price_cents / 100).toFixed(2)} · {new Date(product.created_at).toLocaleDateString()}</p>{product.rejection_reason && <p className="mt-1 text-xs text-rose-700">{product.rejection_reason}</p>}</div><span className="rounded-full bg-[#fff3ef] px-3 py-1 text-xs font-semibold text-[#9b5a57]">{status}</span></article>;
    })}</div>}
  </section>;
}
