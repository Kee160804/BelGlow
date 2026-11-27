"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronUp, CirclePlus, Edit3, ImagePlus, Package, Save, X } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { createSellerProduct, updateSellerProduct } from "@/app/dashboard/products/actions";
import { categoryChildren, rootCategories } from "@/lib/marketplace-categories";
import { isExternalProductImage } from "@/lib/product-image-url";

type ProductVariant = { id?: string; name: string; price: string; quantity: number };
type SellerProduct = {
  id: string;
  name: string;
  short_description: string | null;
  description: string | null;
  ingredients: string | null;
  usage_instructions: string | null;
  attributes: Record<string, unknown>;
  compare_at_price_cents: number | null;
  base_price_cents: number;
  status: string;
  review_status: string;
  rejection_reason: string | null;
  created_at: string;
  categorySlug: string;
  imagePath?: string;
  variants: ProductVariant[];
};
type Category = { id: string; parent_id: string | null; slug: string; name: string; description: string | null; image_url: string | null; sort_order: number; is_active: boolean };

export default function SellerProductManager({ mode }: { mode: "list" | "create" }) {
  const [products, setProducts] = useState<SellerProduct[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formVersion, setFormVersion] = useState(0);

  const notify = useCallback((tone: "success" | "error", message: string) => setToast({ tone, message }), []);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 6000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const loadProducts = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { notify("error", "Sign in again to manage your products."); setLoading(false); return; }
    const [{ data: store }, { data: categoryRows, error: categoryError }] = await Promise.all([
      supabase.from("seller_stores").select("id").eq("owner_id", user.id).maybeSingle(),
      supabase.from("categories").select("id, parent_id, slug, name, description, image_url, sort_order, is_active").eq("is_active", true).order("sort_order").order("name"),
    ]);
    if (categoryError) notify("error", `Could not load product categories: ${categoryError.message}`);
    const availableCategories = (categoryRows ?? []) as Category[];
    setCategories(availableCategories);
    if (!store) { setProducts([]); setLoading(false); return; }

    const { data: rows, error: productError } = await supabase.from("products")
      .select("id, name, short_description, description, ingredients, usage_instructions, attributes, compare_at_price_cents, base_price_cents, status, review_status, rejection_reason, created_at")
      .eq("seller_store_id", store.id).order("created_at", { ascending: false });
    if (productError) { notify("error", `Could not load your products: ${productError.message}`); setLoading(false); return; }
    const productRows = rows ?? [];
    const ids = productRows.map((product) => product.id);
    if (!ids.length) { setProducts([]); setLoading(false); return; }

    const [imagesResult, variantsResult, categoryLinksResult] = await Promise.all([
      supabase.from("product_images").select("product_id, storage_path, is_primary, sort_order").in("product_id", ids).order("sort_order"),
      supabase.from("product_variants").select("id, product_id, name, price_cents, sort_order").in("product_id", ids).eq("is_active", true).order("sort_order"),
      supabase.from("product_categories").select("product_id, category_id").in("product_id", ids).eq("is_primary", true),
    ]);
    const variantIds = (variantsResult.data ?? []).map((variant) => variant.id);
    const { data: inventoryRows } = variantIds.length
      ? await supabase.from("inventory_levels").select("variant_id, quantity_on_hand").in("variant_id", variantIds)
      : { data: [] };
    const stockByVariant = new Map<string, number>();
    for (const row of inventoryRows ?? []) stockByVariant.set(row.variant_id, (stockByVariant.get(row.variant_id) ?? 0) + row.quantity_on_hand);
    const imageByProduct = new Map<string, string>();
    for (const image of [...(imagesResult.data ?? [])].sort((a, b) => Number(b.is_primary) - Number(a.is_primary))) if (!imageByProduct.has(image.product_id)) imageByProduct.set(image.product_id, image.storage_path);
    const variantsByProduct = new Map<string, ProductVariant[]>();
    for (const variant of variantsResult.data ?? []) variantsByProduct.set(variant.product_id, [...(variantsByProduct.get(variant.product_id) ?? []), { id: variant.id, name: variant.name, price: (Number(variant.price_cents ?? 0) / 100).toFixed(2), quantity: stockByVariant.get(variant.id) ?? 0 }]);
    const categoryIdByProduct = new Map((categoryLinksResult.data ?? []).map((link) => [link.product_id, link.category_id]));
    const slugByCategoryId = new Map(availableCategories.map((category) => [category.id, category.slug]));
    setProducts(productRows.map((product) => ({
      ...product,
      attributes: product.attributes && typeof product.attributes === "object" ? product.attributes as Record<string, unknown> : {},
      categorySlug: slugByCategoryId.get(categoryIdByProduct.get(product.id) ?? "") ?? "",
      imagePath: imageByProduct.get(product.id),
      variants: variantsByProduct.get(product.id) ?? [{ name: "Default", price: (product.base_price_cents / 100).toFixed(2), quantity: 0 }],
    })));
    setLoading(false);
  }, [notify]);

  useEffect(() => { const timer = window.setTimeout(() => void loadProducts(), 0); return () => window.clearTimeout(timer); }, [loadProducts]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel("seller-product-review-feed")
      .on("postgres_changes", { event: "*", schema: "public", table: "products" }, () => void loadProducts())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [loadProducts]);

  async function submit(event: FormEvent<HTMLFormElement>, product?: SellerProduct) {
    event.preventDefault();
    setSaving(true); setToast(null);
    try {
      const result = product ? await updateSellerProduct(new FormData(event.currentTarget)) : await createSellerProduct(new FormData(event.currentTarget));
      if (result.error) { notify("error", result.error); return; }
      notify("success", result.message ?? "Product saved.");
      setEditingId(null);
      setFormVersion((current) => current + 1);
      await loadProducts();
    } catch (cause) {
      notify("error", cause instanceof Error ? cause.message : "The product could not be saved. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (mode === "create" && loading) return <><Toast toast={toast} dismiss={() => setToast(null)} /><p className="rounded-2xl border border-[#ede3df] bg-white py-12 text-center text-sm text-[#817679]">Loading store categories…</p></>;

  if (mode === "create") return <>
    <Toast toast={toast} dismiss={() => setToast(null)} />
    <ProductEditor key={formVersion} categories={categories} saving={saving} onSubmit={(event) => void submit(event)} />
  </>;

  return <>
  <Toast toast={toast} dismiss={() => setToast(null)} />
  <section className="rounded-2xl border border-[#ede3df] bg-white p-5 shadow-sm">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><h2 className="text-lg font-bold">Your product listings</h2><p className="mt-1 text-sm text-[#7b7072]">Edit prices, stock, sizes, photos, and storefront information from one list.</p></div><Link href="/dashboard/add-product" className="rounded-xl bg-[#bf6d68] px-4 py-2.5 text-center text-sm font-bold text-white">Add a different product</Link></div>
    {loading ? <p className="py-12 text-center text-sm text-[#817679]">Loading products…</p> : products.length === 0 ? <p className="mt-5 rounded-2xl bg-[#fbf4f2] p-8 text-center text-sm text-[#756a6d]">No products yet. Add your first product to start your seller catalog.</p> : <div className="mt-5 space-y-3">{products.map((product) => {
      const imageUrl = product.imagePath
        ? isExternalProductImage(product.imagePath) ? product.imagePath : createClient().storage.from("product-images").getPublicUrl(product.imagePath).data.publicUrl
        : "";
      const status = product.review_status === "submitted" ? "In review" : product.review_status === "approved" ? "Live" : product.rejection_reason ? "Changes requested" : "Draft";
      const stock = product.variants.reduce((total, variant) => total + variant.quantity, 0);
      const editing = editingId === product.id;
      return <article key={product.id} className="overflow-hidden rounded-2xl border border-[#eee5e1]">
        <div className="grid gap-4 p-4 sm:grid-cols-[72px_1fr_auto] sm:items-center"><div className="relative h-18 w-18 overflow-hidden rounded-xl bg-[#fff0f4]">{imageUrl ? <Image src={imageUrl} alt="" fill sizes="72px" unoptimized className="object-cover" /> : <Image src="/images/belglow-hero-products.png" alt="" fill sizes="72px" className="scale-150 object-cover" />}</div><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate font-bold">{product.name}</h3><span className="rounded-full bg-[#fff3ef] px-2.5 py-1 text-xs font-semibold text-[#9b5a57]">{status}</span></div><p className="mt-1 text-sm text-[#6f6568]">From BZ${(product.base_price_cents / 100).toFixed(2)} · <strong className={stock <= 5 ? "text-orange-700" : "text-emerald-700"}>{stock} in stock</strong> · {product.variants.length} {product.variants.length === 1 ? "option" : "options"}</p>{product.rejection_reason && <p className="mt-1 text-xs text-rose-700">Admin note: {product.rejection_reason}</p>}</div><button disabled={product.review_status === "submitted"} onClick={() => setEditingId(editing ? null : product.id)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#d9c2bd] px-4 py-2.5 text-sm font-bold text-[#9b5a57] disabled:cursor-not-allowed disabled:opacity-45">{editing ? <ChevronUp size={17} /> : <Edit3 size={17} />}{editing ? "Close editor" : product.review_status === "submitted" ? "Under review" : "Edit product"}</button></div>
        {editing && <div className="border-t border-[#eee5e1] bg-[#fcfaf9] p-4 sm:p-6"><ProductEditor categories={categories} product={product} saving={saving} onSubmit={(event) => void submit(event, product)} onCancel={() => setEditingId(null)} /></div>}
      </article>;
    })}</div>}
  </section>
  </>;
}

function Toast({ toast, dismiss }: { toast: { tone: "success" | "error"; message: string } | null; dismiss: () => void }) {
  if (!toast) return null;
  const success = toast.tone === "success";
  return <div className="pointer-events-none fixed inset-x-4 top-4 z-[100] flex justify-center sm:justify-end" aria-live={success ? "polite" : "assertive"}>
    <div role={success ? "status" : "alert"} className={`pointer-events-auto flex max-w-lg items-start gap-3 rounded-2xl border px-4 py-3 text-sm shadow-xl ${success ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-rose-200 bg-rose-50 text-rose-900"}`}>
      <span className="flex-1">{toast.message}</span>
      <button type="button" onClick={dismiss} aria-label="Dismiss notification" className="rounded-md px-1 font-bold opacity-70 hover:opacity-100">×</button>
    </div>
  </div>;
}

function ProductEditor({ categories, product, saving, onSubmit, onCancel }: { categories: Category[]; product?: SellerProduct; saving: boolean; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onCancel?: () => void }) {
  const [variants, setVariants] = useState<ProductVariant[]>(product?.variants ?? [{ name: "Default", price: "", quantity: 0 }]);
  const [storefrontOpen, setStorefrontOpen] = useState(false);
  const [storefrontError, setStorefrontError] = useState("");
  const assignedCategory = categories.find((category) => category.slug === product?.categorySlug);
  const assignedMainCategory = assignedCategory?.parent_id ? categories.find((category) => category.id === assignedCategory.parent_id) : assignedCategory;
  const [selectedMainCategory, setSelectedMainCategory] = useState(assignedMainCategory?.slug ?? "");
  const [selectedSubcategory, setSelectedSubcategory] = useState(assignedCategory?.parent_id ? assignedCategory.slug : "");
  const [imageUrls, setImageUrls] = useState("");
  const mainCategories = rootCategories(categories);
  const selectedMain = mainCategories.find((category) => category.slug === selectedMainCategory);
  const subcategories = selectedMain ? categoryChildren(categories, selectedMain.id) : [];
  const attributes = product?.attributes ?? {};
  const updateVariant = (index: number, changes: Partial<ProductVariant>) => setVariants((current) => current.map((variant, itemIndex) => itemIndex === index ? { ...variant, ...changes } : variant));
  useEffect(() => {
    if (!storefrontOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setStorefrontOpen(false); };
    window.addEventListener("keydown", closeOnEscape);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", closeOnEscape); };
  }, [storefrontOpen]);
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const form = event.currentTarget;
    const name = (new FormData(form).get("name") ?? "").toString().trim();
    if (name.length < 2 || !selectedMainCategory) {
      event.preventDefault();
      setStorefrontError(name.length < 2 ? "Enter a product name with at least 2 characters." : "Choose a store category before saving.");
      setStorefrontOpen(true);
      window.requestAnimationFrame(() => document.getElementById(name.length < 2 ? "product-name" : "store-category")?.focus());
      return;
    }
    setStorefrontError("");
    onSubmit(event);
  }
  const mainCategoryName = mainCategories.find((category) => category.slug === selectedMainCategory)?.name;
  const subcategoryName = subcategories.find((category) => category.slug === selectedSubcategory)?.name;
  return <form onSubmit={handleSubmit} className="grid gap-5 xl:grid-cols-[1.25fr_.75fr]">
    {product && <input type="hidden" name="productId" value={product.id} />}
    <input type="hidden" name="variants" value={JSON.stringify(variants)} />
    <input type="hidden" name="category" value={selectedSubcategory || selectedMainCategory} />
    <div className="space-y-5">
      <section className="rounded-2xl border border-[#ede3df] bg-white p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><Package size={19} className="text-[#b65f5b]" /><h2 className="text-lg font-bold">Storefront information</h2></div><button type="button" onClick={() => { setStorefrontError(""); setStorefrontOpen(true); }} className="inline-flex items-center gap-2 rounded-xl border border-[#d9c2bd] px-3 py-2 text-sm font-bold text-[#9b5a57]"><Edit3 size={16} /> Edit information</button></div><p className="mt-3 text-sm text-[#817477]">{product?.name || "New product"} · {mainCategoryName ?? "Choose a category"}{subcategoryName ? ` / ${subcategoryName}` : ""}</p><p className="mt-1 line-clamp-2 text-sm text-[#6f6568]">{product?.short_description || "Add a short description and product details."}</p></section>

      <div hidden={!storefrontOpen} className="fixed inset-0 z-[120] flex items-center justify-center bg-black/45 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setStorefrontOpen(false); }}>
        <section role="dialog" aria-modal="true" aria-labelledby="product-storefront-dialog-title" className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-[#ede3df] bg-white p-5 shadow-2xl sm:p-7">
          <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#b65f5b]">Product listing</p><h2 id="product-storefront-dialog-title" className="mt-1 text-xl font-bold">Storefront information</h2><p className="mt-1 text-sm text-[#817477]">Set the details shoppers see on your product page.</p></div><button type="button" onClick={() => setStorefrontOpen(false)} aria-label="Close storefront information" className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[#eee5e1] text-[#756a6d]"><X size={19} /></button></div>
          {storefrontError && <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{storefrontError}</p>}
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field id="product-name" label="Product name" name="name" defaultValue={product?.name} placeholder="e.g. Hibiscus Glow Oil" wide onInput={() => setStorefrontError("")} />
            <label className="text-sm font-semibold">Store category<select id="store-category" value={selectedMainCategory} onChange={(event) => { setSelectedMainCategory(event.target.value); setSelectedSubcategory(""); setStorefrontError(""); }} className={inputClass}><option value="" disabled>Select a category</option>{mainCategories.map((category) => <option key={category.slug} value={category.slug}>{category.name}</option>)}</select><span className="mt-1 block text-xs font-normal text-[#817477]">Select the main public-store category.</span></label>
            <label className="text-sm font-semibold">Subcategory<select value={selectedSubcategory} onChange={(event) => setSelectedSubcategory(event.target.value)} disabled={!selectedMainCategory || subcategories.length === 0} className={`${inputClass} disabled:cursor-not-allowed disabled:bg-[#f3efed] disabled:text-[#978b8e]`}><option value="">{!selectedMainCategory ? "Select a category first" : subcategories.length === 0 ? "No subcategories available" : "Select a subcategory"}</option>{subcategories.map((subcategory) => <option key={subcategory.slug} value={subcategory.slug}>{subcategory.name}</option>)}</select><span className="mt-1 block text-xs font-normal text-[#817477]">Only subcategories from the selected category appear here.</span></label>
            <Field label="Product subtitle" name="subtitle" defaultValue={String(attributes.subtitle ?? "")} placeholder="e.g. With niacinamide for radiant glow" />
            <Field label="Original/compare price (BZD)" name="comparePrice" type="number" step="0.01" min="0.01" defaultValue={product?.compare_at_price_cents ? (product.compare_at_price_cents / 100).toFixed(2) : ""} placeholder="Optional sale comparison" />
            <label className="text-sm font-semibold sm:col-span-2">Short description<textarea name="shortDescription" maxLength={240} rows={2} defaultValue={product?.short_description ?? ""} placeholder="A short summary shown near the product title" className={textareaClass} /></label>
            <details className="sm:col-span-2 rounded-xl border border-[#eee5e1] bg-[#fcfaf9] p-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-bold"><span>More product details <span className="font-normal text-[#817477]">(optional)</span></span><ChevronDown size={17} className="shrink-0 text-[#a85855] transition-transform" /></summary>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-semibold sm:col-span-2">Full product details<textarea name="description" maxLength={5000} rows={3} defaultValue={product?.description ?? ""} placeholder="Tell shoppers what makes this product special" className={textareaClass} /></label>
                <label className="text-sm font-semibold">Ingredients<textarea name="ingredients" maxLength={5000} rows={3} defaultValue={product?.ingredients ?? ""} placeholder="List ingredients and allergy guidance" className={textareaClass} /></label>
                <label className="text-sm font-semibold">How to use<textarea name="usage" maxLength={5000} rows={3} defaultValue={product?.usage_instructions ?? ""} placeholder="Application and usage instructions" className={textareaClass} /></label>
                <label className="text-sm font-semibold sm:col-span-2">Shipping information<textarea name="shippingInfo" maxLength={500} rows={2} defaultValue={String(attributes.shipping_info ?? "")} placeholder="Preparation time, shipping notes, or handling details" className={textareaClass} /></label>
              </div>
            </details>
          </div>
          <div className="mt-5 flex justify-end"><button type="button" onClick={() => setStorefrontOpen(false)} className="rounded-xl bg-[#bf6d68] px-5 py-2.5 text-sm font-bold text-white">Done</button></div>
        </section>
      </div>

      <section className="rounded-2xl border border-[#ede3df] bg-white p-5"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><h2 className="text-lg font-bold">Sizes, prices, and stock</h2><p className="mt-1 text-xs text-[#817477]">Use “Default” for products without sizes. Add options for UK sizes, volumes, colors, or packs.</p></div><button type="button" onClick={() => setVariants((current) => [...current, { name: "", price: current[0]?.price ?? "", quantity: 0 }])} className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#d9c2bd] px-4 py-2 text-sm font-bold text-[#9b5a57]"><CirclePlus size={17} /> Add option</button></div>
        <div className="mt-4 space-y-3">{variants.map((variant, index) => <div key={variant.id ?? `new-${index}`} className="grid gap-3 rounded-xl bg-[#fbf6f4] p-3 sm:grid-cols-[1.2fr_1fr_1fr_auto] sm:items-end"><Field label={index === 0 ? "Size or option" : "Option"} name={`variant-name-${index}`} value={variant.name} onChange={(value) => updateVariant(index, { name: value })} placeholder="e.g. UK 8, 30 mL" /><Field label="Price (BZD)" name={`variant-price-${index}`} type="number" min="0.01" step="0.01" value={variant.price} onChange={(value) => updateVariant(index, { price: value })} required /><Field label="Stock amount" name={`variant-stock-${index}`} type="number" min="0" max="100000" step="1" value={String(variant.quantity)} onChange={(value) => updateVariant(index, { quantity: Number(value) })} required /><button type="button" disabled={variants.length === 1} onClick={() => setVariants((current) => current.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Remove option ${index + 1}`} className="mb-0.5 grid h-12 w-12 place-items-center rounded-xl border border-[#e4d6d2] text-rose-600 disabled:opacity-30"><X size={18} /></button></div>)}</div>
      </section>
    </div>

    <div className="space-y-5">
      <details className="group rounded-2xl border border-[#ede3df] bg-white p-5"><summary className="flex cursor-pointer list-none items-center justify-between gap-3"><ImagePlus size={19} className="text-[#b65f5b]" /><h2 className="text-lg font-bold">Product gallery</h2><ChevronDown size={17} className="shrink-0 text-[#a85855] transition-transform group-open:rotate-180" /></summary><div className="pt-4"><label className="mt-4 block text-sm font-semibold">Upload image files<input name="images" type="file" multiple accept="image/jpeg,image/png,image/webp,image/avif" className="mt-2 block w-full font-normal text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-[#fbf3f1] file:px-4 file:py-3 file:font-semibold file:text-[#9b5a57]" /></label><p className="mt-2 text-xs leading-5 text-[#817477]">JPEG, PNG, WebP, or AVIF; up to 10 MB each.</p><label className="mt-5 block text-sm font-semibold">Or add image URLs<textarea name="imageUrls" rows={3} value={imageUrls} onChange={(event) => setImageUrls(event.target.value)} placeholder={'https://example.com/product-image.jpg\nhttps://example.com/another-image.jpg'} className={textareaClass} /><span className="mt-1 block text-xs font-normal leading-5 text-[#817477]">Paste one HTTPS image link per line. You can combine URLs and uploads, up to 6 images total.</span></label>{imageUrls.split(/\r?\n/).map((url) => url.trim()).filter((url) => /^https:\/\//i.test(url)).slice(0, 6).length > 0 && <div className="mt-3 flex flex-wrap gap-2">{imageUrls.split(/\r?\n/).map((url) => url.trim()).filter((url) => /^https:\/\//i.test(url)).slice(0, 6).map((url, index) => <div key={`${url}-${index}`} className="relative h-14 w-14 overflow-hidden rounded-lg bg-[#fbf3f1]"><Image src={url} alt={`Product image URL preview ${index + 1}`} fill sizes="56px" unoptimized className="object-cover" /></div>)}</div>}{product && <label className="mt-4 flex items-start gap-3 rounded-xl bg-[#fff7f5] p-3 text-xs"><input name="replaceImages" type="checkbox" className="mt-0.5 h-4 w-4 accent-[#bf6d68]" /><span><strong className="block">Replace current gallery</strong>Leave unchecked to add the new images to the existing gallery.</span></label>}</div></details>
      {!product && <section className="rounded-2xl border border-[#ede3df] bg-white p-5"><label className="flex items-center gap-3 text-sm font-semibold"><input name="submitForReview" type="checkbox" defaultChecked className="h-5 w-5 accent-[#bf6d68]" />Submit for marketplace review</label><p className="mt-2 text-xs leading-5 text-[#817477]">Submitted listings are reviewed before shoppers can see them. Unchecked saves a draft.</p></section>}
      <section className="sticky bottom-3 z-10 rounded-2xl border border-[#ede3df] bg-white/95 p-4 shadow-lg backdrop-blur"><button disabled={saving} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#bf6d68] py-3 font-bold text-white disabled:opacity-50"><Save size={18} /> {saving ? "Saving…" : product ? "Save product changes" : "Save product"}</button>{onCancel ? <button type="button" onClick={onCancel} className="mt-3 w-full rounded-xl border border-[#d9c2bd] py-3 text-sm font-bold text-[#9b5a57]">Cancel editing</button> : <Link href="/dashboard/products" className="mt-3 block text-center text-sm font-semibold text-[#9b5a57]">Back to products</Link>}</section>
    </div>
  </form>;
}

const inputClass = "mt-2 h-12 w-full rounded-xl border border-[#ddd3d0] bg-[#fcfaf9] px-4 font-normal outline-none focus:border-[#bf6d68]";
const textareaClass = "mt-2 w-full rounded-xl border border-[#ddd3d0] bg-[#fcfaf9] p-4 font-normal outline-none focus:border-[#bf6d68]";

function Field({ label, name, wide = false, value, onChange, ...inputProps }: { label: string; name: string; wide?: boolean; value?: string; onChange?: (value: string) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "name" | "value" | "onChange">) {
  return <label className={`text-sm font-semibold ${wide ? "sm:col-span-2" : ""}`}>{label}<input name={name} value={value} onChange={onChange ? (event) => onChange(event.target.value) : undefined} className={inputClass} {...inputProps} /></label>;
}
