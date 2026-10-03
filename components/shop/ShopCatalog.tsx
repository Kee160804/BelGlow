"use client";

import { useMemo, useState } from "react";
import { SlidersHorizontal, Sparkles } from "lucide-react";
import SiteHeader from "@/components/layout/SiteHeader";
import ProductCard from "@/components/products/ProductCard";
import { products } from "@/lib/catalog";
import { useStore } from "@/components/providers/StoreProvider";

const categories = ["All", ...Array.from(new Set(products.map((product) => product.category)))];

export default function ShopCatalog({ initialCategory = "All", initialQuery = "" }: { initialCategory?: string; initialQuery?: string }) {
  const [category, setCategory] = useState(initialCategory);
  const [query, setQuery] = useState(initialQuery);
  const [sort, setSort] = useState("recommended");
  const { favoriteIds, recommendations } = useStore();

  const visibleProducts = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const source = sort === "recommended" ? recommendations : [...products];
    const filtered = source.filter((product) => (category === "All" || product.category === category) && (!needle || `${product.name} ${product.category}`.toLowerCase().includes(needle)));
    if (sort === "low") return [...filtered].sort((a, b) => a.price - b.price);
    if (sort === "high") return [...filtered].sort((a, b) => b.price - a.price);
    return filtered;
  }, [category, query, recommendations, sort]);

  const favoriteProducts = products.filter((product) => favoriteIds.includes(product.id));

  return <main className="min-h-screen p-0 sm:p-5 lg:p-8">
    <div className="mx-auto min-h-screen max-w-[1440px] overflow-hidden bg-[#fffdfd] shadow-[0_28px_90px_rgba(107,44,62,.16)] sm:rounded-[28px]">
      <SiteHeader query={query} onQuery={setQuery} onSearch={(event) => event.preventDefault()} />
      <section className="bg-[linear-gradient(115deg,#fff7f9,#f8d8e1)] px-5 py-12 sm:px-10 lg:px-16 lg:py-16">
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end"><div><p className="text-xs font-bold uppercase tracking-[.25em] text-[#e63e6b]">BelGlow marketplace</p><h1 className="mt-3 text-4xl font-black tracking-[-.05em] sm:text-6xl">Shop every kind of glow</h1><p className="mt-4 max-w-2xl text-[#695d62]">Explore our complete collection of beauty, haircare, body care, fragrance, cosmetics, gentle essentials, and tropical self-care.</p></div><div className="flex items-center gap-2 rounded-full bg-white px-4 shadow-sm"><SlidersHorizontal size={17} className="text-[#e63e6b]" /><label className="sr-only" htmlFor="sort-products">Sort products</label><select id="sort-products" value={sort} onChange={(event) => setSort(event.target.value)} className="h-12 bg-transparent text-sm font-bold outline-none"><option value="recommended">Recommended</option><option value="low">Price: Low to high</option><option value="high">Price: High to low</option></select></div></div>
      </section>

      <section className="px-5 py-9 sm:px-10 lg:px-16">
        <div className="flex gap-2 overflow-x-auto pb-3" aria-label="Filter products by category">{categories.map((item) => <button key={item} onClick={() => setCategory(item)} aria-pressed={category === item} className={`shrink-0 rounded-full px-4 py-2.5 text-sm font-bold transition ${category === item ? "bg-[#ef4b74] text-white" : "bg-[#fff0f4] text-[#61555a] hover:bg-[#f8d9e2]"}`}>{item}</button>)}</div>
        <div className="mt-5 flex items-end justify-between"><div><h2 className="text-2xl font-black tracking-[-.035em]">{category === "All" ? "All products" : category}</h2><p className="mt-1 text-sm text-[#7d7175]">{visibleProducts.length} products</p></div>{sort === "recommended" && <p className="hidden items-center gap-1.5 text-xs font-bold text-[#e63e6b] sm:flex"><Sparkles size={15} /> Learns from your activity</p>}</div>
        {visibleProducts.length ? <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{visibleProducts.map((product) => <ProductCard key={product.id} product={product} />)}</div> : <div className="mt-6 rounded-3xl border border-dashed border-[#e8cbd3] bg-[#fff7f9] py-16 text-center"><p className="font-bold">No products found</p><button onClick={() => { setQuery(""); setCategory("All"); }} className="mt-3 text-sm font-bold text-[#df3865]">Clear filters</button></div>}
      </section>

      <section id="wishlist" className="scroll-mt-8 border-t border-[#f0e2e6] bg-[#fff8fa] px-5 py-10 sm:px-10 lg:px-16">
        <h2 className="text-2xl font-black tracking-[-.035em]">Saved for you</h2>
        <p className="mt-1 text-sm text-[#7d7175]">Heart products you love and they’ll stay together here.</p>
        {favoriteProducts.length ? <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">{favoriteProducts.map((product) => <ProductCard key={product.id} product={product} />)}</div> : <div className="mt-6 rounded-2xl border border-dashed border-[#e8cbd3] bg-white py-12 text-center text-sm text-[#7d7175]">Your saved products will appear here.</div>}
      </section>
    </div>
  </main>;
}
