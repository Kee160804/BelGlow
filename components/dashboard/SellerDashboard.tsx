"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowUpRight, BarChart3, BadgePercent, Bell, Boxes, ChevronDown,
  CircleDollarSign, House, LogOut, Menu, Package, Plus, Search,
  Settings, ShoppingBag, Star, Store, Users, WalletCards, X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useStore } from "@/components/providers/StoreProvider";

const navigation = [
  { label: "Dashboard", href: "/dashboard", icon: House },
  { label: "Products", href: "/dashboard/products", icon: Package },
  { label: "Add product", href: "/dashboard/add-product", icon: Plus },
  { label: "Orders", href: "/dashboard/orders", icon: ShoppingBag, badge: "3" },
  { label: "Inventory", href: "/dashboard/inventory", icon: Boxes },
  { label: "Customers", href: "/dashboard/customers", icon: Users },
  { label: "Reviews", href: "/dashboard/reviews", icon: Star },
  { label: "Promotions", href: "/dashboard/promotions", icon: BadgePercent },
  { label: "Analytics", href: "/dashboard/analytics", icon: BarChart3 },
  { label: "Payouts", href: "/dashboard/payouts", icon: WalletCards },
  { label: "Store profile", href: "/dashboard/store-profile", icon: Store },
  { label: "Settings", href: "/dashboard/settings", icon: Settings },
] as const;

const recentOrders = [
  ["#BG12456", "Janelle P.", "2 items", "BZ$48.50", "Processing", "Oct 1, 2026"],
  ["#BG12455", "Daniela M.", "1 item", "BZ$22.00", "Shipped", "Sep 30, 2026"],
  ["#BG12454", "Kayla R.", "3 items", "BZ$75.20", "Pending", "Sep 30, 2026"],
  ["#BG12453", "Marcos B.", "1 item", "BZ$18.00", "Delivered", "Sep 29, 2026"],
] as const;

const topProducts = [
  ["Hydrating Glow Serum", "125 sold", "BZ$1,875.00", "29% center"],
  ["Brightening Face Cream", "98 sold", "BZ$1,470.00", "50% center"],
  ["Nourishing Body Oil", "86 sold", "BZ$1,118.00", "84% center"],
  ["Aloe & Shea Body Lotion", "64 sold", "BZ$768.00", "66% center"],
] as const;

export default function SellerDashboard() {
  const { userName, userRole, openAuth, signOut } = useStore();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function closeAccountMenu(event: PointerEvent) {
      if (!accountMenuRef.current?.contains(event.target as Node)) setAccountMenuOpen(false);
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setAccountMenuOpen(false);
    }

    document.addEventListener("pointerdown", closeAccountMenu);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeAccountMenu);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  if (!userName || userRole !== "seller") {
    return <main className="grid min-h-screen place-items-center bg-[radial-gradient(circle_at_top,#fff7f4,#f5e8e3_48%,#ead8d2)] p-5">
      <section className="w-full max-w-lg rounded-[32px] border border-white/70 bg-white/90 p-8 text-center shadow-[0_30px_90px_rgba(87,48,42,.16)] sm:p-11">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-[#f7e3df] text-[#b85f5d]"><Store size={30} /></span>
        <p className="mt-6 text-xs font-bold uppercase tracking-[.24em] text-[#b85f5d]">Seller access</p>
        <h1 className="mt-2 font-serif text-4xl font-semibold tracking-[-.03em]">Run your beauty business on BelGlow</h1>
        <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-[#74696a]">Sign in with the seller demo to preview products, orders, inventory, commission, and payouts.</p>
        <button onClick={openAuth} className="mt-7 w-full rounded-xl bg-[#bf6d68] px-5 py-3.5 font-bold text-white transition hover:bg-[#a95956]">Sign in to seller dashboard</button>
        <Link href="/" className="mt-4 inline-block text-sm font-semibold text-[#7a5a58] hover:text-[#b85f5d]">Return to marketplace</Link>
      </section>
    </main>;
  }

  return <main className="min-h-screen bg-[#efe4df] p-0 text-[#292527] lg:p-5">
    <div className="mx-auto grid min-h-screen max-w-[1600px] overflow-hidden bg-[#faf7f5] shadow-[0_26px_90px_rgba(76,46,40,.16)] lg:min-h-[calc(100vh-40px)] lg:grid-cols-[244px_1fr] lg:rounded-[28px]">
      <aside className={`fixed inset-y-0 left-0 z-50 flex w-[270px] flex-col border-r border-[#eadeda] bg-[#fbf6f3] p-5 transition-transform lg:static lg:w-auto lg:translate-x-0 ${menuOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex items-center justify-between px-2 py-2">
          <Link href="/" className="flex items-center gap-2" aria-label="BelGlow marketplace"><BrandMark /><div><p className="font-serif text-3xl leading-none">Bel<span className="text-[#b86160]">Glow</span></p><p className="mt-1 text-[7px] font-bold uppercase tracking-[.26em] text-[#9b6461]">Beauty beyond borders</p></div></Link>
          <button onClick={() => setMenuOpen(false)} className="rounded-full p-2 lg:hidden" aria-label="Close navigation"><X size={21} /></button>
        </div>
        <nav className="mt-7 space-y-1" aria-label="Seller navigation">
          {navigation.map((item) => { const Icon = item.icon; const active = pathname === item.href; return <Link key={item.label} href={item.href} onClick={() => setMenuOpen(false)} aria-current={active ? "page" : undefined} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition ${active ? "bg-[#dca9a2] text-white shadow-sm" : "text-[#393438] hover:bg-[#f3e7e3]"}`}><Icon size={19} /><span className="flex-1">{item.label}</span>{"badge" in item && <span className={`rounded-md px-1.5 py-0.5 text-xs ${active ? "bg-white/25 text-white" : "bg-[#c88e85] text-white"}`}>{item.badge}</span>}</Link>; })}
        </nav>
        <div className="mt-auto rounded-2xl border border-[#eadbd6] bg-white/70 p-4">
          <p className="text-sm font-bold">BelGlow marketplace</p>
          <p className="mt-1 text-xs leading-5 text-[#75696b]">A 15% platform fee is deducted from each completed sale.</p>
          <button onClick={signOut} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-[#d8aaa3] py-2 text-xs font-bold text-[#a95b58]"><LogOut size={15} /> Sign out</button>
        </div>
      </aside>

      {menuOpen && <button className="fixed inset-0 z-40 bg-black/25 lg:hidden" onClick={() => setMenuOpen(false)} aria-label="Close navigation overlay" />}

      <div className="min-w-0">
        <header className="flex h-20 items-center gap-3 border-b border-[#ebe1dd] bg-white/80 px-4 backdrop-blur sm:px-7">
          <button onClick={() => setMenuOpen(true)} className="rounded-xl border border-[#eadeda] p-2.5 lg:hidden" aria-label="Open navigation"><Menu size={20} /></button>
          <label className="hidden max-w-xl flex-1 items-center gap-3 rounded-xl bg-[#f4f0ee] px-4 sm:flex"><Search size={19} className="text-[#666064]" /><span className="sr-only">Search dashboard</span><input placeholder="Search products, orders, customers..." className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none" /></label>
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <button className="relative rounded-full p-2" aria-label="Notifications"><Bell size={20} /><span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500" /></button>
            <div ref={accountMenuRef} className="relative">
              <button onClick={() => setAccountMenuOpen((open) => !open)} aria-expanded={accountMenuOpen} aria-controls="seller-account-menu" className="flex items-center gap-3 rounded-xl px-1.5 py-1.5 text-left transition hover:bg-[#f7efec] sm:pr-3">
                <span className="grid h-10 w-10 place-items-center rounded-full bg-[#ead0ca] font-serif text-lg text-[#a95b58]">G</span>
                <span className="hidden sm:block"><span className="block text-sm font-bold">{userName}</span><span className="block text-[11px] text-[#7e7274]">Seller account</span></span>
                <ChevronDown size={16} className={`transition-transform ${accountMenuOpen ? "rotate-180" : ""}`} />
              </button>
              {accountMenuOpen && <div id="seller-account-menu" className="absolute right-0 top-[calc(100%+10px)] z-50 w-64 overflow-hidden rounded-2xl border border-[#eadeda] bg-white p-2 shadow-[0_18px_50px_rgba(73,43,39,.18)]">
                <div className="border-b border-[#eee5e1] px-3 py-3 sm:hidden"><p className="text-sm font-bold">{userName}</p><p className="text-xs text-[#7e7274]">Seller account</p></div>
                <Link href="/dashboard/store-profile" onClick={() => setAccountMenuOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold hover:bg-[#f8f1ef]"><Store size={18} className="text-[#a95b58]" /> Store profile</Link>
                <Link href="/" onClick={() => setAccountMenuOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold hover:bg-[#f8f1ef]"><ShoppingBag size={18} className="text-[#a95b58]" /> View marketplace</Link>
                <button onClick={() => { setAccountMenuOpen(false); signOut(); }} className="mt-1 flex w-full items-center gap-3 border-t border-[#eee5e1] px-3 py-3 text-left text-sm font-bold text-[#b24f4b] hover:bg-[#fff2f1]"><LogOut size={18} /> Sign out</button>
              </div>}
            </div>
          </div>
        </header>

        {pathname === "/dashboard" ? <div className="p-4 sm:p-7 lg:p-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="text-sm text-[#8b7877]">Thursday, October 1</p><h1 className="mt-1 font-serif text-3xl font-semibold tracking-[-.025em] sm:text-4xl">Good morning, {userName} <span aria-hidden>👋</span></h1><p className="mt-1 text-[#695f62]">Here&apos;s what&apos;s happening with your store today.</p></div>
            <Link href="/dashboard/add-product" className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#bf6d68] px-5 py-3 font-bold text-white shadow-[0_10px_24px_rgba(191,109,104,.22)]"><Plus size={20} /> Add product</Link>
          </div>

          <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Store summary">
            <StatCard icon={<ShoppingBag />} label="Gross sales" value="BZ$4,280" change="12%" />
            <StatCard icon={<Package />} label="Total orders" value="126" change="18%" />
            <StatCard icon={<BadgePercent />} label="BelGlow commission (15%)" value="BZ$642" change="Included" subtle />
            <StatCard icon={<WalletCards />} label="Your earnings" value="BZ$3,638" change="14%" />
          </section>

          <div className="mt-4 grid gap-4 xl:grid-cols-[1.55fr_.9fr]">
            <section className="rounded-2xl border border-[#ede3df] bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between"><div><h2 className="text-lg font-bold">Sales overview</h2><p className="text-sm text-[#7b7072]">Gross sales for the last 30 days</p></div><button className="rounded-lg border border-[#ded5d2] px-3 py-2 text-xs font-semibold">Last 30 days</button></div>
              <div className="mt-5 h-[220px] w-full"><svg viewBox="0 0 720 220" className="h-full w-full" role="img" aria-label="Sales rose from BZ$100 to BZ$760 during September"><defs><linearGradient id="sales-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#c87870" stopOpacity=".3" /><stop offset="1" stopColor="#c87870" stopOpacity=".02" /></linearGradient></defs>{[30,75,120,165,210].map((y) => <line key={y} x1="44" y1={y} x2="700" y2={y} stroke="#eee5e1" />)}<path d="M44 182 L96 158 L148 148 L200 121 L252 156 L304 116 L356 88 L408 120 L460 94 L512 73 L564 96 L616 40 L662 60 L700 16 L700 210 L44 210 Z" fill="url(#sales-fill)" /><path d="M44 182 L96 158 L148 148 L200 121 L252 156 L304 116 L356 88 L408 120 L460 94 L512 73 L564 96 L616 40 L662 60 L700 16" fill="none" stroke="#bd675f" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg></div>
            </section>

            <section className="rounded-2xl border border-[#ede3df] bg-white p-5 shadow-sm"><h2 className="text-lg font-bold">Order status</h2><div className="mt-7 flex flex-col items-center gap-6 sm:flex-row sm:justify-center"><div className="relative grid h-36 w-36 place-items-center rounded-full bg-[conic-gradient(#87bb94_0_49%,#edcfbe_49%_71%,#ead8d0_71%_87%,#ce7d76_87%_97%,#f2e7e2_97%)]"><div className="grid h-24 w-24 place-items-center rounded-full bg-white text-center"><p className="text-2xl font-black">126<span className="block text-xs font-normal">Orders</span></p></div></div><div className="space-y-2.5 text-sm"><Legend color="#ce7d76" label="Pending" value="12" /><Legend color="#edcfbe" label="Processing" value="28" /><Legend color="#87bb94" label="Shipped" value="62" /><Legend color="#ead8d0" label="Delivered" value="20" /></div></div></section>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-[1.3fr_.8fr_.72fr]">
            <section className="overflow-hidden rounded-2xl border border-[#ede3df] bg-white p-5 shadow-sm"><SectionTitle title="Recent orders" href="/dashboard/orders" /><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[640px] text-left text-xs"><thead className="bg-[#faf6f4] text-[#766c6e]"><tr>{["Order", "Customer", "Items", "Total", "Status", "Date"].map((heading) => <th key={heading} className="px-3 py-3 font-semibold">{heading}</th>)}</tr></thead><tbody>{recentOrders.map((order) => <tr key={order[0]} className="border-t border-[#eee5e1]"><td className="px-3 py-3 font-semibold text-[#b45f5c] underline">{order[0]}</td><td className="px-3">{order[1]}</td><td className="px-3">{order[2]}</td><td className="px-3 font-semibold">{order[3]}</td><td className="px-3"><StatusBadge status={order[4]} /></td><td className="px-3 text-[#70676a]">{order[5]}</td></tr>)}</tbody></table></div></section>
            <section className="rounded-2xl border border-[#ede3df] bg-white p-5 shadow-sm"><SectionTitle title="Top products" href="/dashboard/products" /> <div className="mt-3 divide-y divide-[#eee5e1]">{topProducts.map((product) => <div key={product[0]} className="flex items-center gap-3 py-2.5"><ProductThumb position={product[3]} /><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold">{product[0]}</p><p className="text-[11px] text-[#857a7c]">{product[1]}</p></div><p className="text-xs font-bold">{product[2]}</p></div>)}</div></section>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1"><section className="rounded-2xl bg-[linear-gradient(135deg,#eed3cb,#dca7a0)] p-5"><p className="text-xs font-bold uppercase tracking-[.16em] text-[#8e524f]">Grow your store</p><h2 className="mt-2 font-serif text-2xl font-semibold">List your next bestseller</h2><p className="mt-2 text-xs leading-5 text-[#695354]">Add products and reach beauty shoppers across Belize.</p><Link href="/dashboard/add-product" className="mt-5 inline-block rounded-lg border border-[#a95d58] bg-white/75 px-4 py-2 text-xs font-bold text-[#9c5552]">Add new product</Link></section><section className="rounded-2xl border border-[#ede3df] bg-white p-5 shadow-sm"><SectionTitle title="Payout" href="/dashboard/payouts" /><p className="mt-5 text-xs text-[#786e70]">Available balance</p><p className="mt-1 font-serif text-3xl font-bold">BZ$1,245.00</p><p className="mt-2 flex items-center gap-1 text-xs font-semibold text-emerald-700"><CircleDollarSign size={14} /> After commission</p><Link href="/dashboard/payouts" className="mt-4 block w-full rounded-xl bg-[#bf6d68] py-3 text-center text-sm font-bold text-white">View payout details</Link></section></div>
          </div>
        </div> : <SectionWorkspace section={pathname.split("/").filter(Boolean).at(-1) ?? "dashboard"} />}
      </div>
    </div>
  </main>;
}

const sectionCopy: Record<string, { eyebrow: string; title: string; description: string }> = {
  products: { eyebrow: "Catalog", title: "Products", description: "Manage every item customers can discover in your BelGlow store." },
  "add-product": { eyebrow: "Catalog", title: "Add a new product", description: "Create a polished product listing and publish it to the marketplace." },
  orders: { eyebrow: "Sales", title: "Orders", description: "Track payment, fulfillment, and delivery from one place." },
  inventory: { eyebrow: "Operations", title: "Inventory", description: "Stay ahead of low stock and keep your bestsellers available." },
  customers: { eyebrow: "Community", title: "Customers", description: "Understand the shoppers who support your beauty business." },
  reviews: { eyebrow: "Reputation", title: "Reviews", description: "Read feedback and respond to your customers thoughtfully." },
  promotions: { eyebrow: "Marketing", title: "Promotions", description: "Create offers that help new customers discover your products." },
  analytics: { eyebrow: "Performance", title: "Analytics", description: "See where your sales come from and what is driving growth." },
  payouts: { eyebrow: "Finances", title: "Payouts", description: "Review seller earnings, BelGlow commission, and transfer history." },
  "store-profile": { eyebrow: "Storefront", title: "Store profile", description: "Keep your public business details and brand story up to date." },
  settings: { eyebrow: "Account", title: "Settings", description: "Control notifications, fulfillment preferences, and account security." },
};

function SectionWorkspace({ section }: { section: string }) {
  const copy = sectionCopy[section] ?? sectionCopy.products;
  return <div className="p-4 sm:p-7 lg:p-8">
    <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="text-xs font-bold uppercase tracking-[.2em] text-[#b35f5b]">{copy.eyebrow}</p><h1 className="mt-2 font-serif text-4xl font-semibold tracking-[-.025em]">{copy.title}</h1><p className="mt-2 max-w-2xl text-sm text-[#716669]">{copy.description}</p></div>
      {section !== "add-product" && <Link href="/dashboard/add-product" className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#bf6d68] px-5 py-3 text-sm font-bold text-white"><Plus size={18} /> Add product</Link>}
    </div>
    <div className="mt-7">{renderSection(section)}</div>
  </div>;
}

function renderSection(section: string) {
  if (section === "products") return <ProductsPage />;
  if (section === "add-product") return <AddProductPage />;
  if (section === "orders") return <OrdersPage />;
  if (section === "inventory") return <InventoryPage />;
  if (section === "customers") return <CustomersPage />;
  if (section === "reviews") return <ReviewsPage />;
  if (section === "promotions") return <PromotionsPage />;
  if (section === "analytics") return <AnalyticsPage />;
  if (section === "payouts") return <PayoutsPage />;
  if (section === "store-profile") return <StoreProfilePage />;
  return <SettingsPage />;
}

const sellerProducts = [
  ["Hydrating Glow Serum", "Face care", "125", "24", "BZ$15.00", "Active", "29% center"],
  ["Brightening Face Cream", "Face care", "98", "12", "BZ$15.00", "Active", "50% center"],
  ["Nourishing Body Oil", "Body care", "86", "5", "BZ$13.00", "Low stock", "84% center"],
  ["Aloe & Shea Body Lotion", "Body care", "64", "8", "BZ$12.00", "Active", "66% center"],
] as const;

function ProductsPage() { return <Panel><Toolbar placeholder="Search your products" filter="All products" /><div className="mt-5 overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><TableHead labels={["Product", "Category", "Sold", "Stock", "Price", "Status"]} /><tbody>{sellerProducts.map((product) => <tr key={product[0]} className="border-t border-[#eee5e1]"><td className="flex items-center gap-3 px-4 py-3"><ProductThumb position={product[6]} /><strong>{product[0]}</strong></td><td className="px-4 text-[#6f6568]">{product[1]}</td><td className="px-4">{product[2]}</td><td className="px-4">{product[3]}</td><td className="px-4 font-semibold">{product[4]}</td><td className="px-4"><span className={`rounded-full px-2.5 py-1 text-xs ${product[5] === "Low stock" ? "bg-orange-50 text-orange-700" : "bg-emerald-50 text-emerald-700"}`}>{product[5]}</span></td></tr>)}</tbody></table></div></Panel>; }

function AddProductPage() { return <form onSubmit={(event) => event.preventDefault()} className="grid gap-5 xl:grid-cols-[1.3fr_.7fr]"><Panel><h2 className="text-lg font-bold">Product details</h2><div className="mt-5 grid gap-4 sm:grid-cols-2"><Field label="Product name" placeholder="e.g. Hibiscus Glow Oil" wide /><Field label="Category" placeholder="Choose a category" /><Field label="Price (BZD)" placeholder="0.00" /><Field label="SKU" placeholder="BG-0001" /><Field label="Available quantity" placeholder="0" /><label className="sm:col-span-2 text-sm font-semibold">Description<textarea rows={6} placeholder="Tell customers what makes this product special..." className="mt-2 w-full rounded-xl border border-[#ddd3d0] bg-[#fcfaf9] p-4 font-normal outline-none focus:border-[#bf6d68]" /></label></div></Panel><div className="space-y-5"><Panel><h2 className="text-lg font-bold">Product image</h2><button type="button" className="mt-4 grid min-h-48 w-full place-items-center rounded-2xl border border-dashed border-[#d9b8b2] bg-[#fbf3f1] text-center text-[#9b5a57]"><span><Plus className="mx-auto" /><strong className="mt-2 block text-sm">Upload product photos</strong><span className="mt-1 block text-xs text-[#817477]">PNG or JPG up to 10 MB</span></span></button></Panel><Panel><label className="flex items-center justify-between gap-3 text-sm font-semibold">Publish immediately<input type="checkbox" defaultChecked className="h-5 w-5 accent-[#bf6d68]" /></label><button className="mt-5 w-full rounded-xl bg-[#bf6d68] py-3 font-bold text-white">Publish product</button><button type="button" className="mt-2 w-full rounded-xl border border-[#d9c2bd] py-3 text-sm font-bold text-[#9b5a57]">Save as draft</button></Panel></div></form>; }

function OrdersPage() { return <Panel><div className="grid gap-3 sm:grid-cols-3"><MiniStat label="Open orders" value="40" /><MiniStat label="Ready to ship" value="12" /><MiniStat label="Completed this month" value="86" /></div><div className="mt-5"><Toolbar placeholder="Search order or customer" filter="All statuses" /></div><div className="mt-5 overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><TableHead labels={["Order", "Customer", "Items", "Total", "Status", "Date"]} /><tbody>{recentOrders.map((order) => <tr key={order[0]} className="border-t border-[#eee5e1]"><td className="px-4 py-4 font-semibold text-[#ad5d59] underline">{order[0]}</td><td className="px-4">{order[1]}</td><td className="px-4">{order[2]}</td><td className="px-4 font-semibold">{order[3]}</td><td className="px-4"><StatusBadge status={order[4]} /></td><td className="px-4 text-[#70676a]">{order[5]}</td></tr>)}</tbody></table></div></Panel>; }

function InventoryPage() { return <div className="grid gap-5 xl:grid-cols-[1fr_300px]"><Panel><Toolbar placeholder="Search inventory" filter="Stock level" /><div className="mt-5 divide-y divide-[#eee5e1]">{sellerProducts.map((product, index) => <div key={product[0]} className="grid grid-cols-[auto_1fr_auto] items-center gap-4 py-4"><ProductThumb position={product[6]} /><div><p className="font-semibold">{product[0]}</p><p className="text-xs text-[#817679]">{product[1]} · SKU BG-10{index + 1}</p></div><div className="text-right"><p className={`font-bold ${Number(product[3]) <= 8 ? "text-orange-700" : "text-emerald-700"}`}>{product[3]} in stock</p><button className="text-xs font-semibold text-[#ac5c58] underline">Update</button></div></div>)}</div></Panel><Panel><h2 className="font-bold">Low-stock alerts</h2><p className="mt-2 text-sm leading-6 text-[#756a6d]">3 products are at or below their reorder point.</p><button className="mt-5 w-full rounded-xl bg-[#bf6d68] py-3 text-sm font-bold text-white">Review low stock</button></Panel></div>; }

function CustomersPage() { const customers = [["Janelle Perez", "8 orders", "BZ$418.20", "Oct 1"], ["Daniela Martinez", "5 orders", "BZ$284.00", "Sep 30"], ["Kayla Ramirez", "4 orders", "BZ$199.50", "Sep 30"], ["Tiana Lewis", "3 orders", "BZ$162.00", "Sep 29"]]; return <Panel><div className="grid gap-3 sm:grid-cols-3"><MiniStat label="Total customers" value="348" /><MiniStat label="Returning customers" value="42%" /><MiniStat label="Average order" value="BZ$33.97" /></div><div className="mt-6"><Toolbar placeholder="Search customers" filter="All customers" /></div><div className="mt-4 divide-y divide-[#eee5e1]">{customers.map((customer) => <div key={customer[0]} className="grid grid-cols-[auto_1fr_auto] items-center gap-4 py-4"><span className="grid h-10 w-10 place-items-center rounded-full bg-[#f4dfda] font-bold text-[#a85855]">{customer[0].charAt(0)}</span><div><p className="font-semibold">{customer[0]}</p><p className="text-xs text-[#817679]">{customer[1]} · Last order {customer[3]}</p></div><strong className="text-sm">{customer[2]}</strong></div>)}</div></Panel>; }

function ReviewsPage() { const reviews = [["Janelle P.", "Hydrating Glow Serum", "The texture is beautiful and it arrived so quickly.", "5"], ["Kayla R.", "Aloe & Shea Body Lotion", "Soft, light, and perfect for everyday use.", "5"], ["Tiana L.", "Nourishing Body Oil", "Love the glow. I would like a larger bottle too!", "4"]]; return <div className="grid gap-5 xl:grid-cols-[280px_1fr]"><Panel><p className="text-sm text-[#756a6d]">Average rating</p><p className="mt-2 font-serif text-5xl font-bold">4.8</p><p className="mt-2 text-[#d39a37]">★★★★★</p><p className="mt-2 text-xs text-[#817679]">Based on 184 verified reviews</p></Panel><div className="space-y-3">{reviews.map((review) => <Panel key={review[0]}><div className="flex justify-between gap-4"><div><p className="font-bold">{review[0]}</p><p className="text-xs text-[#817679]">{review[1]}</p></div><p className="text-[#d39a37]">{"★".repeat(Number(review[3]))}</p></div><p className="mt-4 text-sm leading-6 text-[#62595c]">“{review[2]}”</p><button className="mt-4 text-xs font-bold text-[#ad5d59]">Reply to review</button></Panel>)}</div></div>; }

function PromotionsPage() { return <div className="grid gap-4 lg:grid-cols-3"><PromotionCard name="WELCOME15" detail="15% off first orders" status="Active" result="42 uses" /><PromotionCard name="GLOWBUNDLE" detail="BZ$10 off sets" status="Scheduled" result="Starts Oct 10" /><section className="grid min-h-48 place-items-center rounded-2xl border border-dashed border-[#d8b8b2] bg-[#fbf4f2] p-6 text-center"><div><Plus className="mx-auto text-[#b45f5b]" /><h2 className="mt-3 font-bold">Create a promotion</h2><p className="mt-1 text-xs text-[#7d7174]">Offer a percentage or fixed discount.</p><button className="mt-4 rounded-xl bg-[#bf6d68] px-4 py-2 text-sm font-bold text-white">New promotion</button></div></section></div>; }

function AnalyticsPage() { return <div className="space-y-5"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><MiniStat label="Store visits" value="2,840" /><MiniStat label="Conversion rate" value="4.4%" /><MiniStat label="Average order" value="BZ$33.97" /><MiniStat label="Repeat purchases" value="42%" /></div><Panel><div className="flex items-center justify-between"><div><h2 className="text-lg font-bold">Revenue trend</h2><p className="text-sm text-[#7b7072]">Net earnings after BelGlow commission</p></div><span className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">+14.2%</span></div><div className="mt-6 h-72"><svg viewBox="0 0 720 250" className="h-full w-full" role="img" aria-label="Revenue increased throughout September">{[30,80,130,180,230].map((y) => <line key={y} x1="20" y1={y} x2="700" y2={y} stroke="#eee5e1" />)}<path d="M20 215 C100 195 100 165 180 175 S270 100 350 130 S450 65 520 92 S620 65 700 25" fill="none" stroke="#bd675f" strokeWidth="4" strokeLinecap="round" /></svg></div></Panel></div>; }

function PayoutsPage() { return <div className="grid gap-5 xl:grid-cols-[.7fr_1.3fr]"><Panel><p className="text-sm text-[#756a6d]">Available balance</p><p className="mt-2 font-serif text-4xl font-bold">BZ$1,245.00</p><p className="mt-3 text-xs text-[#756a6d]">Next automatic payout: October 5</p><button className="mt-6 w-full rounded-xl bg-[#bf6d68] py-3 font-bold text-white">Request payout</button><div className="mt-6 border-t border-[#eee5e1] pt-5"><p className="flex justify-between text-sm"><span>Gross sales</span><strong>BZ$4,280.00</strong></p><p className="mt-3 flex justify-between text-sm"><span>BelGlow commission (15%)</span><strong className="text-[#a45a56]">− BZ$642.00</strong></p><p className="mt-3 flex justify-between text-sm"><span>Seller earnings</span><strong>BZ$3,638.00</strong></p></div></Panel><Panel><h2 className="text-lg font-bold">Payout history</h2><div className="mt-4 divide-y divide-[#eee5e1]">{[["Sep 20, 2026", "Bank transfer", "BZ$980.40", "Paid"], ["Sep 5, 2026", "Bank transfer", "BZ$1,120.25", "Paid"], ["Aug 20, 2026", "Bank transfer", "BZ$875.10", "Paid"]].map((payout) => <div key={payout[0]} className="grid grid-cols-[1fr_auto] gap-3 py-4"><div><p className="font-semibold">{payout[0]}</p><p className="text-xs text-[#817679]">{payout[1]} · {payout[3]}</p></div><strong>{payout[2]}</strong></div>)}</div></Panel></div>; }

function StoreProfilePage() { return <form onSubmit={(event) => event.preventDefault()} className="grid gap-5 xl:grid-cols-[280px_1fr]"><Panel><div className="mx-auto grid h-28 w-28 place-items-center rounded-full bg-[#ead1cb] text-[#a95c59]"><Store size={44} /></div><button type="button" className="mt-5 w-full rounded-xl border border-[#d9c2bd] py-2.5 text-sm font-bold text-[#9b5a57]">Change logo</button><p className="mt-3 text-center text-xs text-[#817679]">Visible throughout the marketplace</p></Panel><Panel><h2 className="text-lg font-bold">Public store details</h2><div className="mt-5 grid gap-4 sm:grid-cols-2"><Field label="Store name" placeholder="Glow Essentials" /><Field label="Contact email" placeholder="hello@glowessentials.bz" /><Field label="Location" placeholder="Belize City, Belize" wide /><label className="sm:col-span-2 text-sm font-semibold">Brand story<textarea rows={6} defaultValue="Thoughtful beauty and self-care essentials made to help every customer feel radiant." className="mt-2 w-full rounded-xl border border-[#ddd3d0] bg-[#fcfaf9] p-4 font-normal outline-none focus:border-[#bf6d68]" /></label></div><button className="mt-5 rounded-xl bg-[#bf6d68] px-6 py-3 font-bold text-white">Save profile</button></Panel></form>; }

function SettingsPage() { return <div className="grid gap-5 xl:grid-cols-2"><Panel><h2 className="text-lg font-bold">Notifications</h2><div className="mt-4 divide-y divide-[#eee5e1]"><SettingToggle label="New order alerts" detail="Receive an email whenever a customer orders." checked /><SettingToggle label="Low-stock alerts" detail="Get notified when inventory reaches its reorder point." checked /><SettingToggle label="Review alerts" detail="Know when a customer leaves feedback." /></div></Panel><Panel><h2 className="text-lg font-bold">Fulfillment</h2><div className="mt-5 space-y-4"><Field label="Default preparation time" placeholder="1–2 business days" /><Field label="Return window" placeholder="14 days" /><button className="rounded-xl bg-[#bf6d68] px-6 py-3 font-bold text-white">Save settings</button></div><div className="mt-7 border-t border-[#eee5e1] pt-5"><h3 className="font-bold">Account security</h3><button className="mt-3 rounded-xl border border-[#d9c2bd] px-4 py-2.5 text-sm font-bold text-[#9b5a57]">Change password</button></div></Panel></div>; }

function Panel({ children }: { children: React.ReactNode }) { return <section className="rounded-2xl border border-[#ede3df] bg-white p-5 shadow-sm">{children}</section>; }
function Toolbar({ placeholder, filter }: { placeholder: string; filter: string }) { return <div className="flex flex-col gap-3 sm:flex-row"><label className="flex flex-1 items-center gap-2 rounded-xl bg-[#f7f3f1] px-4"><Search size={17} className="text-[#817679]" /><span className="sr-only">{placeholder}</span><input placeholder={placeholder} className="h-11 flex-1 bg-transparent text-sm outline-none" /></label><button className="rounded-xl border border-[#ddd3d0] px-4 py-2.5 text-sm font-semibold">{filter} <ChevronDown size={14} className="ml-2 inline" /></button></div>; }
function TableHead({ labels }: { labels: string[] }) { return <thead className="bg-[#faf6f4] text-xs text-[#766c6e]"><tr>{labels.map((label) => <th key={label} className="px-4 py-3 font-semibold">{label}</th>)}</tr></thead>; }
function Field({ label, placeholder, wide = false }: { label: string; placeholder: string; wide?: boolean }) { return <label className={`text-sm font-semibold ${wide ? "sm:col-span-2" : ""}`}>{label}<input placeholder={placeholder} className="mt-2 h-12 w-full rounded-xl border border-[#ddd3d0] bg-[#fcfaf9] px-4 font-normal outline-none focus:border-[#bf6d68]" /></label>; }
function MiniStat({ label, value }: { label: string; value: string }) { return <div className="rounded-xl bg-[#faf5f3] p-4"><p className="text-xs text-[#7b7072]">{label}</p><p className="mt-1 font-serif text-2xl font-bold">{value}</p></div>; }
function PromotionCard({ name, detail, status, result }: { name: string; detail: string; status: string; result: string }) { return <Panel><div className="flex items-start justify-between"><span className="grid h-11 w-11 place-items-center rounded-xl bg-[#f5e1dd] text-[#ae5d59]"><BadgePercent size={21} /></span><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">{status}</span></div><h2 className="mt-5 text-xl font-bold">{name}</h2><p className="mt-1 text-sm text-[#756a6d]">{detail}</p><p className="mt-6 border-t border-[#eee5e1] pt-4 text-xs font-semibold text-[#9e5653]">{result}</p></Panel>; }
function SettingToggle({ label, detail, checked = false }: { label: string; detail: string; checked?: boolean }) { return <label className="flex items-center gap-4 py-4"><span className="flex-1"><strong className="block text-sm">{label}</strong><span className="mt-1 block text-xs text-[#817679]">{detail}</span></span><input type="checkbox" defaultChecked={checked} className="h-5 w-5 accent-[#bf6d68]" /></label>; }

function BrandMark() { return <span aria-hidden className="grid h-11 w-11 place-items-center rounded-full bg-[#ead1cb] text-[#a95c59]"><Store size={22} /></span>; }

function StatCard({ icon, label, value, change, subtle = false }: { icon: React.ReactNode; label: string; value: string; change: string; subtle?: boolean }) { return <article className="rounded-2xl border border-[#ede3df] bg-white p-4 shadow-sm"><div className="flex items-start gap-3"><span className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl ${subtle ? "bg-[#f3edea] text-[#8c7472]" : "bg-[#f6e7e3] text-[#b75f5b]"}`}>{icon}</span><div className="min-w-0"><p className="text-xs text-[#766c6e]">{label}</p><p className="mt-0.5 font-serif text-2xl font-bold sm:text-3xl">{value}</p></div></div><p className={`mt-3 flex items-center gap-1 text-xs font-semibold ${subtle ? "text-[#8c7472]" : "text-emerald-700"}`}><ArrowUpRight size={14} /> {change} <span className="font-normal text-[#8a8082]">vs last 30 days</span></p></article>; }

function Legend({ color, label, value }: { color: string; label: string; value: string }) { return <p className="flex min-w-32 items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} /><span className="flex-1 text-[#5f5659]">{label}</span><strong>{value}</strong></p>; }

function SectionTitle({ title, href = "#" }: { title: string; href?: string }) { return <div className="flex items-center justify-between"><h2 className="text-lg font-bold">{title}</h2><Link href={href} className="text-xs font-semibold text-[#aa5b57] underline">View all</Link></div>; }

function StatusBadge({ status }: { status: string }) { const colors: Record<string, string> = { Processing: "bg-orange-50 text-orange-700", Shipped: "bg-emerald-50 text-emerald-700", Pending: "bg-rose-50 text-rose-700", Delivered: "bg-green-50 text-green-700" }; return <span className={`rounded-full px-2.5 py-1 ${colors[status]}`}>{status}</span>; }

function ProductThumb({ position }: { position: string }) { return <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-[#f5e6e1]"><Image src="/images/belglow-hero-products.png" alt="" fill sizes="40px" className="scale-[2] object-cover" style={{ objectPosition: position }} /></span>; }
