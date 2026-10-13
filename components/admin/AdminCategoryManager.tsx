"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, Edit3, FolderTree, Plus, Save, X } from "lucide-react";
import type { MarketplaceCategory } from "@/lib/marketplace-categories";
import { categoryChildren, rootCategories } from "@/lib/marketplace-categories";
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
  const [newCategoryType, setNewCategoryType] = useState<"category" | "subcategory">("category");
  const [expandedCategoryIds, setExpandedCategoryIds] = useState<string[]>([]);

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
    const parentId = String(form.get("parentId") ?? "");
    if (!category && newCategoryType === "subcategory" && !parentId) { setError("Choose the main category this subcategory belongs to."); return; }
    setBusy(category?.id ?? "new"); setError(""); setNotice("");
    const payload = {
      name,
      slug,
      description: String(form.get("description") ?? "").trim() || null,
      parent_id: parentId || null,
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
    if (!category) { formElement.reset(); setNewCategoryType("category"); }
    await load();
  }

  async function toggle(category: MarketplaceCategory) {
    setBusy(category.id); setError(""); setNotice("");
    const { error: updateError } = await createClient().from("categories").update({ is_active: !category.is_active }).eq("id", category.id);
    setBusy("");
    if (updateError) setError(updateError.message);
    else { setNotice(category.is_active ? "Category hidden from sellers and shoppers." : "Category restored for sellers and shoppers."); await load(); }
  }

  function renderCategoryRow(category: MarketplaceCategory, nested = false, childCount = 0) {
    const editing = editingId === category.id;
    const expanded = expandedCategoryIds.includes(category.id);
    return <>
      <div className={`flex flex-wrap items-center gap-3 ${nested ? "bg-[#fcf8f7] px-4 py-3" : "p-4"}`}>
        {!nested && childCount > 0 && <button type="button" onClick={() => setExpandedCategoryIds((current) => current.includes(category.id) ? current.filter((id) => id !== category.id) : [...current, category.id])} aria-expanded={expanded} aria-label={`${expanded ? "Collapse" : "Expand"} ${category.name} subcategories`} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#f6ece9] text-[#a75754]"><ChevronDown size={18} className={`transition-transform ${expanded ? "rotate-180" : ""}`} /></button>}
        <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className={`font-semibold ${nested ? "text-sm" : ""}`}>{category.name}</h3><span className={`rounded-full px-2 py-0.5 text-xs font-bold ${category.is_active ? "bg-emerald-50 text-emerald-700" : "bg-stone-100 text-stone-600"}`}>{category.is_active ? "Active" : "Hidden"}</span>{!nested && childCount > 0 && <span className="text-xs font-semibold text-[#8a777c]">{childCount} {childCount === 1 ? "subcategory" : "subcategories"}</span>}</div><p className="mt-1 text-xs text-[#817679]">Order {category.sort_order} · /{category.slug}</p></div>
        <button type="button" onClick={() => setEditingId(editing ? null : category.id)} className="inline-flex items-center gap-1.5 rounded-lg border border-[#d9c2bd] px-3 py-2 text-xs font-bold text-[#9b5a57]">{editing ? <X size={15} /> : <Edit3 size={15} />}{editing ? "Close" : "Edit"}</button>
        <button type="button" disabled={busy === category.id} onClick={() => void toggle(category)} className="inline-flex items-center gap-1.5 rounded-lg bg-[#f6efed] px-3 py-2 text-xs font-bold text-[#9b5a57]">{category.is_active ? <X size={15} /> : <Check size={15} />}{category.is_active ? "Hide" : "Activate"}</button>
      </div>
      {editing && <form onSubmit={(event) => void save(event, category)} className={`border-t border-[#eee5e2] p-4 ${nested ? "bg-[#fffdfc]" : ""}`}><CategoryFields category={category} parents={childCount > 0 ? [] : parents.filter((item) => item.id !== category.id)} /><button disabled={busy === category.id} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#292326] px-5 py-3 text-sm font-bold text-white disabled:opacity-50"><Save size={17} />Save changes</button></form>}
    </>;
  }

  return <div className="space-y-5">
    {error && <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
    {notice && <p role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</p>}
    <form onSubmit={(event) => void save(event)} className="rounded-2xl border border-[#e9dfdc] bg-white p-5">
      <div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-[#f2dfdb] text-[#a75754]"><Plus /></span><div><h2 className="font-bold">Add a category or subcategory</h2><p className="text-sm text-[#756a6d]">It becomes available in seller product uploads and on the public store immediately.</p></div></div>
      <div className="mt-5 inline-flex rounded-xl border border-[#e4d6d2] bg-[#f8f3f1] p-1" aria-label="Category type"><button type="button" onClick={() => setNewCategoryType("category")} aria-pressed={newCategoryType === "category"} className={`rounded-lg px-4 py-2 text-sm font-bold transition ${newCategoryType === "category" ? "bg-[#292326] text-white shadow-sm" : "text-[#6f6266]"}`}>Main category</button><button type="button" onClick={() => setNewCategoryType("subcategory")} aria-pressed={newCategoryType === "subcategory"} className={`rounded-lg px-4 py-2 text-sm font-bold transition ${newCategoryType === "subcategory" ? "bg-[#292326] text-white shadow-sm" : "text-[#6f6266]"}`}>Subcategory</button></div>
      <CategoryFields parents={parents} showParent={newCategoryType === "subcategory"} parentRequired={newCategoryType === "subcategory"} />
      <button disabled={busy === "new"} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#292326] px-5 py-3 text-sm font-bold text-white disabled:opacity-50"><Save size={17} />{busy === "new" ? "Adding…" : newCategoryType === "subcategory" ? "Add subcategory" : "Add category"}</button>
    </form>
    <section className="rounded-2xl border border-[#e9dfdc] bg-white p-5">
      <div className="flex items-center gap-3"><FolderTree className="text-[#a75754]" /><div><h2 className="font-bold">Public store categories</h2><p className="text-sm text-[#756a6d]">Only active categories appear to sellers and shoppers. Deactivating preserves existing product assignments.</p></div></div>
      {loading ? <p className="py-10 text-center text-sm text-[#756a6d]">Loading categories…</p> : <div className="mt-5 space-y-3">{parents.map((category) => {
        const children = categoryChildren(categories, category.id);
        const expanded = expandedCategoryIds.includes(category.id);
        return <article key={category.id} className="overflow-hidden rounded-xl border border-[#eee5e2]">
          {renderCategoryRow(category, false, children.length)}
          {expanded && children.length > 0 && <div className="border-t border-[#eadeda] bg-[#fbf6f4] p-3"><p className="px-2 pb-2 text-[10px] font-bold uppercase tracking-[.18em] text-[#a67482]">Subcategories</p><div className="divide-y divide-[#eadeda] overflow-hidden rounded-lg border border-[#eadeda] bg-white">{children.map((child) => <div key={child.id}>{renderCategoryRow(child, true)}</div>)}</div></div>}
        </article>;
      })}</div>}
    </section>
  </div>;
}

function CategoryFields({ category, parents, showParent = true, parentRequired = false }: { category?: MarketplaceCategory; parents: MarketplaceCategory[]; showParent?: boolean; parentRequired?: boolean }) {
  return <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
    <label className="text-sm font-semibold">Name<input name="name" required defaultValue={category?.name} placeholder="e.g. Wellness" className={inputClass} /></label>
    {showParent ? <label className="text-sm font-semibold">Parent category<select name="parentId" required={parentRequired} defaultValue={category?.parent_id ?? ""} className={inputClass}><option value="" disabled={parentRequired}>{parentRequired ? "Select a main category" : "Top-level category"}</option>{parents.map((parent) => <option key={parent.id} value={parent.id}>{parent.name}</option>)}</select></label> : <input type="hidden" name="parentId" value="" />}
    <label className="text-sm font-semibold">Display order<input name="sortOrder" type="number" min="0" defaultValue={category?.sort_order ?? 0} className={inputClass} /></label>
    <label className="flex items-end gap-3 pb-3 text-sm font-semibold"><input name="active" type="checkbox" defaultChecked={category?.is_active ?? true} className="h-5 w-5 accent-[#b85f5d]" />Visible to sellers and shoppers</label>
    <label className="text-sm font-semibold sm:col-span-2 lg:col-span-4">Description<input name="description" defaultValue={category?.description ?? ""} placeholder="What shoppers will find here" className={inputClass} /></label>
  </div>;
}

const inputClass = "mt-2 h-12 w-full rounded-xl border border-[#ddd2cf] bg-[#fcfaf9] px-4 font-normal outline-none focus:border-[#b85f5d]";
