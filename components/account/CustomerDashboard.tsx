"use client";

import Link from "next/link";
import { ArrowRight, Heart, LogOut, MapPin, PackageCheck, ShoppingBag, UserRound } from "lucide-react";
import SiteHeader from "@/components/layout/SiteHeader";
import { useStore } from "@/components/providers/StoreProvider";
import DashboardSwitcher, { type DashboardRole } from "@/components/dashboard/DashboardSwitcher";

type CustomerOrder = {
  id: string;
  order_number: number;
  status: string;
  payment_status: string;
  fulfillment_status: string;
  total_cents: number;
  placed_at: string;
};

type CustomerAddress = {
  id: string;
  label: string;
  address_line_1: string;
  city: string;
  district: string | null;
  is_default: boolean;
};

export default function CustomerDashboard({
  name,
  email,
  role,
  orders,
  addresses,
}: {
  name: string;
  email: string;
  role: DashboardRole;
  orders: CustomerOrder[];
  addresses: CustomerAddress[];
}) {
  const { favoriteIds, openWishlist, signOut } = useStore();
  const firstName = name.trim().split(/\s+/)[0] || "there";

  return (
    <main className="min-h-screen bg-[#fbf6f4]">
      <SiteHeader />
      <section className="border-b border-[#eadfdb] bg-[radial-gradient(circle_at_top_left,#ffe8ee,transparent_45%),linear-gradient(135deg,#fffaf8,#f5e7e2)] px-5 py-10 sm:px-8 lg:px-16 lg:py-14">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <DashboardSwitcher role={role} className="mb-6" />
            <p className="text-xs font-bold uppercase tracking-[.22em] text-[#d8446e]">My BelGlow account</p>
            <h1 className="mt-3 font-serif text-4xl font-semibold tracking-[-.03em] sm:text-5xl">Welcome, {firstName}</h1>
            <p className="mt-3 text-sm text-[#75696b]">Track orders, revisit saved beauty finds, and manage your account.</p>
          </div>
          <button onClick={() => void signOut()} className="inline-flex w-fit items-center gap-2 rounded-full border border-[#d9c7c3] bg-white px-5 py-3 text-sm font-bold text-[#8f514f] shadow-sm transition hover:border-[#c98d8b] hover:bg-[#fff8f6]"><LogOut size={17} /> Sign out</button>
        </div>
      </section>

      <div className="mx-auto grid max-w-7xl gap-6 px-5 py-8 sm:px-8 lg:grid-cols-[1fr_340px] lg:px-16 lg:py-10">
        <div className="space-y-6">
          <section className="grid gap-4 sm:grid-cols-3">
            <SummaryCard icon={<ShoppingBag size={20} />} label="Orders" value={String(orders.length)} detail="Placed with this account" />
            <SummaryCard icon={<Heart size={20} />} label="Saved items" value={String(favoriteIds.length)} detail="Ready to revisit" />
            <SummaryCard icon={<MapPin size={20} />} label="Addresses" value={String(addresses.length)} detail="Saved delivery locations" />
          </section>

          <section className="rounded-[24px] border border-[#eadfdb] bg-white p-5 shadow-sm sm:p-7">
            <div className="flex items-center justify-between gap-4">
              <div><p className="text-xs font-bold uppercase tracking-[.18em] text-[#b55f5c]">Purchase history</p><h2 className="mt-1 text-xl font-bold">Recent orders</h2></div>
              <Link href="/shop" className="inline-flex items-center gap-1 text-sm font-bold text-[#b05a58]">Continue shopping <ArrowRight size={16} /></Link>
            </div>
            {orders.length ? <div className="mt-5 divide-y divide-[#eee5e1]">{orders.map((order) => <article key={order.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#fff1f3] text-[#d8446e]"><PackageCheck size={21} /></span>
              <div className="min-w-0 flex-1"><p className="font-bold">Order #{order.order_number}</p><p className="mt-1 text-xs text-[#817679]">{new Date(order.placed_at).toLocaleDateString()} · {order.fulfillment_status.replaceAll("_", " ")}</p></div>
              <div className="sm:text-right"><p className="font-bold">BZ${(order.total_cents / 100).toFixed(2)}</p><p className="mt-1 text-xs capitalize text-[#817679]">{order.payment_status.replaceAll("_", " ")} · {order.status.replaceAll("_", " ")}</p></div>
            </article>)}</div> : <div className="mt-5 rounded-2xl bg-[#fbf6f4] p-7 text-center"><ShoppingBag className="mx-auto text-[#d98a86]" /><p className="mt-3 font-bold">No orders yet</p><p className="mt-1 text-sm text-[#756a6d]">Your BelGlow purchases will appear here.</p><Link href="/shop" className="mt-4 inline-flex rounded-full bg-[#ef4b74] px-5 py-2.5 text-sm font-bold text-white">Explore the shop</Link></div>}
          </section>
        </div>

        <aside className="space-y-6">
          <section className="rounded-[24px] border border-[#eadfdb] bg-white p-6 shadow-sm">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-[#282326] font-serif text-xl text-white">{name.charAt(0).toUpperCase()}</span>
            <h2 className="mt-4 text-lg font-bold">{name}</h2>
            <p className="mt-1 break-all text-sm text-[#756a6d]">{email}</p>
            <div className="mt-5 border-t border-[#eee5e1] pt-5"><p className="flex items-center gap-2 text-sm font-semibold"><UserRound size={17} className="text-[#b55f5c]" /> Customer account</p></div>
          </section>

          <section className="rounded-[24px] border border-[#eadfdb] bg-white p-6 shadow-sm">
            <h2 className="font-bold">Quick actions</h2>
            <button onClick={openWishlist} className="mt-4 flex w-full items-center justify-between rounded-xl bg-[#fff5f6] px-4 py-3 text-left text-sm font-bold text-[#9b514f]"><span className="flex items-center gap-2"><Heart size={17} /> View saved items</span><ArrowRight size={16} /></button>
            <Link href="/seller-application" className="mt-3 flex items-center justify-between rounded-xl border border-[#eadfdb] px-4 py-3 text-sm font-bold text-[#5f5557]"><span>Apply to sell</span><ArrowRight size={16} /></Link>
          </section>

          <section className="rounded-[24px] border border-[#eadfdb] bg-white p-6 shadow-sm">
            <h2 className="font-bold">Delivery addresses</h2>
            {addresses.length ? <div className="mt-3 space-y-3">{addresses.map((address) => <div key={address.id} className="rounded-xl bg-[#fbf6f4] p-4 text-sm"><div className="flex items-center gap-2 font-bold"><MapPin size={15} className="text-[#b55f5c]" /> {address.label}{address.is_default && <span className="rounded-full bg-white px-2 py-0.5 text-[10px] uppercase text-[#a35754]">Default</span>}</div><p className="mt-2 leading-5 text-[#756a6d]">{address.address_line_1}<br />{address.city}{address.district ? `, ${address.district}` : ""}</p></div>)}</div> : <p className="mt-3 rounded-xl bg-[#fbf6f4] p-4 text-sm leading-6 text-[#756a6d]">No delivery address has been saved yet.</p>}
          </section>
        </aside>
      </div>
    </main>
  );
}

function SummaryCard({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: string; detail: string }) {
  return <article className="rounded-[22px] border border-[#eadfdb] bg-white p-5 shadow-sm"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#fff0f3] text-[#d8446e]">{icon}</span><p className="mt-4 text-xs font-bold uppercase tracking-[.14em] text-[#817679]">{label}</p><p className="mt-1 text-3xl font-black">{value}</p><p className="mt-1 text-xs text-[#817679]">{detail}</p></article>;
}
