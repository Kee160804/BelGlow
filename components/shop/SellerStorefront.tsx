"use client";

import { Heart, MapPin, Store } from "lucide-react";
import SiteHeader from "@/components/layout/SiteHeader";
import ProductCard from "@/components/products/ProductCard";
import { useStore } from "@/components/providers/StoreProvider";

type PublicStore = { id: string; name: string; description: string | null; brand_story: string | null; location: string | null };

export default function SellerStorefront({ store }: { store: PublicStore }) {
  const { products, savedStoreIds, toggleSavedStore } = useStore();
  const storeProducts = products.filter((product) => product.sellerStoreId === store.id);
  const saved = savedStoreIds.includes(store.id);
  return <main className="min-h-screen bg-[#fffdfd]"><SiteHeader /><section className="bg-[linear-gradient(115deg,#fff7f9,#f8d8e1)] px-5 py-14 sm:px-10 lg:px-16"><div className="mx-auto flex max-w-7xl flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"><div><span className="grid h-16 w-16 place-items-center rounded-2xl bg-white text-[#e63e6b] shadow-sm"><Store size={30} /></span><p className="mt-5 text-xs font-bold uppercase tracking-[.22em] text-[#e63e6b]">BelGlow verified seller</p><h1 className="mt-2 font-serif text-5xl font-semibold">{store.name}</h1>{store.location && <p className="mt-3 flex items-center gap-2 text-sm text-[#695d62]"><MapPin size={16} />{store.location}</p>}<p className="mt-3 max-w-2xl text-sm leading-6 text-[#695d62]">{store.brand_story || store.description || "Discover this seller’s collection on BelGlow."}</p></div><button onClick={() => toggleSavedStore(store.id)} className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-bold text-[#df3865] shadow-sm"><Heart size={18} fill={saved ? "#df3865" : "none"} />{saved ? "Saved business" : "Save business"}</button></div></section><section className="mx-auto max-w-7xl px-5 py-10 sm:px-10 lg:px-16"><h2 className="text-2xl font-black">Products from {store.name}</h2><p className="mt-1 text-sm text-[#7d7175]">{storeProducts.length} active products</p>{storeProducts.length ? <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{storeProducts.map((product) => <ProductCard key={product.id} product={product} />)}</div> : <p className="mt-6 rounded-2xl bg-[#fff7f9] p-8 text-center text-sm text-[#75696e]">This store has no active products right now.</p>}</section></main>;
}
