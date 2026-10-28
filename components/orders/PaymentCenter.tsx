"use client";

import { FormEvent, useState } from "react";
import { Building2, CheckCircle2, Clock3, Copy, LoaderCircle, UploadCloud, XCircle } from "lucide-react";

export type PaymentSeller = {
  sellerOrderId: string;
  storeName: string;
  amountCents: number;
  paymentStatus: "awaiting_payment" | "under_review" | "confirmed" | "rejected";
  bankName: string;
  accountName: string;
  accountNumber: string;
  accountType?: string | null;
  instructions?: string | null;
  submission?: { id: string; status: string; filename: string; submittedAt: string; rejectionReason?: string | null } | null;
};

export type PaymentOrder = {
  orderId: string;
  orderNumber: number;
  email: string;
  totalCents: number;
  paymentStatus: string;
  sellers: PaymentSeller[];
};

export default function PaymentCenter({ initialOrder = null, initialEmail = "", lookupOnly = false }: { initialOrder?: PaymentOrder | null; initialEmail?: string; lookupOnly?: boolean }) {
  const [order, setOrder] = useState<PaymentOrder | null>(initialOrder);
  const [email, setEmail] = useState(initialEmail);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function lookup(event?: FormEvent<HTMLFormElement>, knownOrderNumber?: number) {
    event?.preventDefault();
    const form = event ? new FormData(event.currentTarget) : null;
    const orderNumber = knownOrderNumber ?? Number(form?.get("orderNumber"));
    const lookupEmail = String(form?.get("email") ?? email).trim();
    setBusy("lookup"); setError(""); setNotice("");
    try {
      const response = await fetch("/api/orders/payment", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ orderNumber, email: lookupEmail }) });
      const result = await response.json() as { error?: string; order?: PaymentOrder };
      if (!response.ok || !result.order) throw new Error(result.error || "Unable to load payment details.");
      setEmail(lookupEmail); setOrder(result.order);
    } catch (lookupError) { setError(lookupError instanceof Error ? lookupError.message : "Unable to load payment details."); }
    finally { setBusy(""); }
  }

  async function upload(event: FormEvent<HTMLFormElement>, seller: PaymentSeller) {
    event.preventDefault();
    if (!order) return;
    const form = new FormData(event.currentTarget);
    form.set("orderNumber", String(order.orderNumber)); form.set("email", email || order.email); form.set("sellerOrderId", seller.sellerOrderId);
    setBusy(seller.sellerOrderId); setError(""); setNotice("");
    try {
      const response = await fetch("/api/orders/payment-receipt", { method: "POST", body: form });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Unable to upload the receipt.");
      setNotice(`Receipt sent to ${seller.storeName} for verification.`);
      await lookup(undefined, order.orderNumber);
    } catch (uploadError) { setError(uploadError instanceof Error ? uploadError.message : "Unable to upload the receipt."); }
    finally { setBusy(""); }
  }

  if (!order || lookupOnly) return <section className="rounded-[24px] border border-[#eadfdb] bg-white p-6 shadow-sm sm:p-8">
    <h2 className="text-2xl font-black">Find your payment instructions</h2><p className="mt-2 text-sm text-[#75696b]">Use the order number and the same email entered at checkout.</p>
    <form onSubmit={lookup} className="mt-5 grid gap-4 sm:grid-cols-2"><label className="text-sm font-bold">Order number<input name="orderNumber" inputMode="numeric" required className="mt-2 h-12 w-full rounded-xl border border-[#e7dade] px-4 font-normal" /></label><label className="text-sm font-bold">Checkout email<input name="email" type="email" required defaultValue={email} className="mt-2 h-12 w-full rounded-xl border border-[#e7dade] px-4 font-normal" /></label><button disabled={busy === "lookup"} className="flex items-center justify-center gap-2 rounded-full bg-[#ef4b74] py-3.5 font-bold text-white disabled:opacity-50 sm:col-span-2">{busy === "lookup" && <LoaderCircle size={18} className="animate-spin" />}Load payment details</button></form>
    {error && <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    {order && <div className="mt-6"><PaymentCards order={order} busy={busy} onUpload={upload} /></div>}
  </section>;

  return <div>{error && <p role="alert" className="mb-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}{notice && <p role="status" className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}<PaymentCards order={order} busy={busy} onUpload={upload} /></div>;
}

function PaymentCards({ order, busy, onUpload }: { order: PaymentOrder; busy: string; onUpload: (event: FormEvent<HTMLFormElement>, seller: PaymentSeller) => void }) {
  return <div className="space-y-4"><div className="rounded-2xl bg-[#fff5f7] p-4 text-sm text-[#6f6468]"><strong className="text-[#292527]">Order #{order.orderNumber}</strong><p className="mt-1">A multi-seller order requires one transfer per seller. Use the exact amount and upload the matching receipt below.</p></div>{order.sellers.map((seller) => <article key={seller.sellerOrderId} className="rounded-2xl border border-[#eadfdb] bg-white p-5 text-left"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="flex items-center gap-2 font-black"><Building2 size={18} className="text-[#df3c69]" />{seller.storeName}</p><p className="mt-1 text-sm text-[#75696b]">Transfer exactly <strong className="text-[#292527]">BZ${(seller.amountCents / 100).toFixed(2)}</strong></p></div><PaymentBadge status={seller.paymentStatus} /></div><dl className="mt-4 grid gap-3 rounded-xl bg-[#fbf6f4] p-4 text-sm sm:grid-cols-2"><BankRow label="Bank" value={seller.bankName} /><BankRow label="Account name" value={seller.accountName} /><BankRow label="Account number" value={seller.accountNumber} copy /><BankRow label="Account type" value={seller.accountType || "Contact seller if required"} /></dl>{seller.instructions && <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">{seller.instructions}</p>}{seller.paymentStatus === "confirmed" ? <p className="mt-4 flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-800"><CheckCircle2 size={18} />The seller confirmed this payment.</p> : seller.paymentStatus === "under_review" ? <p className="mt-4 flex items-center gap-2 rounded-xl bg-sky-50 p-3 text-sm font-bold text-sky-800"><Clock3 size={18} />Receipt uploaded and awaiting seller verification.</p> : <form onSubmit={(event) => onUpload(event, seller)} className="mt-4 rounded-xl border border-dashed border-[#e3b7c3] p-4"><p className="text-sm font-bold">{seller.paymentStatus === "rejected" ? "Upload a replacement receipt" : "Upload payment receipt"}</p>{seller.submission?.rejectionReason && <p className="mt-2 flex gap-2 text-sm text-rose-700"><XCircle size={17} className="mt-0.5 shrink-0" />{seller.submission.rejectionReason}</p>}<div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto]"><input name="receipt" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" required className="min-w-0 rounded-lg border border-[#e7dade] p-2 text-xs" /><input name="reference" maxLength={200} placeholder="Transfer reference (optional)" className="h-11 rounded-lg border border-[#e7dade] px-3 text-sm" /><button disabled={Boolean(busy)} className="flex items-center justify-center gap-2 rounded-lg bg-[#ef4b74] px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{busy === seller.sellerOrderId ? <LoaderCircle size={17} className="animate-spin" /> : <UploadCloud size={17} />}Submit</button></div><p className="mt-2 text-xs text-[#817679]">JPG, PNG, WebP, or PDF · maximum 5 MB. Do not upload card numbers, PINs, or passwords.</p></form>}</article>)}</div>;
}

function PaymentBadge({ status }: { status: PaymentSeller["paymentStatus"] }) { const styles = status === "confirmed" ? "bg-emerald-50 text-emerald-700" : status === "under_review" ? "bg-sky-50 text-sky-700" : status === "rejected" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700"; return <span className={`rounded-full px-3 py-1 text-xs font-bold capitalize ${styles}`}>{status.replaceAll("_", " ")}</span>; }
function BankRow({ label, value, copy = false }: { label: string; value: string; copy?: boolean }) { return <div><dt className="text-xs font-bold uppercase tracking-[.1em] text-[#817679]">{label}</dt><dd className="mt-1 flex items-center gap-2 font-semibold">{value}{copy && <button type="button" onClick={() => void navigator.clipboard.writeText(value)} aria-label="Copy account number" className="rounded-md p-1 text-[#df3c69]"><Copy size={15} /></button>}</dd></div>; }
