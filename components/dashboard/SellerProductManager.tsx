"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { ChevronUp, CirclePlus, Edit3, ImagePlus, Package, Save, X } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { createSellerProduct, updateSellerProduct } from "@/app/dashboard/products/actions";
import { categoryChildren, rootCategories } from "@/lib/marketplace-categories";

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
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formVersion, setFormVersion] = useState(0);

  const loadProducts = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError("Sign in again to manage your products."); setLoading(false); return; }
    const [{ data: store }, { data: categoryRows, error: categoryError }] = await Promise.all([
      supabase.from("seller_stores").select("id").eq("owner_id", user.id).maybeSingle(),
      supabase.from("categories").select("id, parent_id, slug, name, description, image_url, sort_order, is_active").eq("is_active", true).order("sort_order").order("name"),
    ]);
    if (categoryError) setError(categoryError.message);
    const availableCategories = (categoryRows ?? []) as Category[];
    setCategories(availableCategories);
    if (!store) { setProducts([]); setLoading(false); return; }

    const { data: rows, error: productError } = await supabase.from("products")
      .select("id, name, short_description, description, ingredients, usage_instructions, attributes, compare_at_price_cents, base_price_cents, status, review_status, rejection_reason, created_at")
      .eq("seller_store_id", store.id).order("created_at", { ascending: false });
    if (productError) { setError(productError.message); setLoading(false); return; }
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
  }, []);

  useEffect(() => { const timer = window.setTimeout(() => void loadProducts(), 0); return () => window.clearTimeout(timer); }, [loadProducts]);

  async function submit(event: FormEvent<HTMLFormElement>, product?: SellerProduct) {
    event.preventDefault();
    setSaving(true); setError(""); setMessage("");
    const result = product ? await updateSellerProduct(new FormData(event.currentTarget)) : await createSellerProduct(new FormData(event.currentTarget));
    setSaving(false);
    if (result.error) { setError(result.error); return; }
    setMessage(result.message ?? "Product saved.");
    setEditingId(null);
    setFormVersion((current) => current + 1);
    await loadProducts();
  }

  if (mode === "create" && loading) return <p className="rounded-2xl border border-[#ede3df] bg-white py-12 text-center text-sm text-[#817679]">Loading store categories…</p>;

  if (mode === "create") return <div>
    <ProductEditor key={formVersion} categories={categories} saving={saving} onSubmit={(event) => void submit(event)} />
    <Feedback error={error} message={message} />
  </div>;

  return <section className="rounded-2xl border border-[#ede3df] bg-white p-5 shadow-sm">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><h2 className="text-lg font-bold">Your product listings</h2><p className="mt-1 text-sm text-[#7b7072]">Edit prices, stock, sizes, photos, and storefront information from one list.</p></div><Link href="/dashboard/add-product" className="rounded-xl bg-[#bf6d68] px-4 py-2.5 text-center text-sm font-bold text-white">Add a different product</Link></div>
    <Feedback error={error} message={message} />
    {loading ? <p className="py-12 text-center text-sm text-[#817679]">Loading products…</p> : products.length === 0 ? <p className="mt-5 rounded-2xl bg-[#fbf4f2] p-8 text-center text-sm text-[#756a6d]">No products yet. Add your first product to start your seller catalog.</p> : <div className="mt-5 space-y-3">{products.map((product) => {
      const { data } = product.imagePath ? createClient().storage.from("product-images").getPublicUrl(product.imagePath) : { data: { publicUrl: "" } };
      const status = product.review_status === "submitted" ? "In review" : product.review_status === "approved" ? "Live" : product.rejection_reason ? "Changes requested" : "Draft";
      const stock = product.variants.reduce((total, variant) => total + variant.quantity, 0);
      const editing = editingId === product.id;
      return <article key={product.id} className="overflow-hidden rounded-2xl border border-[#eee5e1]">
        <div className="grid gap-4 p-4 sm:grid-cols-[72px_1fr_auto] sm:items-center"><div className="relative h-18 w-18 overflow-hidden rounded-xl bg-[#fff0f4]">{data.publicUrl ? <Image src={data.publicUrl} alt="" fill sizes="72px" unoptimized className="object-cover" /> : <Image src="/images/belglow-hero-products.png" alt="" fill sizes="72px" className="scale-150 object-cover" />}</div><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate font-bold">{product.name}</h3><span className="rounded-full bg-[#fff3ef] px-2.5 py-1 text-xs font-semibold text-[#9b5a57]">{status}</span></div><p className="mt-1 text-sm text-[#6f6568]">From BZ${(product.base_price_cents / 100).toFixed(2)} · <strong className={stock <= 5 ? "text-orange-700" : "text-emerald-700"}>{stock} in stock</strong> · {product.variants.length} {product.variants.length === 1 ? "option" : "options"}</p>{product.rejection_reason && <p className="mt-1 text-xs text-rose-700">Admin note: {product.rejection_reason}</p>}</div><button disabled={product.review_status === "submitted"} onClick={() => setEditingId(editing ? null : product.id)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#d9c2bd] px-4 py-2.5 text-sm font-bold text-[#9b5a57] disabled:cursor-not-allowed disabled:opacity-45">{editing ? <ChevronUp size={17} /> : <Edit3 size={17} />}{editing ? "Close editor" : product.review_status === "submitted" ? "Under review" : "Edit product"}</button></div>
        {editing && <div className="border-t border-[#eee5e1] bg-[#fcfaf9] p-4 sm:p-6"><ProductEditor categories={categories} product={product} saving={saving} onSubmit={(event) => void submit(event, product)} onCancel={() => setEditingId(null)} /></div>}
      </article>;
    })}</div>}
  </section>;
}

function ProductEditor({ categories, product, saving, onSubmit, onCancel }: { categories: Category[]; product?: SellerProduct; saving: boolean; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onCancel?: () => void }) {
  const [variants, setVariants] = useState<ProductVariant[]>(product?.variants ?? [{ name: "Default", price: "", quantity: 0 }]);
  const assignedCategory = categories.find((category) => category.slug === product?.categorySlug);
  const assignedMainCategory = assignedCategory?.parent_id ? categories.find((category) => category.id === assignedCategory.parent_id) : assignedCategory;
  const [selectedMainCategory, setSelectedMainCategory] = useState(assignedMainCategory?.slug ?? "");
  const [selectedSubcategory, setSelectedSubcategory] = useState(assignedCategory?.parent_id ? assignedCategory.slug : "");
  const mainCategories = rootCategories(categories);
  const selectedMain = mainCategories.find((category) => category.slug === selectedMainCategory);
  const subcategories = selectedMain ? categoryChildren(categories, selectedMain.id) : [];
  const attributes = product?.attributes ?? {};
  const updateVariant = (index: number, changes: Partial<ProductVariant>) => setVariants((current) => current.map((variant, itemIndex) => itemIndex === index ? { ...variant, ...changes } : variant));
  return <form onSubmit={onSubmit} className="grid gap-5 xl:grid-cols-[1.25fr_.75fr]">
    {product && <input type="hidden" name="productId" value={product.id} />}
    <input type="hidden" name="variants" value={JSON.stringify(variants)} />
    <input type="hidden" name="category" value={selectedSubcategory || selectedMainCategory} />
    <div className="space-y-5">
      <section className="rounded-2xl border border-[#ede3df] bg-white p-5"><div className="flex items-center gap-2"><Package size={19} className="text-[#b65f5b]" /><h2 className="text-lg font-bold">Storefront information</h2></div><div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field label="Product name" name="name" required defaultValue={product?.name} placeholder="e.g. Hibiscus Glow Oil" wide />
        <label className="text-sm font-semibold">Store category<select required value={selectedMainCategory} onChange={(event) => { setSelectedMainCategory(event.target.value); setSelectedSubcategory(""); }} className={inputClass}><option value="" disabled>Select a category</option>{mainCategories.map((category) => <option key={category.slug} value={category.slug}>{category.name}</option>)}</select><span className="mt-1 block text-xs font-normal text-[#817477]">Select the main public-store category.</span></label>
        <label className="text-sm font-semibold">Subcategory<select value={selectedSubcategory} onChange={(event) => setSelectedSubcategory(event.target.value)} disabled={!selectedMainCategory || subcategories.length === 0} className={`${inputClass} disabled:cursor-not-allowed disabled:bg-[#f3efed] disabled:text-[#978b8e]`}><option value="">{!selectedMainCategory ? "Select a category first" : subcategories.length === 0 ? "No subcategories available" : "Select a subcategory"}</option>{subcategories.map((subcategory) => <option key={subcategory.slug} value={subcategory.slug}>{subcategory.name}</option>)}</select><span className="mt-1 block text-xs font-normal text-[#817477]">Only subcategories from the selected category appear here.</span></label>
        <Field label="Product subtitle" name="subtitle" defaultValue={String(attributes.subtitle ?? "")} placeholder="e.g. With niacinamide for radiant glow" />
        <Field label="Original/compare price (BZD)" name="comparePrice" type="number" step="0.01" min="0.01" defaultValue={product?.compare_at_price_cents ? (product.compare_at_price_cents / 100).toFixed(2) : ""} placeholder="Optional sale comparison" />
        <label className="text-sm font-semibold sm:col-span-2">Short description<textarea name="shortDescription" maxLength={240} rows={2} defaultValue={product?.short_description ?? ""} placeholder="A short summary shown near the product title" className={textareaClass} /></label>
        <label className="text-sm font-semibold sm:col-span-2">Full product details<textarea name="description" maxLength={5000} rows={5} defaultValue={product?.description ?? ""} placeholder="Tell shoppers what makes this product special…" className={textareaClass} /></label>
        <label className="text-sm font-semibold">Ingredients<textarea name="ingredients" maxLength={5000} rows={4} defaultValue={product?.ingredients ?? ""} placeholder="List ingredients and allergy guidance" className={textareaClass} /></label>
        <label className="text-sm font-semibold">How to use<textarea name="usage" maxLength={5000} rows={4} defaultValue={product?.usage_instructions ?? ""} placeholder="Application and usage instructions" className={textareaClass} /></label>
        <label className="text-sm font-semibold sm:col-span-2">Shipping information<textarea name="shippingInfo" maxLength={500} rows={3} defaultValue={String(attributes.shipping_info ?? "")} placeholder="Preparation time, shipping notes, or handling details" className={textareaClass} /></label>
      </div></section>

      <section className="rounded-2xl border border-[#ede3df] bg-white p-5"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><h2 className="text-lg font-bold">Sizes, prices, and stock</h2><p className="mt-1 text-xs text-[#817477]">Use “Default” for products without sizes. Add options for UK sizes, volumes, colors, or packs.</p></div><button type="button" onClick={() => setVariants((current) => [...current, { name: "", price: current[0]?.price ?? "", quantity: 0 }])} className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#d9c2bd] px-4 py-2 text-sm font-bold text-[#9b5a57]"><CirclePlus size={17} /> Add option</button></div>
        <div className="mt-4 space-y-3">{variants.map((variant, index) => <div key={variant.id ?? `new-${index}`} className="grid gap-3 rounded-xl bg-[#fbf6f4] p-3 sm:grid-cols-[1.2fr_1fr_1fr_auto] sm:items-end"><Field label={index === 0 ? "Size or option" : "Option"} name={`variant-name-${index}`} value={variant.name} onChange={(value) => updateVariant(index, { name: value })} placeholder="e.g. UK 8, 30 mL" /><Field label="Price (BZD)" name={`variant-price-${index}`} type="number" min="0.01" step="0.01" value={variant.price} onChange={(value) => updateVariant(index, { price: value })} required /><Field label="Stock amount" name={`variant-stock-${index}`} type="number" min="0" max="100000" step="1" value={String(variant.quantity)} onChange={(value) => updateVariant(index, { quantity: Number(value) })} required /><button type="button" disabled={variants.length === 1} onClick={() => setVariants((current) => current.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Remove option ${index + 1}`} className="mb-0.5 grid h-12 w-12 place-items-center rounded-xl border border-[#e4d6d2] text-rose-600 disabled:opacity-30"><X size={18} /></button></div>)}</div>
      </section>
    </div>

    <div className="space-y-5">
      <section className="rounded-2xl border border-[#ede3df] bg-white p-5"><div className="flex items-center gap-2"><ImagePlus size={19} className="text-[#b65f5b]" /><h2 className="text-lg font-bold">Product gallery</h2></div><input name="images" type="file" multiple accept="image/jpeg,image/png,image/webp,image/avif" className="mt-4 block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-[#fbf3f1] file:px-4 file:py-3 file:font-semibold file:text-[#9b5a57]" /><p className="mt-2 text-xs leading-5 text-[#817477]">Upload up to 6 images at a time. JPEG, PNG, WebP, or AVIF; 10 MB each.</p>{product && <label className="mt-4 flex items-start gap-3 rounded-xl bg-[#fff7f5] p-3 text-xs"><input name="replaceImages" type="checkbox" className="mt-0.5 h-4 w-4 accent-[#bf6d68]" /><span><strong className="block">Replace current gallery</strong>Leave unchecked to add the new images to the existing gallery.</span></label>}</section>
      {!product && <section className="rounded-2xl border border-[#ede3df] bg-white p-5"><label className="flex items-center gap-3 text-sm font-semibold"><input name="submitForReview" type="checkbox" defaultChecked className="h-5 w-5 accent-[#bf6d68]" />Submit for marketplace review</label><p className="mt-2 text-xs leading-5 text-[#817477]">Submitted listings are reviewed before shoppers can see them. Unchecked saves a draft.</p></section>}
      <section className="rounded-2xl border border-[#ede3df] bg-white p-5"><button disabled={saving} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#bf6d68] py-3 font-bold text-white disabled:opacity-50"><Save size={18} /> {saving ? "Saving…" : product ? "Save product changes" : "Save product"}</button>{onCancel ? <button type="button" onClick={onCancel} className="mt-3 w-full rounded-xl border border-[#d9c2bd] py-3 text-sm font-bold text-[#9b5a57]">Cancel editing</button> : <Link href="/dashboard/products" className="mt-3 block text-center text-sm font-semibold text-[#9b5a57]">Back to products</Link>}</section>
    </div>
  </form>;
}

const inputClass = "mt-2 h-12 w-full rounded-xl border border-[#ddd3d0] bg-[#fcfaf9] px-4 font-normal outline-none focus:border-[#bf6d68]";
const textareaClass = "mt-2 w-full rounded-xl border border-[#ddd3d0] bg-[#fcfaf9] p-4 font-normal outline-none focus:border-[#bf6d68]";

function Field({ label, name, wide = false, value, onChange, ...inputProps }: { label: string; name: string; wide?: boolean; value?: string; onChange?: (value: string) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "name" | "value" | "onChange">) {
  return <label className={`text-sm font-semibold ${wide ? "sm:col-span-2" : ""}`}>{label}<input name={name} value={value} onChange={onChange ? (event) => onChange(event.target.value) : undefined} className={inputClass} {...inputProps} /></label>;
}

function Feedback({ error, message }: { error: string; message: string }) {
  return <>{error && <p role="alert" className="mt-5 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}{message && <p role="status" className="mt-5 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{message}</p>}</>;
}
