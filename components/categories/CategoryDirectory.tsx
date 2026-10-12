"use client";

import Link from "next/link";
import { Baby, Bath, Blend, Boxes, ChevronRight, Flower2, Gem, HeartHandshake, Leaf, Search, Sparkles, SprayCan, UserRound } from "lucide-react";
import { useMemo, useState } from "react";
import SiteHeader from "@/components/layout/SiteHeader";
import { useMarketplaceCategories } from "@/components/categories/useMarketplaceCategories";
import { categoryChildren, rootCategories } from "@/lib/marketplace-categories";

const icons = [Sparkles, HeartHandshake, Flower2, Bath, Gem, SprayCan, UserRound, Baby, Leaf, Blend, Boxes];

export default function CategoryDirectory() {
  const [search, setSearch] = useState("");
  const { categories, loading } = useMarketplaceCategories();
  const departments = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rootCategories(categories).filter((department) => {
      const children = categoryChildren(categories, department.id);
      return !needle || `${department.name} ${department.description ?? ""} ${children.map((item) => item.name).join(" ")}`.toLowerCase().includes(needle);
    });
  }, [categories, search]);

  return <main className="min-h-screen p-0 sm:p-5 lg:p-8">
    <div className="mx-auto min-h-screen max-w-[1440px] overflow-hidden bg-[#fffdfd] shadow-[0_28px_90px_rgba(107,44,62,.16)] sm:rounded-[28px]">
      <SiteHeader />
      <section className="relative overflow-hidden bg-[linear-gradient(120deg,#fff7f9,#f9dce5)] px-5 py-14 text-center sm:px-10 lg:py-20">
        <div className="absolute -left-20 top-0 h-64 w-64 rounded-full border-[35px] border-white/30" /><div className="absolute -right-12 bottom-[-80px] h-72 w-72 rounded-full bg-[#f4b6c7]/25 blur-2xl" />
        <div className="relative mx-auto max-w-3xl"><p className="text-xs font-bold uppercase tracking-[.28em] text-[#ed4773]">Everything for your care</p><h1 className="mt-4 text-4xl font-black tracking-[-.05em] text-[#211a1d] sm:text-6xl">Find what nurtures you</h1><p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-[#675b60] sm:text-lg">Browse the complete category catalog maintained by BelGlow administrators.</p><label className="mx-auto mt-8 flex max-w-xl items-center gap-3 rounded-full bg-white px-5 shadow-[0_12px_35px_rgba(112,52,69,.10)] ring-1 ring-[#f0dce2]"><Search size={20} className="text-[#ed4773]" /><span className="sr-only">Search all categories</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search categories and product types…" className="h-14 min-w-0 flex-1 bg-transparent text-sm outline-none sm:text-base" /></label></div>
      </section>
      <section className="px-5 py-10 sm:px-10 lg:px-16 lg:py-14">
        {loading ? <p className="py-16 text-center text-sm text-[#796d71]">Loading store categories…</p> : <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{departments.map((department, index) => {
          const Icon = icons[index % icons.length];
          const children = categoryChildren(categories, department.id);
          const shopHref = `/shop?category=${encodeURIComponent(department.name)}`;
          return <article key={department.id} className="group flex flex-col rounded-[24px] border border-[#efdee3] bg-white p-6 transition duration-300 hover:-translate-y-1 hover:shadow-[0_18px_45px_rgba(90,39,54,.10)]"><div className="flex items-start gap-4"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#fff0f4] text-[#ef4b74] transition group-hover:bg-[#ef4b74] group-hover:text-white"><Icon size={23} /></span><div><h2 className="text-xl font-black tracking-[-.03em]">{department.name}</h2><p className="mt-1 text-sm leading-5 text-[#796d71]">{department.description || "Explore products in this collection."}</p></div></div>{children.length > 0 && <div className="mt-5 flex flex-wrap gap-2">{children.map((child) => <Link key={child.id} href={`/shop?category=${encodeURIComponent(child.name)}`} className="rounded-full border border-[#f0e0e5] bg-[#fffafb] px-3 py-1.5 text-xs font-semibold text-[#675b60] transition hover:border-[#ef4b74] hover:text-[#df3563]">{child.name}</Link>)}</div>}<Link href={shopHref} className="mt-6 flex items-center gap-1 border-t border-[#f3e7ea] pt-4 text-sm font-bold text-[#e43f6b]">Shop {department.name} <ChevronRight size={16} /></Link></article>;
        })}</div>}
        {!loading && departments.length === 0 && <div className="rounded-3xl border border-dashed border-[#e7c8d1] bg-[#fff7f9] py-16 text-center"><p className="font-bold">No categories found</p><p className="mt-1 text-sm text-[#796d71]">Try searching for a broader product type.</p></div>}
      </section>
    </div>
  </main>;
}
