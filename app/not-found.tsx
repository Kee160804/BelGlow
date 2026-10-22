import Link from "next/link";
import SiteHeader from "@/components/layout/SiteHeader";

export default function NotFound() {
  return <main className="min-h-screen bg-[#fffaf8]"><SiteHeader /><section className="mx-auto max-w-2xl px-5 py-24 text-center"><p className="text-xs font-bold uppercase tracking-[.2em] text-[#d8446e]">404</p><h1 className="mt-3 font-serif text-5xl font-semibold">We couldn’t find that page</h1><p className="mt-4 text-[#75696e]">The listing or page may have moved, expired, or never existed.</p><div className="mt-8 flex flex-wrap justify-center gap-3"><Link href="/shop" className="rounded-full bg-[#ef4b74] px-6 py-3 font-bold text-white">Browse the shop</Link><Link href="/contact" className="rounded-full border border-[#d9c7c3] bg-white px-6 py-3 font-bold">Contact support</Link></div></section></main>;
}
