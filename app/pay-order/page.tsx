import type { Metadata } from "next";
import SiteHeader from "@/components/layout/SiteHeader";
import PaymentCenter from "@/components/orders/PaymentCenter";

export const metadata: Metadata = { title: "Pay for an order | BelGlow", description: "View seller bank transfer details and submit payment receipts." };

export default function PayOrderPage() {
  return <main className="min-h-screen bg-[#fff8fa]"><SiteHeader /><section className="bg-[linear-gradient(120deg,#fff7f9,#f7d8e1)] px-5 py-14 text-center"><p className="text-xs font-bold uppercase tracking-[.2em] text-[#df3c69]">Secure seller payment</p><h1 className="mt-3 text-4xl font-black tracking-[-.04em] sm:text-5xl">Bank transfer and receipt</h1><p className="mx-auto mt-4 max-w-2xl text-sm leading-6 text-[#706469]">Your payment goes directly to each business. BelGlow does not receive or hold the product payment.</p></section><section className="mx-auto max-w-4xl px-5 py-10"><PaymentCenter lookupOnly /></section></main>;
}
