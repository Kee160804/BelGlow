"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const hiddenPrefixes = ["/admin", "/dashboard", "/account", "/auth", "/seller-application"];

export default function SiteFooter() {
  const pathname = usePathname();
  if (hiddenPrefixes.some((prefix) => pathname.startsWith(prefix))) return null;

  return <footer className="border-t border-[#efdfe4] bg-[#2b2226] px-5 py-10 text-[#e9dde1] sm:px-10 lg:px-16">
    <div className="mx-auto grid max-w-[1312px] gap-8 md:grid-cols-[1.3fr_1fr_1fr]">
      <div><p className="text-2xl font-extrabold tracking-[-.05em] text-white">Bel<span className="text-[#f0658b]">Glow</span></p><p className="mt-3 max-w-md text-sm leading-6 text-[#cfc0c5]">A Belizean marketplace connecting shoppers with independent beauty and self-care sellers. Sellers manage their products and fulfillment; BelGlow provides the marketplace and platform support.</p></div>
      <div><h2 className="text-xs font-bold uppercase tracking-[.18em] text-[#f3a0b7]">Marketplace</h2><div className="mt-4 grid gap-2 text-sm"><Link href="/about">About BelGlow</Link><Link href="/contact">Contact and support</Link><Link href="/track-order">Track an order</Link><Link href="/seller-application">Sell on BelGlow</Link></div></div>
      <div><h2 className="text-xs font-bold uppercase tracking-[.18em] text-[#f3a0b7]">Policies</h2><div className="mt-4 grid gap-2 text-sm"><Link href="/policies/terms">Terms of service</Link><Link href="/policies/privacy">Privacy</Link><Link href="/policies/delivery">Seller delivery policy</Link><Link href="/policies/returns">Returns and refunds</Link><Link href="/policies/sellers">Seller agreement</Link><Link href="/policies/products">Product standards</Link></div></div>
    </div>
    <div className="mx-auto mt-8 max-w-[1312px] border-t border-white/10 pt-5 text-xs text-[#ae9da3]"><p>© {new Date().getFullYear()} BelGlow. Independent sellers are responsible for their listings, products, and fulfillment.</p></div>
  </footer>;
}
