"use client";

import { FormEvent, useState } from "react";
import { applyForSeller } from "./actions";

export default function SellerApplicationForm({ accountEmail, accountPhone }: { accountEmail: string; accountPhone: string }) {
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [contactMode, setContactMode] = useState<"account" | "business">("account");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const result = await applyForSeller(new FormData(event.currentTarget));
    setBusy(false);
    if (result.error) setError(result.error);
    else setSubmitted(true);
  }

  if (submitted) return <div className="mt-7 rounded-2xl bg-emerald-50 p-5 text-sm leading-6 text-emerald-800" role="status"><strong>Application received.</strong> Your store is pending review. You can add products after BelGlow approves the application.</div>;

  return <form onSubmit={submit} className="mt-7 space-y-4">
    <label className="block text-sm font-semibold">Store name<input name="storeName" required minLength={2} maxLength={80} placeholder="Your business name" className="mt-2 h-12 w-full rounded-xl border border-[#ddd3d0] bg-[#fcfaf9] px-4 font-normal" /></label>
    <label className="block text-sm font-semibold">Store description<textarea name="description" maxLength={2000} rows={4} placeholder="What do you sell?" className="mt-2 w-full rounded-xl border border-[#ddd3d0] bg-[#fcfaf9] p-4 font-normal" /></label>
    <label className="block text-sm font-semibold">Business contact details<select name="contactMode" value={contactMode} onChange={(event) => setContactMode(event.target.value as "account" | "business")} className="mt-2 h-12 w-full rounded-xl border border-[#ddd3d0] bg-[#fcfaf9] px-4 font-normal"><option value="account">Use my account email and phone</option><option value="business">Use a different business email and phone</option></select></label>
    {contactMode === "account" ? <div className="rounded-2xl bg-[#f8f2ef] p-4 text-sm leading-6 text-[#6f6264]"><p><strong className="text-[#352d30]">Email:</strong> {accountEmail}</p><p><strong className="text-[#352d30]">Phone:</strong> {accountPhone || "No phone saved on this account"}</p>{!accountPhone && <p className="mt-2 text-xs">Your account email will be used. Choose the business-contact option if customers should also have a phone number.</p>}</div> : <div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm font-semibold">Business email<input name="supportEmail" type="email" required maxLength={254} autoComplete="email" placeholder="store@example.com" className="mt-2 h-12 w-full rounded-xl border border-[#ddd3d0] bg-[#fcfaf9] px-4 font-normal" /></label><label className="block text-sm font-semibold">Business phone<input name="supportPhone" type="tel" required maxLength={40} autoComplete="tel" placeholder="+501" className="mt-2 h-12 w-full rounded-xl border border-[#ddd3d0] bg-[#fcfaf9] px-4 font-normal" /></label></div>}
    {error && <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
    <button disabled={busy} className="w-full rounded-xl bg-[#bf6d68] px-5 py-3.5 font-bold text-white disabled:opacity-50">{busy ? "Submitting…" : "Submit seller application"}</button>
  </form>;
}
