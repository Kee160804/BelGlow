"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { Heart, Menu, Search, ShoppingBag, UserRound, X } from "lucide-react";
import { useStore } from "@/components/providers/StoreProvider";

type SiteHeaderProps = {
  query?: string;
  onQuery?: (value: string) => void;
  onSearch?: (event: FormEvent) => void;
};

const navigation = [
  { label: "Home", href: "/" },
  { label: "Shop", href: "/shop" },
  { label: "Categories", href: "/categories" },
  { label: "About", href: "/about" },
  { label: "Contact", href: "/contact" },
];

export default function SiteHeader({
  query = "",
  onQuery,
  onSearch,
}: SiteHeaderProps) {
  const { cart, favoriteIds, userName, userRole, openCart, openWishlist, openAuth } = useStore();
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [localQuery, setLocalQuery] = useState(query);
  const currentQuery = onQuery ? query : localQuery;

  function updateQuery(value: string) {
    if (onQuery) onQuery(value);
    else setLocalQuery(value);
  }

  function openAccount() {
    if (!userName) {
      openAuth();
      return;
    }
    router.push(userRole === "admin" ? "/admin" : userRole === "seller" ? "/dashboard" : "/account");
  }

  const accountLabel = userRole === "admin" ? "Admin dashboard" : userRole === "seller" ? "Seller dashboard" : userName ? "My account" : "Sign in or create account";

  function isActiveNavigation(href: string) {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  function selectNavigation(_href: string) {
    setMenuOpen(false);
  }

  // Pages without an in-place product grid send search requests to the main shop.
  function submitSearch(event: FormEvent) {
    if (onSearch) {
      onSearch(event);
      return;
    }
    event.preventDefault();
    const searchQuery = currentQuery.trim();
    router.push(searchQuery ? `/shop?q=${encodeURIComponent(searchQuery)}` : "/shop");
    setMenuOpen(false);
  }

  return (
    <header className="relative z-50 border-b border-[#f3e4e8] bg-white">
      <div className="flex h-[78px] items-center gap-1 px-3 min-[390px]:gap-2 sm:gap-5 sm:px-8 lg:h-[92px] lg:px-16">
        <Link href="/" aria-label="BelGlow home" className="mr-auto flex min-w-0 shrink items-center gap-1.5 min-[390px]:gap-2.5">
          <span className="-mx-1 scale-90 min-[390px]:mx-0 min-[390px]:scale-100"><BrandMark /></span>
          <div>
            <p className="text-[21px] font-extrabold leading-none tracking-[-.05em] min-[390px]:text-[24px] sm:text-[28px]">Bel<span className="text-[#eb3f70]">Glow</span></p>
            <p className="mt-1 hidden text-[7px] font-bold uppercase tracking-[.19em] text-[#ed4c77] min-[390px]:block sm:text-[8px]">Belizean beauty. Naturally you.</p>
          </div>
        </Link>

        <nav className="hidden items-center gap-7 xl:flex" aria-label="Main navigation">
          {navigation.map((item) => { const active = isActiveNavigation(item.href); return <Link key={item.label} href={item.href} onClick={() => selectNavigation(item.href)} aria-current={active ? (item.href.startsWith("/#") ? "location" : "page") : undefined} className={`relative py-2 text-sm font-semibold transition after:absolute after:inset-x-0 after:-bottom-1 after:h-0.5 after:origin-center after:rounded-full after:bg-[#ed4773] after:transition-transform ${active ? "text-[#ed4773] after:scale-x-100" : "text-[#3c3437] after:scale-x-0 hover:text-[#ed4773]"}`}>{item.label}</Link>; })}
        </nav>

        <form onSubmit={submitSearch} className="ml-auto hidden w-[280px] items-center rounded-full bg-[#fff6f8] px-5 ring-1 ring-[#f3e4e8] lg:flex">
          <input value={currentQuery} onChange={(event) => updateQuery(event.target.value)} aria-label="Search beauty and self-care products" placeholder="Search beauty, haircare..." className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[#a09599]" />
          <button aria-label="Submit search"><Search size={19} /></button>
        </form>

        <div className="hidden items-center gap-4 sm:flex">
          <button onClick={openAccount} aria-label={userName ? `Open ${accountLabel.toLowerCase()} for ${userName}` : "Create account or sign in"} className="grid h-9 min-w-9 place-items-center rounded-full p-2 transition hover:bg-[#fff1f5] hover:text-[#ed4773]">{userName ? <span className="text-sm font-black text-[#ed4773]">{userName.charAt(0).toUpperCase()}</span> : <UserRound size={21} />}</button>
          <button onClick={openWishlist} aria-label={`Open saved products with ${favoriteIds.length} items`} className="relative rounded-full p-2 transition hover:bg-[#fff1f5] hover:text-[#ed4773]"><Heart size={21} />{favoriteIds.length > 0 && <Badge count={favoriteIds.length} />}</button>
          <button onClick={openCart} aria-label={`Shopping bag with ${cart.length} items`} className="relative rounded-full p-2 transition hover:bg-[#fff1f5] hover:text-[#ed4773]"><ShoppingBag size={21} />{cart.length > 0 && <Badge count={cart.length} />}</button>
        </div>

        <button onClick={openWishlist} aria-label={`Open saved products with ${favoriteIds.length} items`} className="relative grid min-h-11 min-w-11 place-items-center rounded-full sm:hidden"><Heart size={21} />{favoriteIds.length > 0 && <Badge count={favoriteIds.length} />}</button>
        <button onClick={openCart} aria-label={`Shopping bag with ${cart.length} items`} className="relative grid min-h-11 min-w-11 place-items-center rounded-full sm:hidden"><ShoppingBag size={21} />{cart.length > 0 && <Badge count={cart.length} />}</button>
        <button onClick={() => setMenuOpen((value) => !value)} aria-expanded={menuOpen} aria-label="Toggle navigation menu" className="grid min-h-11 min-w-11 place-items-center rounded-full xl:hidden">{menuOpen ? <X size={22} /> : <Menu size={22} />}</button>
      </div>

      {menuOpen && <div className="absolute left-2 right-2 top-[72px] max-h-[calc(100dvh-80px)] overflow-y-auto rounded-2xl border border-[#f0dce2] bg-white p-3 shadow-2xl min-[390px]:left-4 min-[390px]:right-4 min-[390px]:p-4 xl:hidden">
        <form onSubmit={submitSearch} className="mb-3 flex items-center rounded-full bg-[#fff6f8] px-4 lg:hidden">
          <input value={currentQuery} onChange={(event) => updateQuery(event.target.value)} aria-label="Search beauty and self-care products" placeholder="Search products..." className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none" />
          <button aria-label="Submit search"><Search size={19} /></button>
        </form>
        {navigation.map((item) => { const active = isActiveNavigation(item.href); return <Link key={item.label} href={item.href} onClick={() => selectNavigation(item.href)} aria-current={active ? (item.href.startsWith("/#") ? "location" : "page") : undefined} className={`block rounded-xl px-4 py-3 text-sm font-semibold transition ${active ? "bg-[#fff2f5] text-[#ed4773]" : "hover:bg-[#fff2f5] hover:text-[#ed4773]"}`}>{item.label}</Link>; })}
        <button onClick={() => { setMenuOpen(false); openAccount(); }} className="mt-2 flex w-full items-center gap-3 rounded-xl bg-[#fff2f5] px-4 py-3 text-left text-sm font-bold text-[#df3765]"><UserRound size={18} />{accountLabel}</button>
      </div>}
    </header>
  );
}

function Badge({ count }: { count: number }) {
  return <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-[#f14f78] px-1 text-[10px] font-bold text-white">{count}</span>;
}

function BrandMark() {
  return <span aria-hidden className="relative block h-11 w-11"><span className="absolute left-1 top-1 h-8 w-4 -rotate-[28deg] rounded-[100%_0_100%_0] bg-[#f6a0b7]" /><span className="absolute right-1 top-2 h-8 w-4 rotate-[28deg] rounded-[0_100%_0_100%] bg-[#ef4b74]" /><span className="absolute bottom-0 left-[21px] h-7 w-[2px] -rotate-12 bg-[#e46a8b]" /></span>;
}
