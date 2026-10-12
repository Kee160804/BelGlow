"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShieldCheck, ShoppingBag, Store, UserRound } from "lucide-react";

export type DashboardRole = "shopper" | "seller" | "admin";

export default function DashboardSwitcher({ role, className = "" }: { role: DashboardRole; className?: string }) {
  const pathname = usePathname();
  const tabs = [
    { label: "Customer", href: "/account", active: pathname === "/account", icon: UserRound },
    { label: "Seller", href: role === "shopper" ? "/seller-application" : "/dashboard", active: pathname === "/seller-application" || pathname.startsWith("/dashboard"), icon: Store },
    ...(role === "admin" ? [{ label: "Admin", href: "/admin", active: pathname.startsWith("/admin"), icon: ShieldCheck }] : []),
    { label: "Store", href: "/", active: false, icon: ShoppingBag },
  ];

  return <nav aria-label="Switch dashboard" className={`flex w-fit max-w-full items-center gap-1 overflow-x-auto rounded-xl border border-[#dfd4d1] bg-[#f7f2f0] p-1 ${className}`}>
    {tabs.map(({ label, href, active, icon: Icon }) => <Link key={label} href={href} aria-current={active ? "page" : undefined} className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition sm:px-4 ${active ? "bg-[#2c2528] text-white shadow-sm" : "text-[#6f6265] hover:bg-white hover:text-[#a65552]"}`}><Icon size={15} /> {label}</Link>)}
  </nav>;
}
