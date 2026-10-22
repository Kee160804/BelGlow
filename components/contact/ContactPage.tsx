"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import {
  ArrowRight,
  BadgeHelp,
  CheckCircle2,
  Clock3,
  LoaderCircle,
  MessageCircleMore,
  PackageSearch,
  Send,
  Store,
} from "lucide-react";
import SiteHeader from "@/components/layout/SiteHeader";

type SubmissionResult = { error?: string; reference?: string };

const fieldClass = "mt-2 w-full rounded-xl border border-[#e7d9de] bg-white px-4 text-sm outline-none transition focus:border-[#ef4b74] focus:ring-4 focus:ring-[#ef4b74]/10";

export default function ContactPage() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SubmissionResult>({});

  async function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setResult({});

    const form = event.currentTarget;
    const body = Object.fromEntries(new FormData(form));

    try {
      const response = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json() as SubmissionResult;
      if (!response.ok) throw new Error(data.error || "Your request could not be sent.");
      setResult({ reference: data.reference });
      form.reset();
    } catch (error) {
      setResult({ error: error instanceof Error ? error.message : "Your request could not be sent." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen p-0 sm:p-5 lg:p-8">
      <div className="mx-auto min-h-screen max-w-[1440px] overflow-hidden bg-[#fffdfd] shadow-[0_28px_90px_rgba(107,44,62,.16)] sm:rounded-[28px]">
        <SiteHeader />

        <section className="relative isolate overflow-hidden bg-[linear-gradient(120deg,#fff8fa_0%,#f9dce5_58%,#f3bdcc_100%)] px-5 py-16 sm:px-10 lg:px-16 lg:py-24">
          <div className="absolute -left-24 -top-28 h-80 w-80 rounded-full border-[38px] border-white/25" />
          <div className="absolute -bottom-32 right-[8%] h-96 w-96 rounded-full bg-white/25 blur-2xl" />
          <div className="relative mx-auto max-w-3xl text-center">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-white/80 text-[#e63e6b] shadow-sm"><MessageCircleMore size={28} /></span>
            <p className="mt-6 text-xs font-bold uppercase tracking-[.28em] text-[#d73563]">BelGlow support</p>
            <h1 className="mt-4 text-4xl font-black tracking-[-.05em] text-[#211a1d] sm:text-6xl">How can we help?</h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-[#65575d] sm:text-lg">Tell us what is getting in the way. Whether you are shopping, managing a store, or just have a question, we will get your request to the right place.</p>
          </div>
        </section>

        <section className="px-5 py-10 sm:px-10 lg:px-16 lg:py-14">
          <div className="grid gap-4 md:grid-cols-3">
            <HelpCard icon={<PackageSearch />} title="Order help" text="Check an order, delivery, cancellation, or refund request." href="/account" action="View my orders" />
            <HelpCard icon={<Store />} title="Seller help" text="Get help with products, orders, payouts, or your storefront." href="/dashboard" action="Open seller dashboard" />
            <HelpCard icon={<BadgeHelp />} title="Product questions" text="Ask about an item before you buy or report a listing issue." href="#contact-form" action="Send a question" />
          </div>

          <div className="mt-12 grid gap-8 lg:grid-cols-[.8fr_1.2fr] lg:items-start">
            <aside className="rounded-[28px] bg-[#2c2025] p-7 text-white sm:p-9">
              <p className="text-xs font-bold uppercase tracking-[.24em] text-[#f59ab2]">Before you send</p>
              <h2 className="mt-3 text-3xl font-black tracking-[-.04em]">A little detail helps us solve things faster.</h2>
              <div className="mt-7 space-y-5 text-sm leading-6 text-[#e8dde1]">
                <Tip text="Include your order number when your question is about a purchase." />
                <Tip text="Sellers should include the store name and the affected product or order." />
                <Tip text="Never send passwords, card numbers, or other sensitive payment details." />
              </div>
              <div className="mt-8 flex items-center gap-3 rounded-2xl bg-white/8 p-4">
                <Clock3 className="shrink-0 text-[#f58eaa]" size={22} />
                <p className="text-sm"><strong className="block text-white">Support requests are tracked</strong><span className="text-[#d5c6cb]">You will receive a reference after submitting.</span></p>
              </div>
            </aside>

            <section id="contact-form" className="scroll-mt-28 rounded-[28px] border border-[#efdee3] bg-white p-6 shadow-[0_16px_45px_rgba(90,39,54,.07)] sm:p-9">
              <p className="text-xs font-bold uppercase tracking-[.24em] text-[#e43f6b]">Contact us</p>
              <h2 className="mt-2 text-3xl font-black tracking-[-.04em]">Send a support request</h2>
              <p className="mt-2 text-sm leading-6 text-[#75696e]">Complete the form and keep the confirmation reference for your records.</p>

              {result.reference ? (
                <div role="status" className="mt-7 rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-emerald-950">
                  <CheckCircle2 size={28} className="text-emerald-600" />
                  <h3 className="mt-3 text-lg font-bold">Your request was received.</h3>
                  <p className="mt-1 text-sm">Reference: <strong>{result.reference}</strong></p>
                  <button onClick={() => setResult({})} className="mt-4 text-sm font-bold underline underline-offset-4">Send another request</button>
                </div>
              ) : (
                <form onSubmit={submitRequest} className="mt-7 grid gap-5 sm:grid-cols-2">
                  <label className="text-sm font-semibold">I am a
                    <select name="requesterType" required defaultValue="shopper" className={`${fieldClass} h-12`}>
                      <option value="shopper">Shopper</option><option value="seller">Seller</option><option value="visitor">Visitor</option>
                    </select>
                  </label>
                  <label className="text-sm font-semibold">Help topic
                    <select name="topic" required defaultValue="order" className={`${fieldClass} h-12`}>
                      <option value="order">Order or delivery</option><option value="account">Account access</option><option value="product">Product or listing</option><option value="seller">Selling on BelGlow</option><option value="payment">Payment or refund</option><option value="other">Something else</option>
                    </select>
                  </label>
                  <label className="text-sm font-semibold">Name<input name="name" required maxLength={100} autoComplete="name" className={`${fieldClass} h-12`} /></label>
                  <label className="text-sm font-semibold">Email<input name="email" type="email" required maxLength={254} autoComplete="email" className={`${fieldClass} h-12`} /></label>
                  <label className="text-sm font-semibold sm:col-span-2">Order number <span className="font-normal text-[#918589]">(optional)</span><input name="orderNumber" maxLength={40} placeholder="For example, BG-10428" className={`${fieldClass} h-12`} /></label>
                  <label className="text-sm font-semibold sm:col-span-2">Subject<input name="subject" required minLength={4} maxLength={140} className={`${fieldClass} h-12`} /></label>
                  <label className="text-sm font-semibold sm:col-span-2">How can we help?<textarea name="message" required minLength={20} maxLength={4000} rows={6} placeholder="Describe what happened and what you need help with." className={`${fieldClass} py-3`} /></label>
                  <div className="hidden" aria-hidden="true"><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
                  {result.error && <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 sm:col-span-2">{result.error}</p>}
                  <button disabled={busy} className="flex h-12 items-center justify-center gap-2 rounded-full bg-[#ef4b74] px-6 font-bold text-white shadow-[0_10px_24px_rgba(239,75,116,.2)] transition hover:bg-[#db315f] disabled:cursor-not-allowed disabled:opacity-55 sm:col-span-2 sm:justify-self-start">
                    {busy ? <LoaderCircle size={18} className="animate-spin" /> : <Send size={18} />}{busy ? "Sending request…" : "Send request"}
                  </button>
                </form>
              )}
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}

function HelpCard({ icon, title, text, href, action }: { icon: React.ReactNode; title: string; text: string; href: string; action: string }) {
  return <article className="flex flex-col rounded-[24px] border border-[#efdee3] bg-white p-6"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#fff0f4] text-[#ef4b74]">{icon}</span><h2 className="mt-5 text-xl font-black">{title}</h2><p className="mt-2 flex-1 text-sm leading-6 text-[#796d71]">{text}</p><Link href={href} className="mt-5 flex items-center gap-2 border-t border-[#f3e7ea] pt-4 text-sm font-bold text-[#e43f6b]">{action} <ArrowRight size={16} /></Link></article>;
}

function Tip({ text }: { text: string }) {
  return <p className="flex gap-3"><CheckCircle2 className="mt-0.5 shrink-0 text-[#f58eaa]" size={18} /><span>{text}</span></p>;
}
