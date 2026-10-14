"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import SiteHeader from "@/components/layout/SiteHeader";
import ProductPreviewModal from "@/components/products/ProductPreviewModal";
import { useStore } from "@/components/providers/StoreProvider";

export default function ProductRouteClient({ slug }: { slug: string }) {
  const router = useRouter();
  const { products, favoriteIds, addToCart, toggleFavorite } = useStore();
  const product = products.find((item) => item.slug === slug);
  return <main className="min-h-screen bg-[#fff8fa]"><SiteHeader /><div className="mx-auto max-w-5xl px-5 py-24 text-center"><h1 className="text-3xl font-black">{product ? product.name : "Loading product…"}</h1>{!product && <p className="mt-3 text-sm text-[#75696e]">If this listing is no longer active, return to the marketplace.</p>}<Link href="/shop" className="mt-5 inline-block rounded-full bg-[#ef4b74] px-5 py-3 text-sm font-bold text-white">Browse the store</Link></div>{product && <ProductPreviewModal product={product} favorite={favoriteIds.includes(product.id)} onClose={() => router.push("/shop")} onAdd={addToCart} onFavorite={toggleFavorite} />}</main>;
}
