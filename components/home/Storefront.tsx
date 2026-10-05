"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight, ChevronRight, Leaf, ShieldCheck, Sparkles,
} from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { homeCategories } from "@/lib/catalog";
import SiteHeader from "@/components/layout/SiteHeader";
import ProductCard from "@/components/products/ProductCard";
import { useStore } from "@/components/providers/StoreProvider";

export default function Storefront({ initialCategory = "All", initialQuery = "" }: { initialCategory?: string; initialQuery?: string }) {
  const [category, setCategory] = useState(initialCategory);
  const [query, setQuery] = useState(initialQuery);
  const [toast, setToast] = useState("");
  const { products, recommendations } = useStore();

  // Search and category state intentionally share one filtered result set.
  const visibleProducts = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matches = products.filter((product) => {
      const matchesCategory = category === "All" || product.category === category;
      const matchesQuery = !needle || `${product.name} ${product.category}`.toLowerCase().includes(needle);
      return matchesCategory && matchesQuery;
    });
    return category === "All" && !needle ? recommendations.slice(0, 4) : matches;
  }, [category, products, query, recommendations]);

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2200);
  }

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    document.querySelector("#recommended")?.scrollIntoView({ behavior: "smooth" });
    showToast(query ? `Showing results for “${query}”` : "Showing all skincare");
  }

  function chooseCategory(name: string) {
    setCategory(name);
    document.querySelector("#recommended")?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <main className="min-h-screen p-0 sm:p-5 lg:p-8">
      <div className="relative mx-auto min-h-screen max-w-[1440px] overflow-hidden bg-white shadow-[0_28px_90px_rgba(107,44,62,.16)] sm:min-h-0 sm:rounded-[28px]">
        <SiteHeader query={query} onQuery={setQuery} onSearch={submitSearch} />

        <Hero />

        <section id="categories" className="px-5 py-9 sm:px-10 lg:px-16">
          <SectionHeading title="Shop by Category" action="View all" href="/categories" />
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {homeCategories.map((item) => (
              <button key={item.name} onClick={() => chooseCategory(item.name)} aria-pressed={category === item.name}
                className={`group overflow-hidden rounded-2xl border text-left transition duration-300 hover:-translate-y-1 hover:shadow-lg ${category === item.name ? "border-[#f14f78] shadow-md" : "border-[#f1e2e7]"}`}>
                <div className="relative h-24 overflow-hidden bg-[#fce1e8] sm:h-28">
                  <Image src="/images/belglow-hero-products.png" alt="" fill sizes="(max-width: 640px) 50vw, 16vw"
                    className="scale-[1.7] object-cover transition duration-500 group-hover:scale-[1.82]" style={{ objectPosition: item.position }} />
                </div>
                <div className="bg-white px-3 py-3 text-center">
                  <p className="text-sm font-bold">{item.name}</p>
                  <p className="mt-0.5 text-xs text-[#887b80]">{item.count} products</p>
                </div>
              </button>
            ))}
          </div>
        </section>

        <section id="recommended" className="px-5 pb-12 sm:px-10 lg:px-16 lg:pb-16">
          <SectionHeading title={category === "All" ? "Recommended For You" : category}
            action={category === "All" ? "View all" : "Clear filter"} href={category === "All" ? "/shop" : undefined} onAction={() => setCategory("All")} />
          {visibleProducts.length ? (
            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {visibleProducts.map((product) => <ProductCard key={product.id} product={product} compact />)}
            </div>
          ) : (
            <div className="mt-5 rounded-2xl border border-dashed border-[#e9cbd4] bg-[#fff8fa] py-14 text-center text-[#756b70]">
              No glow essentials match “{query}”. Try a broader search.
            </div>
          )}
        </section>

        <footer id="about" className="flex flex-col gap-3 border-t border-[#f0e2e6] bg-[#fff8fa] px-6 py-7 text-sm text-[#756b70] sm:flex-row sm:items-center sm:justify-between sm:px-10 lg:px-16">
          <p><strong className="text-[#2c2226]">BelGlow</strong> — Belizean beauty, naturally you.</p>
          <p id="blog">Gentle formulas • Cruelty free • Dermatologist trusted</p>
        </footer>
      </div>

      {toast && <div role="status" className="toast-in fixed bottom-6 left-1/2 z-[80] -translate-x-1/2 rounded-full bg-[#241a1e] px-5 py-3 text-sm font-semibold text-white shadow-xl">{toast}</div>}
    </main>
  );
}

function Hero() {
  return (
    <section id="home" className="relative isolate overflow-hidden bg-[linear-gradient(110deg,#fff8fa_0%,#fce8ed_52%,#f5becb_100%)]">
      {/* Soft botanical shadows add depth without competing with the product cutout. */}
      <div className="absolute -left-28 -top-16 h-80 w-80 rounded-full border-[30px] border-white/20 opacity-70" />
      <div className="absolute right-[8%] top-[9%] h-[450px] w-[450px] rounded-full border border-white/60 bg-white/10" />
      <div className="relative grid min-h-[520px] items-center lg:grid-cols-[.86fr_1.2fr] lg:min-h-[570px]">
        <div className="z-10 px-6 pb-4 pt-14 sm:px-12 lg:px-16 lg:py-16">
          <p className="mb-4 text-[11px] font-bold uppercase tracking-[.32em] text-[#74696d]">Natural • Effective • Radiant</p>
          <h1 className="max-w-[600px] text-[48px] font-black leading-[.98] tracking-[-.06em] text-[#171214] sm:text-[64px] lg:text-[70px] xl:text-[78px]">Beauty care<br />made for<br /><em className="font-black not-italic text-[#ef4b74]">your glow</em></h1>
          <p className="mt-6 max-w-[420px] text-[16px] leading-6 text-[#544a4e] sm:text-lg sm:leading-7">Skincare, haircare, body care, beauty, and self-care essentials—all in one nurturing space.</p>
          <Link href="/shop" className="mt-7 inline-flex items-center gap-3 rounded-full bg-[#ef4b74] px-7 py-3.5 text-sm font-bold text-white shadow-[0_12px_28px_rgba(239,75,116,.28)] transition hover:-translate-y-0.5 hover:bg-[#db315f]">Shop Now <ArrowRight size={17} /></Link>
          <div className="mt-9 grid max-w-[430px] grid-cols-3 gap-3 border-t border-[#eabfca] pt-6 lg:border-0 lg:pt-0">
            <Trust icon={<Leaf />} title="Gentle" subtitle="Formulas" />
            <Trust icon={<Sparkles />} title="Cruelty" subtitle="Free" />
            <Trust icon={<ShieldCheck />} title="Dermatologist" subtitle="Trusted" />
          </div>
        </div>
        <div className="relative min-h-[365px] self-stretch lg:min-h-0">
          <div className="absolute inset-x-[-5%] bottom-[-2%] top-[-3%] lg:left-[-14%] lg:right-[-5%]">
            <Image src="/images/belglow-hero-products.png" alt="A coordinated collection of pink BelGlow skincare essentials with flowers and botanical leaves" fill priority sizes="(max-width: 1024px) 100vw, 60vw" className="object-contain object-bottom drop-shadow-[0_30px_34px_rgba(145,57,80,.16)]" />
          </div>
        </div>
      </div>
    </section>
  );
}

function SectionHeading({ title, action, onAction, href }: { title: string; action: string; onAction?: () => void; href?: string }) {
  const actionClass = "flex shrink-0 items-center gap-1 text-sm font-semibold transition hover:text-[#ed4773]";
  return <div className="flex items-end justify-between gap-4"><h2 className="text-2xl font-black tracking-[-.035em] sm:text-3xl">{title}</h2>{href ? <Link href={href} className={actionClass}>{action} <ChevronRight size={16} /></Link> : <button onClick={onAction} className={actionClass}>{action} <ChevronRight size={16} /></button>}</div>;
}

function Trust({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return <div className="flex items-center gap-2.5 text-[#ef4b74] [&_svg]:h-6 [&_svg]:w-6"><span className="shrink-0">{icon}</span><p className="text-[11px] leading-[1.15] text-[#4a4044] sm:text-xs"><strong className="font-semibold">{title}</strong><br />{subtitle}</p></div>;
}

