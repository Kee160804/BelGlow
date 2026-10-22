import type { Metadata } from "next";
import Link from "next/link";
import SiteHeader from "@/components/layout/SiteHeader";
import { policies } from "@/lib/policies";

export const metadata: Metadata = { title: "Marketplace Policies | BelGlow", description: "Read BelGlow marketplace, seller, delivery, return, product, and privacy policies." };
export default function PoliciesPage() { return <main className="min-h-screen bg-[#fffdfd]"><SiteHeader /><section className="bg-[#fff1f5] px-5 py-16 text-center"><h1 className="text-5xl font-black tracking-[-.05em]">Marketplace policies</h1><p className="mx-auto mt-4 max-w-2xl text-[#706469]">Clear expectations for shoppers, sellers, products, fulfillment, and marketplace support.</p></section><section className="mx-auto grid max-w-6xl gap-4 px-5 py-12 sm:grid-cols-2 sm:px-10">{Object.entries(policies).map(([slug, policy]) => <Link key={slug} href={`/policies/${slug}`} className="rounded-[22px] border border-[#ecdce1] bg-white p-6 transition hover:-translate-y-1 hover:shadow-lg"><h2 className="text-xl font-black">{policy.title}</h2><p className="mt-2 text-sm leading-6 text-[#776b70]">{policy.summary}</p><span className="mt-5 inline-block text-sm font-bold text-[#df3c69]">Read policy →</span></Link>)}</section></main>; }
