"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Check, Edit3, FolderTree, Plus, Save, X } from "lucide-react";
import type { MarketplaceCategory } from "@/lib/marketplace-categories";
import { rootCategories } from "@/lib/marketplace-categories";
import { createClient } from "@/utils/supabase/client";

function slugify(value: string) {
  return value.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export default function AdminCategoryManager() {
  const [categories, setCategories] = useState<MarketplaceCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const { data, error: loadError } = await createClient().from("categories")
      .select("id, parent_id, name, slug, description, image_url, sort_order, is_active")
      .order("sort_order").order("name");
    if (loadError) setError(loadError.message);
    else setCategories((data ?? []) as MarketplaceCategory[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  const parents = useMemo(() => rootCategories(categories), [categories]);

  async function save(event: FormEvent<HTMLFormElement>, category?: MarketplaceCategory) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const name = String(form.get("name") ?? "").trim();
    const slug = slugify(name);
    if (!name || !slug) { setError("Enter a valid category name."); return; }
    setBusy(category?.id ?? "new"); setError(""); setNotice("");
    const payload = {
      name,
      slug,
      description: String(form.get("description") ?? "").trim() || null,
      parent_id: String(form.get("parentId") ?? "") || null,
      sort_order: Number(form.get("sortOrder") ?? 0),
      is_active: form.get("active") === "on",
    };
    const result = category
      ? await createClient().from("categories").update(payload).eq("id", category.id)
      : await createClient().from("categories").insert(payload);
    setBusy("");
    if (result.error) { setError(result.error.code === "23505" ? "A category with that name already exists." : result.error.message); return; }
    setNotice(category ? "Category updated across the marketplace." : "Category added to the marketplace.");
    setEditingId(null);
    if (!category) formElement.reset();
    await load();
  }

  async function toggle(category: MarketplaceCategory) {
    setBusy(category.id); setError(""); setNotice("");
    const { error: updateError } = await createClient().from("categories").update({ is_active: !category.is_active }).eq("id", category.id);
    setBusy("");
    if (updateError) setError(updateError.message);
    else { setNotice(category.is_active ? "Category hidden from sellers and shoppers." : "Category restored for sellers and shoppers."); await load(); }
  }

  return <div className="space-y-5">
    {error && <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
    {notice && <p role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</p>}
    <form onSubmit={(event) => void save(event)} className="rounded-2xl border border-[#e9dfdc] bg-white p-5">
      <div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-[#f2dfdb] text-[#a75754]"><Plus /></span><div><h2 className="font-bold">Add a store category</h2><p className="text-sm text-[#756a6d]">It becomes available in seller product uploads and on the public store immediately.</p></div></div>
      <CategoryFields parents={parents} />
      <button disabled={busy === "new"} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#292326] px-5 py-3 text-sm font-bold text-white disabled:opacity-50"><Save size={17} />{busy === "new" ? "Adding…" : "Add category"}</button>
    </form>
    <section className="rounded-2xl border border-[#e9dfdc] bg-white p-5">
      <div className="flex items-center gap-3"><FolderTree className="text-[#a75754]" /><div><h2 className="font-bold">Public store categories</h2><p className="text-sm text-[#756a6d]">Only active categories appear to sellers and shoppers. Deactivating preserves existing product assignments.</p></div></div>
      {loading ? <p className="py-10 text-center text-sm text-[#756a6d]">Loading categories…</p> : <div className="mt-5 space-y-3">{categories.map((category) => {
        const parent = categories.find((item) => item.id === category.parent_id);
        const editing = editingId === category.id;
        return <article key={category.id} className="rounded-xl border border-[#eee5e2] p-4">
          <div className="flex flex-wrap items-center gap-3"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{parent ? `${parent.name} / ${category.name}` : category.name}</h3><span className={`rounded-full px-2 py-0.5 text-xs font-bold ${category.is_active ? "bg-emerald-50 text-emerald-700" : "bg-stone-100 text-stone-600"}`}>{category.is_active ? "Active" : "Hidden"}</span></div><p className="mt-1 text-xs text-[#817679]">Order {category.sort_order} · /{category.slug}</p></div><button onClick={() => setEditingId(editing ? null : category.id)} className="inline-flex items-center gap-1.5 rounded-lg border border-[#d9c2bd] px-3 py-2 text-xs font-bold text-[#9b5a57]">{editing ? <X size={15} /> : <Edit3 size={15} />}{editing ? "Close" : "Edit"}</button><button disabled={busy === category.id} onClick={() => void toggle(category)} className="inline-flex items-center gap-1.5 rounded-lg bg-[#f6efed] px-3 py-2 text-xs font-bold text-[#9b5a57]">{category.is_active ? <X size={15} /> : <Check size={15} />}{category.is_active ? "Hide" : "Activate"}</button></div>
          {editing && <form onSubmit={(event) => void save(event, category)} className="mt-4 border-t border-[#eee5e2] pt-4"><CategoryFields category={category} parents={categories.some((item) => item.parent_id === category.id) ? [] : parents.filter((item) => item.id !== category.id)} /><button disabled={busy === category.id} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#292326] px-5 py-3 text-sm font-bold text-white disabled:opacity-50"><Save size={17} />Save changes</button></form>}
        </article>;
      })}</div>}
    </section>
  </div>;
}

function CategoryFields({ category, parents }: { category?: MarketplaceCategory; parents: MarketplaceCategory[] }) {
  return <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
    <label className="text-sm font-semibold">Name<input name="name" required defaultValue={category?.name} placeholder="e.g. Wellness" className={inputClass} /></label>
    <label className="text-sm font-semibold">Parent category<select name="parentId" defaultValue={category?.parent_id ?? ""} className={inputClass}><option value="">Top-level category</option>{parents.map((parent) => <option key={parent.id} value={parent.id}>{parent.name}</option>)}</select></label>
    <label className="text-sm font-semibold">Display order<input name="sortOrder" type="number" min="0" defaultValue={category?.sort_order ?? 0} className={inputClass} /></label>
    <label className="flex items-end gap-3 pb-3 text-sm font-semibold"><input name="active" type="checkbox" defaultChecked={category?.is_active ?? true} className="h-5 w-5 accent-[#b85f5d]" />Visible to sellers and shoppers</label>
    <label className="text-sm font-semibold sm:col-span-2 lg:col-span-4">Description<input name="description" defaultValue={category?.description ?? ""} placeholder="What shoppers will find here" className={inputClass} /></label>
  </div>;
}

const inputClass = "mt-2 h-12 w-full rounded-xl border border-[#ddd2cf] bg-[#fcfaf9] px-4 font-normal outline-none focus:border-[#b85f5d]";
