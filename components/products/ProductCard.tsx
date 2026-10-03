"use client";

import Image from "next/image";
import { Heart, ShoppingBag, Star } from "lucide-react";
import { products } from "@/lib/catalog";
import { useStore } from "@/components/providers/StoreProvider";

export default function ProductCard({ product, compact = false }: { product: (typeof products)[number]; compact?: boolean }) {
  const { favoriteIds, toggleFavorite, addToCart, openProduct } = useStore();
  const favorite = favoriteIds.includes(product.id);
  return <article className={`group grid overflow-hidden rounded-2xl border border-[#eee2e5] bg-white transition hover:-translate-y-1 hover:shadow-[0_15px_35px_rgba(80,35,47,.10)] ${compact ? "min-h-[204px] grid-cols-[42%_1fr] sm:min-h-[224px]" : "grid-rows-[220px_1fr]"}`}>
    <button onClick={() => openProduct(product.id)} aria-label={`View ${product.name}`} className="relative overflow-hidden bg-[#fff1f4]"><Image src="/images/belglow-hero-products.png" alt={product.name} fill sizes={compact ? "(max-width: 640px) 42vw, 20vw" : "(max-width: 640px) 100vw, 25vw"} className={`${compact ? "scale-[2.05]" : "scale-[1.7]"} object-cover transition duration-500 group-hover:scale-[1.82]`} style={{ objectPosition: product.position }} /></button>
    <div className="relative flex min-w-0 flex-col p-4">
      <button onClick={() => toggleFavorite(product.id)} aria-label={favorite ? `Remove ${product.name} from wishlist` : `Add ${product.name} to wishlist`} className="absolute right-3 top-3 rounded-full p-1.5 text-[#786d71] hover:bg-[#fff0f4] hover:text-[#ed4773]"><Heart size={18} fill={favorite ? "#ed4773" : "none"} className={favorite ? "text-[#ed4773]" : ""} /></button>
      <button onClick={() => openProduct(product.id)} className="pr-7 text-left"><p className="text-[10px] font-bold uppercase tracking-[.1em] text-[#ed4773]">{product.category}</p><h3 className="mt-1 text-sm font-bold leading-5">{product.name}</h3></button>
      <p className="mt-2 flex items-center gap-1 text-[11px] text-[#6e6266]"><Star size={12} fill="#f5a623" className="text-[#f5a623]" /> {product.rating}</p>
      <div className="mt-auto flex items-end justify-between gap-2 pt-3"><p className="text-base font-black">BZ${product.price.toFixed(2)}</p><button onClick={() => addToCart(product.id)} aria-label={`Add ${product.name} to cart`} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#f14f78] text-white shadow-md hover:bg-[#db315f]"><ShoppingBag size={17} /></button></div>
    </div>
  </article>;
}
