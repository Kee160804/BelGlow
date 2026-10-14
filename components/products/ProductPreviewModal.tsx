"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { BadgeCheck, ChevronLeft, ChevronRight, Expand, Heart, Leaf, Minus, PackageCheck, Plus, Share2, ShieldCheck, ShoppingBag, Sparkles, Star, Store, Truck, X } from "lucide-react";
import type { StoreProduct } from "@/lib/catalog";
import { useStore } from "@/components/providers/StoreProvider";

type Props = {
  product: StoreProduct;
  favorite: boolean;
  onClose: () => void;
  onAdd: (id: string, variantId?: string) => void;
  onFavorite: (id: string) => void;
};

export default function ProductPreviewModal({ product, onClose, onAdd, onFavorite, favorite }: Props) {
  const { savedStoreIds, toggleSavedStore } = useStore();
  const router = useRouter();
  const uploadedImages = product.imageUrls?.length ? product.imageUrls : product.imageUrl ? [product.imageUrl] : [];
  const gallery = uploadedImages.length
    ? uploadedImages.map((src) => ({ src, position: "center" }))
    : [product.position, "58% center", "84% center", "31% center"].map((position) => ({ src: "/images/belglow-hero-products.png", position }));
  const options = product.variants?.length ? product.variants : ["30 mL", "50 mL", "100 mL"].map((name) => ({ id: product.variantId ?? "", name, price: product.price, stock: product.stock ?? 99 }));
  const [imageIndex, setImageIndex] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [size, setSize] = useState(options[0]?.name ?? "Default");
  const [activeTab, setActiveTab] = useState("Product details");
  const [zoomed, setZoomed] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const image = gallery[imageIndex] ?? gallery[0];
  const selectedOption = options.find((option) => option.name === size) ?? options[0];
  const availableStock = selectedOption?.stock ?? product.stock ?? 0;
  const currentPrice = selectedOption?.price ?? product.price;
  const description = product.description || "A nurturing BelGlow essential selected to make your daily beauty and self-care routine feel simple, joyful, and radiant.";

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (zoomed) setZoomed(false);
      else onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, zoomed]);

  function addSelectedQuantity() {
    for (let index = 0; index < quantity; index += 1) onAdd(product.id, selectedOption?.id || product.variantId);
  }

  function buyNow() {
    addSelectedQuantity();
    onClose();
    router.push("/checkout");
  }

  const detailContent: Record<string, string> = {
    "Product details": description,
    Ingredients: product.ingredients || "Review the product packaging for the seller’s complete ingredient list and allergy guidance.",
    "How to use": product.usageInstructions || "Apply as directed by the seller. Begin with a small amount and patch test before adding a new product to your daily routine.",
    Shipping: product.shippingInfo || "Delivery times and fees are confirmed during checkout.",
    Reviews: `Rated ${product.rating} by verified BelGlow shoppers.`,
  };

  return <>
    <div className="fixed inset-0 z-[90] grid place-items-center overflow-y-auto bg-[#211a1d]/45 p-2 backdrop-blur-sm sm:p-4" role="dialog" aria-modal="true" aria-label={`${product.name} details`} onMouseDown={onClose}>
      <div className="flex w-full max-w-7xl justify-center" onMouseDown={(event) => event.stopPropagation()}>
        <div className="relative grid max-h-[calc(100vh-2rem)] w-full overflow-y-auto rounded-[30px] bg-white p-4 shadow-[0_32px_100px_rgba(52,22,31,.3)] sm:p-6 lg:grid-cols-[1.04fr_.96fr] lg:gap-8 lg:p-7">
          <button onClick={onClose} aria-label="Close product details" className="absolute right-4 top-4 z-30 grid h-11 w-11 place-items-center rounded-full bg-white/95 shadow-md transition hover:bg-[#fff0f4] sm:right-6 sm:top-6"><X size={24} /></button>

          <section aria-label="Product gallery" className="min-w-0">
            <div className="relative">
              <button onClick={() => { setZoomLevel(1); setZoomed(true); }} aria-label={`Zoom ${product.name} image`} className="group relative block aspect-square w-full cursor-zoom-in overflow-hidden rounded-[24px] bg-[#fff0f4] text-left">
                <Image src={image.src} unoptimized={image.src.startsWith("http")} alt={product.name} fill priority sizes="(max-width: 1024px) 100vw, 52vw" className="scale-[1.32] object-cover transition duration-500 group-hover:scale-[1.38]" style={{ objectPosition: image.position }} />
                <span className="absolute bottom-4 right-4 inline-flex items-center gap-2 rounded-full bg-white/95 px-4 py-2 text-xs font-bold text-[#3c3035] shadow-lg"><Expand size={16} /> Click to zoom</span>
              </button>
              {gallery.length > 1 && <><button onClick={() => setImageIndex((current) => (current - 1 + gallery.length) % gallery.length)} aria-label="Previous product image" className="absolute left-4 top-1/2 z-20 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white shadow-lg transition hover:scale-105"><ChevronLeft /></button><button onClick={() => setImageIndex((current) => (current + 1) % gallery.length)} aria-label="Next product image" className="absolute right-4 top-1/2 z-20 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white shadow-lg transition hover:scale-105"><ChevronRight /></button></>}
            </div>
            <div className={`mt-3 grid gap-3 ${gallery.length === 1 ? "grid-cols-1" : "grid-cols-4"}`}>
              {gallery.slice(0, 4).map((item, index) => <button key={`${item.src}-${item.position}`} onClick={() => setImageIndex(index)} aria-label={`View product image ${index + 1}`} aria-current={index === imageIndex ? "true" : undefined} className={`relative aspect-[1.12] overflow-hidden rounded-2xl bg-[#fff0f4] ring-offset-2 transition ${index === imageIndex ? "ring-2 ring-[#ef3f70]" : "hover:opacity-80"}`}><Image src={item.src} unoptimized={item.src.startsWith("http")} alt="" fill sizes="160px" className="scale-[1.45] object-cover" style={{ objectPosition: item.position }} /></button>)}
            </div>
          </section>

          <section className="flex min-w-0 flex-col pt-7 lg:pt-1">
            <div className="pr-14"><span className="inline-flex items-center gap-2 rounded-full bg-[#fff0f4] px-3 py-1.5 text-xs font-bold text-[#e63e6d]"><Sparkles size={14} /> BelGlow</span><h2 className="mt-3 text-3xl font-black tracking-[-.045em] text-[#211b1e] sm:text-4xl">{product.name}</h2><p className="mt-1 text-lg text-[#6f666a]">{product.subtitle || `${product.category} essential for your glow routine`}</p></div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm"><span className="flex text-amber-400" aria-label="5 stars">{Array.from({ length: 5 }, (_, index) => <Star key={index} size={18} fill="currentColor" />)}</span><strong>{product.rating}</strong><span className="text-[#b4aaae]">|</span><span className="text-[#70666a]">1.2K+ sold</span></div>
            <div className="mt-4 flex flex-wrap gap-2"><ProductBadge icon={<Sparkles size={15} />} text="Best Seller" tone="rose" /><ProductBadge icon={<Leaf size={15} />} text="Natural care" tone="green" /><ProductBadge icon={<ShieldCheck size={15} />} text="Secure choice" tone="pink" /></div>
            <div className="mt-5 flex flex-wrap items-center gap-3"><strong className="text-4xl font-black text-[#ec2363]">BZ${currentPrice.toFixed(2)}</strong>{product.compareAtPrice && product.compareAtPrice > currentPrice && <span className="text-lg text-[#8a7f83] line-through">BZ${product.compareAtPrice.toFixed(2)}</span>}<span className="text-sm text-[#766c70]">Taxes calculated at checkout</span></div>
            <p className="mt-4 border-b border-[#eee4e7] pb-5 text-sm leading-6 text-[#655b60]">{description}</p>

            <div className="mt-4 flex items-end justify-between gap-4"><div>{!(options.length === 1 && options[0].name === "Default") && <><p className="text-sm font-bold">Size or option</p><div className="mt-2 flex flex-wrap gap-2">{options.map((option) => <button key={option.id || option.name} onClick={() => { setSize(option.name); setQuantity(1); }} disabled={option.stock < 1} aria-pressed={size === option.name} className={`min-w-24 rounded-xl border px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${size === option.name ? "border-[#ef3f70] bg-[#fff7f9]" : "border-[#e6dde0]"}`}>{option.name}</button>)}</div></>}</div><span className={`mb-2 inline-flex items-center gap-1.5 text-xs font-bold ${availableStock > 0 ? "text-emerald-700" : "text-rose-700"}`}><span className={`h-2 w-2 rounded-full ${availableStock > 0 ? "bg-emerald-600" : "bg-rose-600"}`} /> {availableStock > 0 ? `${availableStock} in stock` : "Out of stock"}</span></div>
            <div className="mt-4 grid grid-cols-[132px_1fr] gap-3"><div className="flex h-13 items-center justify-between rounded-xl border border-[#e5dade] px-3"><button onClick={() => setQuantity((current) => Math.max(1, current - 1))} aria-label="Decrease quantity" className="p-1"><Minus size={18} /></button><strong>{quantity}</strong><button onClick={() => setQuantity((current) => Math.min(Math.min(10, availableStock), current + 1))} disabled={availableStock < 1} aria-label="Increase quantity" className="p-1 disabled:opacity-40"><Plus size={18} /></button></div><button onClick={addSelectedQuantity} disabled={availableStock < 1} className="flex h-13 items-center justify-center gap-2 rounded-full bg-[#ef2d69] px-6 font-bold text-white shadow-[0_10px_24px_rgba(239,45,105,.22)] transition hover:bg-[#dc205b] disabled:cursor-not-allowed disabled:opacity-45"><ShoppingBag size={20} /> Add to cart</button></div>
            <button onClick={buyNow} disabled={availableStock < 1} className="mt-2 w-full rounded-full bg-[#ffe3ec] py-3 text-sm font-bold text-[#ec2363] transition hover:bg-[#ffd6e3] disabled:cursor-not-allowed disabled:opacity-45">Buy now</button>

            <div className="mt-4 flex flex-wrap items-center gap-4 rounded-2xl bg-[linear-gradient(100deg,#fff5f7,#fff)] p-4"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#ffdce7] text-[#e93468]"><Store /></span><div className="min-w-0 flex-1"><p className="text-xs text-[#766b70]">Sold by</p><p className="truncate font-bold">{product.sellerName || "BelGlow verified seller"} <BadgeCheck size={16} className="inline text-[#ef3f70]" /></p></div>{product.sellerSlug && <Link href={`/store/${product.sellerSlug}`} onClick={onClose} className="rounded-full border border-[#f0c7d3] px-3 py-2 text-xs font-bold text-[#d93667]">Visit store</Link>}{product.sellerStoreId && <button onClick={() => toggleSavedStore(product.sellerStoreId!)} aria-label={savedStoreIds.includes(product.sellerStoreId) ? "Remove business from favorites" : "Save business to favorites"} className="grid h-10 w-10 place-items-center rounded-full border border-[#f0c7d3] text-[#ed4773]"><Heart size={20} fill={savedStoreIds.includes(product.sellerStoreId) ? "#ed4773" : "none"} /></button>}<button onClick={() => onFavorite(product.id)} aria-label={favorite ? "Remove product from wishlist" : "Save product to wishlist"} className="grid h-10 w-10 place-items-center rounded-full border border-[#f0c7d3] text-[#ed4773]"><Heart size={20} fill={favorite ? "#ed4773" : "none"} /></button><button onClick={() => void navigator.clipboard?.writeText(product.slug ? `${window.location.origin}/product/${product.slug}` : window.location.href)} aria-label="Share product" className="grid h-10 w-10 place-items-center rounded-full border border-[#f0c7d3]"><Share2 size={19} /></button></div>
            <div className="mt-4 grid grid-cols-2 gap-2 border-y border-[#eee4e7] py-4 text-xs sm:grid-cols-4"><ProductFeature icon={<Truck />} title="Free shipping" text="Over BZ$50" /><ProductFeature icon={<PackageCheck />} title="Easy returns" text="14-day policy" /><ProductFeature icon={<ShieldCheck />} title="Secure checkout" text="Protected" /><ProductFeature icon={<Leaf />} title="Natural care" text="Seller selected" /></div>
            <div className="mt-4"><div className="flex gap-5 overflow-x-auto border-b border-[#eee4e7]">{Object.keys(detailContent).map((tab) => <button key={tab} onClick={() => setActiveTab(tab)} className={`shrink-0 border-b-2 px-1 pb-3 text-xs font-semibold ${activeTab === tab ? "border-[#ef3f70] text-[#ef2362]" : "border-transparent text-[#70666a]"}`}>{tab}</button>)}</div><p className="pt-4 text-sm leading-6 text-[#655b60]">{detailContent[activeTab]}</p></div>
          </section>
        </div>
      </div>
    </div>

    {zoomed && <div className="fixed inset-0 z-[130] grid place-items-center bg-[#140d10]/90 p-4" role="dialog" aria-modal="true" aria-label={`${product.name} enlarged image`} onMouseDown={() => setZoomed(false)}><div className="relative h-full w-full max-w-6xl overflow-hidden" onMouseDown={(event) => event.stopPropagation()}><Image src={image.src} unoptimized={image.src.startsWith("http")} alt={`${product.name} enlarged`} fill sizes="100vw" className="object-contain transition-transform duration-200" style={{ transform: `scale(${zoomLevel})` }} /><div className="absolute right-3 top-3 flex gap-2"><button onClick={() => setZoomLevel((current) => Math.max(1, current - .5))} disabled={zoomLevel === 1} aria-label="Zoom out" className="grid h-11 w-11 place-items-center rounded-full bg-white text-black shadow-lg disabled:opacity-40"><Minus /></button><button onClick={() => setZoomLevel((current) => Math.min(3, current + .5))} disabled={zoomLevel === 3} aria-label="Zoom in" className="grid h-11 w-11 place-items-center rounded-full bg-white text-black shadow-lg disabled:opacity-40"><Plus /></button><button onClick={() => setZoomed(false)} aria-label="Close enlarged image" className="grid h-11 w-11 place-items-center rounded-full bg-white text-black shadow-lg"><X /></button></div><p className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/65 px-4 py-2 text-xs font-semibold text-white">{Math.round(zoomLevel * 100)}% zoom</p></div></div>}
  </>;
}

function ProductBadge({ icon, text, tone }: { icon: ReactNode; text: string; tone: "rose" | "green" | "pink" }) {
  const styles = { rose: "bg-rose-50 text-rose-600", green: "bg-emerald-50 text-emerald-700", pink: "bg-pink-50 text-pink-600" };
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ${styles[tone]}`}>{icon}{text}</span>;
}

function ProductFeature({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return <div className="flex items-center gap-2"><span className="text-[#ef2d69] [&>svg]:h-6 [&>svg]:w-6">{icon}</span><span><strong className="block leading-tight">{title}</strong><span className="text-[10px] text-[#81767a]">{text}</span></span></div>;
}
