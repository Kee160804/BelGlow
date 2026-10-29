"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, BadgePercent, CalendarDays, CheckCircle2, CreditCard, FileText, LoaderCircle, ReceiptText, Smartphone, WalletCards, X } from "lucide-react";
import { createClient } from "@/utils/supabase/client";

type CommissionEntry = {
  id: string;
  entry_type: "sale_commission" | "payment" | "adjustment" | "refund";
  amount_cents: number;
  description: string;
  created_at: string;
};

type PaymentMethod = "digiwallet" | "card";
type Tab = "overview" | "invoices" | "sales";

export default function SellerCommissionCenter() {
  const [entries, setEntries] = useState<CommissionEntry[]>([]);
  const [storeName, setStoreName] = useState("Your store");
  const [commissionBps, setCommissionBps] = useState(1000);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("overview");
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>("card");
  const [connecting, setConnecting] = useState(false);
  const [gatewayMessage, setGatewayMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError("Sign in again to view commission billing."); setLoading(false); return; }
    const { data: store, error: storeError } = await supabase.from("seller_stores").select("id, name, commission_rate_bps").eq("owner_id", user.id).maybeSingle();
    if (storeError || !store) { setError(storeError?.message || "No seller store is connected to this account."); setLoading(false); return; }
    setStoreName(store.name);
    const [entryResult, settingsResult] = await Promise.all([
      supabase.from("seller_commission_entries").select("id, entry_type, amount_cents, description, created_at").eq("seller_store_id", store.id).order("created_at", { ascending: false }),
      supabase.from("marketplace_settings").select("default_commission_bps").eq("singleton", true).maybeSingle(),
    ]);
    if (entryResult.error) setError(entryResult.error.message);
    else setEntries((entryResult.data ?? []) as CommissionEntry[]);
    setCommissionBps(store.commission_rate_bps ?? settingsResult.data?.default_commission_bps ?? 1000);
    setLoading(false);
  }, []);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  useEffect(() => {
    if (!paymentOpen) return;
    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`;
    return () => { document.body.style.overflow = previousOverflow; document.body.style.paddingRight = previousPaddingRight; };
  }, [paymentOpen]);

  const balance = entries.reduce((sum, entry) => sum + Number(entry.amount_cents), 0);
  const sales = entries.filter((entry) => entry.entry_type === "sale_commission");
  const payments = entries.filter((entry) => entry.entry_type === "payment");
  const totalCommission = sales.reduce((sum, entry) => sum + Number(entry.amount_cents), 0);
  const totalPaid = Math.abs(payments.reduce((sum, entry) => sum + Number(entry.amount_cents), 0));
  const dates = useMemo(() => billingDates(new Date()), []);
  const reference = `BG-COM-${dates.invoiceDate.getFullYear()}${String(dates.invoiceDate.getMonth() + 1).padStart(2, "0")}`;

  async function connectToGateway() {
    if (method === "digiwallet") return;
    setConnecting(true); setGatewayMessage("");
    try {
      const response = await fetch("/api/seller/commission-payment", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ expectedAmountCents: balance }) });
      const result = await response.json() as { error?: string; redirectUrl?: string };
      if (!response.ok || !result.redirectUrl) throw new Error(result.error || "The Belize Bank gateway is not configured yet.");
      window.location.assign(result.redirectUrl);
    } catch (paymentError) {
      setGatewayMessage(paymentError instanceof Error ? paymentError.message : "Unable to connect to the payment gateway.");
      setConnecting(false);
    }
  }

  if (loading) return <section className="rounded-2xl border border-[#ede3df] bg-white p-12 text-center"><LoaderCircle className="mx-auto animate-spin text-[#ef4b74]" /><p className="mt-3 text-sm text-[#817679]">Loading commission billing…</p></section>;

  return <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
    <div className="space-y-5">
      {error && <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={<WalletCards size={20} />} label="Current balance" value={money(balance)} detail={`From ${sales.length} completed ${sales.length === 1 ? "sale" : "sales"}`} />
        <Metric icon={<CalendarDays size={20} />} label="Next invoice" value={formatDate(dates.invoiceDate)} detail="Monthly billing cycle" />
        <Metric icon={<BadgePercent size={20} />} label="Commission rate" value={`${(commissionBps / 100).toFixed(0)}%`} detail="Per confirmed sale" />
        <Metric icon={<FileText size={20} />} label="Unpaid invoices" value={balance > 0 ? "1" : "0"} detail={balance > 0 ? "Current balance outstanding" : "Nothing due"} />
      </section>

      <section className="rounded-2xl border border-[#ede3df] bg-white shadow-sm">
        <nav className="flex gap-6 overflow-x-auto border-b border-[#eee3df] px-5" aria-label="Commission sections">{(["overview", "invoices", "sales"] as Tab[]).map((item) => <button key={item} onClick={() => setTab(item)} className={`shrink-0 border-b-2 px-1 py-4 text-xs font-bold capitalize ${tab === item ? "border-[#ef4b74] text-[#df3765]" : "border-transparent text-[#817679]"}`}>{item === "overview" ? "Commission overview" : item === "invoices" ? "Invoice history" : "Sales details"}</button>)}</nav>
        <div className="p-5">
          {tab === "overview" && <Overview balance={balance} sales={sales} dueDate={dates.dueDate} onPay={() => { setGatewayMessage(""); setPaymentOpen(true); }} />}
          {tab === "invoices" && <InvoiceHistory payments={payments} balance={balance} dueDate={dates.dueDate} reference={reference} onPay={() => { setGatewayMessage(""); setPaymentOpen(true); }} />}
          {tab === "sales" && <SalesDetails sales={sales} commissionBps={commissionBps} />}
        </div>
      </section>
    </div>

    <aside className="space-y-4">
      <section className="rounded-2xl border border-[#ede3df] bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-[.14em] text-[#817679]">Seller</p><h2 className="mt-2 font-bold">{storeName}</h2><p className="mt-1 text-xs text-[#817679]">Monthly commission billing</p></section>
      <section className="rounded-2xl border border-[#ede3df] bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><h2 className="font-bold">Commission summary</h2><span className="rounded-full bg-[#fff1f4] px-2.5 py-1 text-[10px] font-bold text-[#df3765]">{dates.period}</span></div><dl className="mt-4 space-y-3 text-sm"><SummaryRow label={`Completed sales (${sales.length})`} value={money(Math.round(totalCommission * 10000 / Math.max(commissionBps, 1)))} /><SummaryRow label={`Commission (${(commissionBps / 100).toFixed(0)}%)`} value={money(totalCommission)} /><SummaryRow label="Payments made" value={money(totalPaid)} /><div className="border-t border-[#eee3df] pt-3"><SummaryRow label="Balance due" value={money(balance)} strong /></div></dl><button disabled={balance <= 0} onClick={() => { setGatewayMessage(""); setPaymentOpen(true); }} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[#ef4b74] py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-45">Pay BelGlow commission <ArrowRight size={16} /></button></section>
      <section className="rounded-2xl border border-[#ede3df] bg-white p-5 text-sm shadow-sm"><p className="font-bold">How commission works</p><p className="mt-2 text-xs leading-5 text-[#75696b]">Confirmed sales add the BelGlow fee to this balance. BelGlow invoices the combined balance monthly so you do not pay card-processing costs on every individual sale.</p></section>
    </aside>

    {paymentOpen && <PaymentModal balance={balance} dueDate={dates.dueDate} reference={reference} method={method} setMethod={setMethod} connecting={connecting} gatewayMessage={gatewayMessage} onClose={() => { if (!connecting) setPaymentOpen(false); }} onContinue={() => void connectToGateway()} />}
  </div>;
}

function Overview({ balance, sales, dueDate, onPay }: { balance: number; sales: CommissionEntry[]; dueDate: Date; onPay: () => void }) {
  return <div className="space-y-5"><div className="grid gap-3 lg:grid-cols-[1.2fr_.8fr]"><div className="flex flex-wrap items-center justify-between gap-4 rounded-xl bg-[#fff2f5] p-4"><div><p className="text-xs font-bold text-[#817679]">Current outstanding balance</p><p className="mt-1 font-serif text-3xl font-bold">{money(balance)}</p></div><button disabled={balance <= 0} onClick={onPay} className="rounded-xl bg-[#ef4b74] px-6 py-3 text-sm font-bold text-white disabled:opacity-45"><CreditCard size={16} className="mr-2 inline" />Pay BelGlow commission</button></div><div className="rounded-xl bg-[#fff8f9] p-4"><p className="text-xs font-bold text-[#817679]">Payment due</p><p className="mt-1 font-bold">{formatDate(dueDate)}</p><p className="mt-1 text-xs text-[#df3765]">Monthly commission invoice</p></div></div><div><h3 className="text-sm font-bold">Commission entries</h3><EntryTable rows={sales.slice(0, 8)} /></div></div>;
}

function InvoiceHistory({ payments, balance, dueDate, reference, onPay }: { payments: CommissionEntry[]; balance: number; dueDate: Date; reference: string; onPay: () => void }) {
  return <div className="space-y-3">{balance > 0 && <article className="flex flex-wrap items-center gap-4 rounded-xl border border-amber-200 bg-amber-50 p-4"><ReceiptText className="text-amber-700" /><div className="min-w-0 flex-1"><p className="font-bold">{reference}</p><p className="mt-1 text-xs text-amber-900">Due {formatDate(dueDate)} · Current monthly commission</p></div><strong>{money(balance)}</strong><button onClick={onPay} className="rounded-lg bg-[#ef4b74] px-4 py-2 text-xs font-bold text-white">Pay now</button></article>}{payments.map((payment) => <article key={payment.id} className="flex items-center gap-4 rounded-xl border border-[#eadfdb] p-4"><CheckCircle2 className="text-emerald-600" /><div className="min-w-0 flex-1"><p className="font-bold">Commission payment</p><p className="mt-1 text-xs text-[#817679]">{payment.description} · {new Date(payment.created_at).toLocaleDateString()}</p></div><strong>{money(Math.abs(payment.amount_cents))}</strong></article>)}{balance <= 0 && !payments.length && <Empty text="Your commission invoices and payment receipts will appear here." />}</div>;
}

function SalesDetails({ sales, commissionBps }: { sales: CommissionEntry[]; commissionBps: number }) {
  return <div><h3 className="text-sm font-bold">Sales included in commission</h3><EntryTable rows={sales} commissionBps={commissionBps} />{!sales.length && <Empty text="Confirmed sales will appear here." />}</div>;
}

function EntryTable({ rows, commissionBps = 1000 }: { rows: CommissionEntry[]; commissionBps?: number }) {
  if (!rows.length) return <Empty text="No commission entries have been recorded yet." />;
  return <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead className="bg-[#f8f3f4] text-xs text-[#817679]"><tr><th className="px-3 py-2 font-semibold">Reference</th><th className="px-3 py-2 font-semibold">Date</th><th className="px-3 py-2 font-semibold">Estimated sale</th><th className="px-3 py-2 font-semibold">Commission</th><th className="px-3 py-2 font-semibold">Status</th></tr></thead><tbody>{rows.map((entry) => <tr key={entry.id} className="border-t border-[#eee5e1]"><td className="px-3 py-3 font-semibold">{entry.description.match(/#\d+/)?.[0] ?? entry.id.slice(0, 8)}</td><td className="px-3 py-3 text-[#75696b]">{new Date(entry.created_at).toLocaleDateString()}</td><td className="px-3 py-3">{money(Math.round(entry.amount_cents * 10000 / Math.max(commissionBps, 1)))}</td><td className="px-3 py-3 font-semibold">{money(entry.amount_cents)}</td><td className="px-3 py-3"><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">Completed</span></td></tr>)}</tbody></table></div>;
}

function PaymentModal({ balance, dueDate, reference, method, setMethod, connecting, gatewayMessage, onClose, onContinue }: { balance: number; dueDate: Date; reference: string; method: PaymentMethod; setMethod: (method: PaymentMethod) => void; connecting: boolean; gatewayMessage: string; onClose: () => void; onContinue: () => void }) {
  return <div className="fixed inset-0 z-[120] grid place-items-center overflow-hidden bg-[#211a1d]/45 p-3 backdrop-blur-[2px]" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section role="dialog" aria-modal="true" aria-labelledby="commission-payment-title" className="relative w-full max-w-md rounded-[24px] bg-white p-5 shadow-[0_30px_90px_rgba(55,31,39,.3)] sm:p-6"><button disabled={connecting} onClick={onClose} aria-label="Close payment" className="absolute right-4 top-4 rounded-full bg-[#fff1f3] p-2 text-[#9b514f] disabled:opacity-40"><X size={18} /></button>{connecting ? <div className="py-12 text-center"><LoaderCircle className="mx-auto animate-spin text-[#ef4b74]" size={38} /><h2 id="commission-payment-title" className="mt-5 text-xl font-black">Connecting securely…</h2><p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-[#75696b]">Connecting to Belize Bank’s hosted payment gateway. Card information will be entered only on the bank’s secure page.</p></div> : <><p className="text-xs font-bold uppercase tracking-[.16em] text-[#df3765]">BelGlow commission</p><h2 id="commission-payment-title" className="mt-2 text-2xl font-black">Pay BelGlow commission</h2><p className="mt-2 text-sm text-[#75696b]">Pay your outstanding monthly commission balance.</p><div className="mt-5 grid grid-cols-2 gap-3 rounded-xl bg-[#fff2f5] p-4 text-sm"><div><p className="text-xs text-[#817679]">Amount due</p><strong className="mt-1 block text-xl">{money(balance)}</strong></div><div><p className="text-xs text-[#817679]">Reference</p><strong className="mt-1 block text-xs">{reference}</strong><p className="mt-1 text-[10px] text-[#df3765]">Due {formatDate(dueDate)}</p></div></div><fieldset className="mt-5"><legend className="text-xs font-bold">Select payment method</legend><button type="button" onClick={() => setMethod("digiwallet")} className={`mt-2 flex w-full items-center gap-3 rounded-xl border p-3 text-left ${method === "digiwallet" ? "border-[#ef4b74] bg-[#fff2f5]" : "border-[#eadfdb]"}`}><span className="grid h-9 w-9 place-items-center rounded-lg bg-[#fff0f4] text-[#df3765]"><Smartphone size={19} /></span><span className="min-w-0 flex-1"><strong className="block text-sm">DigiWallet</strong><span className="text-xs text-[#817679]">Digital wallet payment</span></span><span className="rounded-full bg-[#fff0f4] px-2 py-1 text-[10px] font-bold text-[#df3765]">Coming soon</span></button>{method === "digiwallet" && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">DigiWallet payments are coming soon. Select Credit / Debit Card to continue today.</p>}<button type="button" onClick={() => setMethod("card")} className={`mt-2 flex w-full items-center gap-3 rounded-xl border p-3 text-left ${method === "card" ? "border-[#ef4b74] bg-[#fff2f5]" : "border-[#eadfdb]"}`}><span className="grid h-9 w-9 place-items-center rounded-lg bg-[#fff0f4] text-[#df3765]"><CreditCard size={19} /></span><span className="min-w-0 flex-1"><strong className="block text-sm">Credit / Debit Card</strong><span className="text-xs text-[#817679]">Continue securely to Belize Bank</span></span><span className={`h-4 w-4 rounded-full border-2 ${method === "card" ? "border-[5px] border-[#ef4b74]" : "border-[#b9afb3]"}`} /></button></fieldset>{gatewayMessage && <p role="alert" className="mt-4 rounded-xl bg-amber-50 p-3 text-sm leading-5 text-amber-900">{gatewayMessage}</p>}<div className="mt-5 flex gap-3"><button type="button" onClick={onClose} className="flex-1 rounded-xl border border-[#eadfdb] py-3 text-sm font-bold">Cancel</button><button disabled={method === "digiwallet" || balance <= 0} onClick={onContinue} className="flex-[1.5] rounded-xl bg-[#ef4b74] py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-45">Continue <ArrowRight size={16} className="ml-1 inline" /></button></div><p className="mt-4 text-center text-[11px] leading-5 text-[#817679]">BelGlow never collects or stores your card number, security code, PIN, or online-banking credentials.</p></>}</section></div>;
}

function Metric({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: string; detail: string }) { return <article className="rounded-2xl border border-[#ede3df] bg-white p-4 shadow-sm"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#fff0f4] text-[#df3765]">{icon}</span><p className="mt-3 text-xs font-bold text-[#817679]">{label}</p><p className="mt-1 text-xl font-black">{value}</p><p className="mt-1 text-[11px] text-[#817679]">{detail}</p></article>; }
function SummaryRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) { return <div className={`flex justify-between gap-3 ${strong ? "font-black text-[#df3765]" : ""}`}><dt>{label}</dt><dd>{value}</dd></div>; }
function Empty({ text }: { text: string }) { return <p className="mt-4 rounded-xl bg-[#faf6f4] p-5 text-center text-sm text-[#817679]">{text}</p>; }
function money(cents: number) { return `BZ$${(Math.max(0, cents) / 100).toFixed(2)}`; }
function formatDate(date: Date) { return new Intl.DateTimeFormat("en-BZ", { month: "short", day: "numeric", year: "numeric" }).format(date); }
function billingDates(now: Date) { const invoiceDate = new Date(now.getFullYear(), now.getMonth() + 1, 1); const dueDate = new Date(now.getFullYear(), now.getMonth() + 1, 7); return { invoiceDate, dueDate, period: new Intl.DateTimeFormat("en-BZ", { month: "long", year: "numeric" }).format(now) }; }
