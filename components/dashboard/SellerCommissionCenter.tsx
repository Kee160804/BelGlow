"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDownToLine, ArrowRight, BadgePercent, CalendarDays, CheckCircle2, CreditCard, FileText, LoaderCircle, Printer, ReceiptText, Smartphone, WalletCards, X } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { readSellerCommissionLedger, sellerCommissionBalance, type SellerCommissionLedgerEntry } from "@/lib/seller-commission-ledger";

type CommissionEntry = SellerCommissionLedgerEntry;

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
  const [returnNotice, setReturnNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError("Sign in again to view commission billing."); setLoading(false); return; }
    const { data: store, error: storeError } = await supabase.from("seller_stores").select("id, name, commission_rate_bps").eq("owner_id", user.id).maybeSingle();
    if (storeError || !store) { setError(storeError?.message || "No seller store is connected to this account."); setLoading(false); return; }
    setStoreName(store.name);
    const [entryResult, settingsResult] = await Promise.all([
      readSellerCommissionLedger(store.id),
      supabase.from("marketplace_settings").select("default_commission_bps").eq("singleton", true).maybeSingle(),
    ]);
    if (entryResult.error) setError(entryResult.error.message);
    else setEntries(entryResult.entries);
    setCommissionBps(store.commission_rate_bps ?? settingsResult.data?.default_commission_bps ?? 1000);
    setLoading(false);
  }, []);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  useEffect(() => {
    const url = new URL(window.location.href);
    const status = url.searchParams.get("commission_payment");
    if (!status) return;
    const notice = status === "paid"
      ? "Belize Bank confirmed your commission payment. Your balance has been updated."
      : status === "failed"
        ? "The bank did not complete the payment. Your commission balance is still due."
        : "The payment is still being verified by Belize Bank. Refresh this page in a moment.";
    url.searchParams.delete("commission_payment");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    const timer = window.setTimeout(() => { setReturnNotice(notice); void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  useEffect(() => {
    if (!paymentOpen) return;
    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`;
    return () => { document.body.style.overflow = previousOverflow; document.body.style.paddingRight = previousPaddingRight; };
  }, [paymentOpen]);

  const balance = sellerCommissionBalance(entries);
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
      const response = await fetch("/api/seller/commission-payment", { method: "POST" });
      const result = await response.json() as { error?: string; redirectUrl?: string };
      if (!response.ok || !result.redirectUrl) throw new Error(result.error || "The Belize Bank gateway is not configured yet.");
      window.location.assign(result.redirectUrl);
    } catch (paymentError) {
      setGatewayMessage(paymentError instanceof Error ? paymentError.message : "Unable to connect to the payment gateway.");
      setConnecting(false);
    }
  }

  if (loading) return <section className="rounded-2xl border border-[#ede3df] bg-white p-12 text-center"><LoaderCircle className="mx-auto animate-spin text-[#bf6d68]" /><p className="mt-3 text-sm text-[#817679]">Loading commission billing…</p></section>;

  return <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
    <div className="space-y-5">
      {returnNotice && <p role="status" className={`rounded-xl px-4 py-3 text-sm ${returnNotice.startsWith("Belize Bank confirmed") ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>{returnNotice}</p>}
      {error && <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={<WalletCards size={20} />} label="Current balance" value={money(balance)} detail={`From ${sales.length} completed ${sales.length === 1 ? "sale" : "sales"}`} />
        <Metric icon={<CalendarDays size={20} />} label="Next invoice" value={formatDate(dates.invoiceDate)} detail="Monthly billing cycle" />
        <Metric icon={<BadgePercent size={20} />} label="Commission rate" value={`${(commissionBps / 100).toFixed(0)}%`} detail="Per confirmed sale" />
        <Metric icon={<FileText size={20} />} label="Unpaid invoices" value={balance > 0 ? "1" : "0"} detail={balance > 0 ? "Current balance outstanding" : "Nothing due"} />
      </section>

      <section className="rounded-2xl border border-[#ede3df] bg-white shadow-sm">
        <nav className="flex gap-6 overflow-x-auto border-b border-[#eee3df] px-5" aria-label="Commission sections">{(["overview", "invoices", "sales"] as Tab[]).map((item) => <button key={item} onClick={() => setTab(item)} className={`shrink-0 border-b-2 px-1 py-4 text-xs font-bold capitalize ${tab === item ? "border-[#bf6d68] text-[#a85855]" : "border-transparent text-[#817679]"}`}>{item === "overview" ? "Commission overview" : item === "invoices" ? "Invoice history" : "Sales details"}</button>)}</nav>
        <div className="p-5">
          {tab === "overview" && <Overview balance={balance} sales={sales} dueDate={dates.dueDate} onPay={() => { setGatewayMessage(""); setPaymentOpen(true); }} />}
          {tab === "invoices" && <InvoiceHistory payments={payments} balance={balance} dueDate={dates.dueDate} reference={reference} onPay={() => { setGatewayMessage(""); setPaymentOpen(true); }} />}
          {tab === "sales" && <SalesDetails sales={sales} commissionBps={commissionBps} />}
        </div>
      </section>
    </div>

    <aside className="space-y-4">
      <section className="rounded-2xl border border-[#ede3df] bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-[.14em] text-[#817679]">Seller</p><h2 className="mt-2 font-bold">{storeName}</h2><p className="mt-1 text-xs text-[#817679]">Monthly commission billing</p></section>
      <section className="rounded-2xl border border-[#ede3df] bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><h2 className="font-bold">Commission summary</h2><span className="rounded-full bg-[#f4dfda] px-2.5 py-1 text-[10px] font-bold text-[#a85855]">{dates.period}</span></div><dl className="mt-4 space-y-3 text-sm"><SummaryRow label={`Completed sales (${sales.length})`} value={money(Math.round(totalCommission * 10000 / Math.max(commissionBps, 1)))} /><SummaryRow label={`Commission (${(commissionBps / 100).toFixed(0)}%)`} value={money(totalCommission)} /><SummaryRow label="Payments made" value={money(totalPaid)} /><div className="border-t border-[#eee3df] pt-3"><SummaryRow label="Balance due" value={money(balance)} strong /></div></dl><button disabled={balance <= 0} onClick={() => { setGatewayMessage(""); setPaymentOpen(true); }} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[#bf6d68] py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-45">Pay BelGlow commission <ArrowRight size={16} /></button></section>
      <section className="rounded-2xl border border-[#ede3df] bg-white p-5 text-sm shadow-sm"><p className="font-bold">How commission works</p><p className="mt-2 text-xs leading-5 text-[#75696b]">Confirmed sales add the BelGlow fee to this balance. BelGlow invoices the combined balance monthly so you do not pay card-processing costs on every individual sale.</p></section>
    </aside>

    {paymentOpen && <PaymentModal balance={balance} dueDate={dates.dueDate} reference={reference} method={method} setMethod={setMethod} connecting={connecting} gatewayMessage={gatewayMessage} onClose={() => { if (!connecting) setPaymentOpen(false); }} onContinue={() => void connectToGateway()} />}
  </div>;
}

function Overview({ balance, sales, dueDate, onPay }: { balance: number; sales: CommissionEntry[]; dueDate: Date; onPay: () => void }) {
  return <div className="space-y-5"><div className="grid gap-3 lg:grid-cols-[1.2fr_.8fr]"><div className="flex flex-wrap items-center justify-between gap-4 rounded-xl bg-[#faf6f4] p-4"><div><p className="text-xs font-bold text-[#817679]">Current outstanding balance</p><p className="mt-1 font-serif text-3xl font-bold">{money(balance)}</p></div><button disabled={balance <= 0} onClick={onPay} className="rounded-xl bg-[#bf6d68] px-6 py-3 text-sm font-bold text-white disabled:opacity-45"><CreditCard size={16} className="mr-2 inline" />Pay BelGlow commission</button></div><div className="rounded-xl bg-[#faf6f4] p-4"><p className="text-xs font-bold text-[#817679]">Payment due</p><p className="mt-1 font-bold">{formatDate(dueDate)}</p><p className="mt-1 text-xs text-[#a85855]">Monthly commission invoice</p></div></div><div><h3 className="text-sm font-bold">Commission entries</h3><EntryTable rows={sales.slice(0, 8)} /></div></div>;
}

function InvoiceHistory({ payments, balance, dueDate, reference, onPay }: { payments: CommissionEntry[]; balance: number; dueDate: Date; reference: string; onPay: () => void }) {
  const [selectedPayment, setSelectedPayment] = useState<CommissionEntry | null>(null);
  const [openPaymentId, setOpenPaymentId] = useState<string | null>(null);

  return <div className="space-y-4">
    {balance > 0 && <article className="flex flex-wrap items-center gap-4 rounded-xl border border-amber-200 bg-amber-50 p-4"><ReceiptText className="shrink-0 text-amber-700" /><div className="min-w-0 flex-1"><p className="font-bold">{reference}</p><p className="mt-1 text-xs text-amber-900">Due {formatDate(dueDate)} · Current monthly commission</p></div><strong>{money(balance)}</strong><button onClick={onPay} className="rounded-lg bg-[#bf6d68] px-4 py-2 text-xs font-bold text-white">Pay now</button></article>}
    <section className="rounded-xl border border-[#eadfdb] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h3 className="font-bold">Payments to BelGlow</h3><p className="mt-1 text-xs text-[#817679]">{payments.length} {payments.length === 1 ? "payment" : "payments"} recorded</p></div>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={!payments.length} onClick={() => downloadPayments(payments)} className="inline-flex items-center gap-2 rounded-lg border border-[#eadfdb] px-3 py-2 text-xs font-bold text-[#5f5054] disabled:cursor-not-allowed disabled:opacity-45"><ArrowDownToLine size={15} />Download CSV</button>
          <button type="button" disabled={!payments.length} onClick={() => printPayments(payments)} className="inline-flex items-center gap-2 rounded-lg border border-[#eadfdb] px-3 py-2 text-xs font-bold text-[#5f5054] disabled:cursor-not-allowed disabled:opacity-45"><Printer size={15} />Print history</button>
        </div>
      </div>
      {!payments.length ? <Empty text="Your commission payment receipts will appear here once a payment is recorded." /> : <div className="mt-4 space-y-2">{payments.map((payment) => <details key={payment.id} open={openPaymentId === payment.id} onToggle={(event) => { if (event.currentTarget.open) setOpenPaymentId(payment.id); else if (openPaymentId === payment.id) setOpenPaymentId(null); }} className="group rounded-xl border border-[#eee5e1] bg-white">
        <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3 p-3 [&::-webkit-details-marker]:hidden">
          <CheckCircle2 size={19} className="shrink-0 text-emerald-600" />
          <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold">{payment.description || "Commission payment"}</span><span className="mt-1 block text-xs text-[#817679]">{new Date(payment.created_at).toLocaleDateString("en-BZ", { year: "numeric", month: "short", day: "numeric" })}</span></span>
          <strong className="text-sm">{money(Math.abs(payment.amount_cents))}</strong>
          <span aria-hidden="true" className="ml-1 text-xs text-[#817679] transition-transform group-open:rotate-180">▾</span>
        </summary>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#f0e8e5] bg-[#fcf9f8] px-4 py-3 text-xs">
          <dl className="grid flex-1 gap-x-6 gap-y-1 text-[#75696b] sm:grid-cols-2"><div><dt className="inline font-semibold">Status: </dt><dd className="inline text-emerald-700">Recorded</dd></div><div><dt className="inline font-semibold">Payment ID: </dt><dd className="inline break-all">{payment.id}</dd></div></dl>
          <button type="button" onClick={() => setSelectedPayment(payment)} className="rounded-lg bg-white px-3 py-2 font-bold text-[#b35f5d] ring-1 ring-[#eadfdb]">View receipt</button>
        </div>
      </details>)}</div>}
    </section>
    {selectedPayment && <PaymentReceiptModal payment={selectedPayment} onClose={() => setSelectedPayment(null)} />}
  </div>;
}

function PaymentReceiptModal({ payment, onClose }: { payment: CommissionEntry; onClose: () => void }) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, []);
  return <div className="fixed inset-0 z-[125] grid place-items-center overflow-y-auto bg-[#211a1d]/55 p-3 backdrop-blur-[2px]" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="payment-receipt-title" className="relative w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl sm:p-7">
      <button type="button" onClick={onClose} aria-label="Close receipt" className="absolute right-4 top-4 rounded-full bg-[#f4dfda] p-2 text-[#9b514f]"><X size={18} /></button>
      <p className="text-xs font-bold uppercase tracking-[.16em] text-[#a85855]">BelGlow payment receipt</p>
      <h2 id="payment-receipt-title" className="mt-2 pr-8 text-xl font-black">Commission payment</h2>
      <p className="mt-1 text-sm text-[#817679]">{new Date(payment.created_at).toLocaleString("en-BZ", { dateStyle: "long", timeStyle: "short" })}</p>
      <div className="mt-5 rounded-xl bg-[#faf6f4] p-4"><p className="text-xs text-[#817679]">Amount paid</p><p className="mt-1 text-2xl font-black">{money(Math.abs(payment.amount_cents))}</p></div>
      <dl className="mt-4 divide-y divide-[#eee5e1] text-sm"><div className="flex justify-between gap-4 py-3"><dt className="text-[#817679]">Description</dt><dd className="text-right font-semibold">{payment.description || "Commission payment"}</dd></div><div className="flex justify-between gap-4 py-3"><dt className="text-[#817679]">Status</dt><dd className="font-semibold text-emerald-700">Recorded</dd></div><div className="flex justify-between gap-4 py-3"><dt className="text-[#817679]">Payment ID</dt><dd className="max-w-[65%] break-all text-right text-xs">{payment.id}</dd></div></dl>
      <div className="mt-4 flex gap-2"><button type="button" onClick={() => downloadPayments([payment])} className="flex-1 rounded-xl border border-[#eadfdb] px-3 py-3 text-sm font-bold"><ArrowDownToLine size={16} className="mr-2 inline" />Download</button><button type="button" onClick={() => printPayments([payment], "BelGlow payment receipt")} className="flex-1 rounded-xl bg-[#bf6d68] px-3 py-3 text-sm font-bold text-white"><Printer size={16} className="mr-2 inline" />Print receipt</button></div>
    </section>
  </div>;
}

function downloadPayments(payments: CommissionEntry[]) {
  const rows = [["Payment date", "Description", "Amount (BZD)", "Status", "Payment ID"], ...payments.map((payment) => [new Date(payment.created_at).toISOString(), payment.description || "Commission payment", (Math.abs(payment.amount_cents) / 100).toFixed(2), "Recorded", payment.id])];
  const csv = "\uFEFF" + rows.map((row) => row.map((value) => "\"" + String(value).replace(/\"/g, "\"\"") + "\"").join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "belglow-payment-history-" + new Date().toISOString().slice(0, 10) + ".csv";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function printPayments(payments: CommissionEntry[], title = "BelGlow commission payment history") {
  const printWindow = window.open("", "_blank", "width=900,height=700");
  if (!printWindow) return;
  const rows = payments.map((payment) => "<tr><td>" + escapeHtml(new Date(payment.created_at).toLocaleString("en-BZ", { dateStyle: "medium", timeStyle: "short" })) + "</td><td>" + escapeHtml(payment.description || "Commission payment") + "</td><td>" + escapeHtml(money(Math.abs(payment.amount_cents))) + "</td><td>Recorded</td><td>" + escapeHtml(payment.id) + "</td></tr>").join("");
  printWindow.document.write("<!doctype html><html><head><meta charset=\"utf-8\"><title>" + escapeHtml(title) + "</title><style>body{font:14px Arial,sans-serif;color:#241f20;margin:40px}h1{font-size:24px;margin:0 0 8px}p{color:#75696b;margin:0 0 24px}table{width:100%;border-collapse:collapse}th,td{padding:12px 8px;border-bottom:1px solid #e8dfdc;text-align:left;vertical-align:top}th{background:#faf5f4;font-size:12px}td:last-child{font-size:11px;word-break:break-all}@media print{body{margin:16mm}}</style></head><body><h1>" + escapeHtml(title) + "</h1><p>Seller commission payments · Generated " + escapeHtml(new Date().toLocaleString("en-BZ", { dateStyle: "medium", timeStyle: "short" })) + "</p><table><thead><tr><th>Date</th><th>Description</th><th>Amount</th><th>Status</th><th>Payment ID</th></tr></thead><tbody>" + rows + "</tbody></table></body></html>");
  printWindow.document.close();
  printWindow.focus();
  window.setTimeout(() => printWindow.print(), 250);
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[character] ?? character);
}
function SalesDetails({ sales, commissionBps }: { sales: CommissionEntry[]; commissionBps: number }) {
  return <div><h3 className="text-sm font-bold">Sales included in commission</h3><EntryTable rows={sales} commissionBps={commissionBps} />{!sales.length && <Empty text="Confirmed sales will appear here." />}</div>;
}

function EntryTable({ rows, commissionBps = 1000 }: { rows: CommissionEntry[]; commissionBps?: number }) {
  if (!rows.length) return <Empty text="No commission entries have been recorded yet." />;
  return <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead className="bg-[#f8f3f4] text-xs text-[#817679]"><tr><th className="px-3 py-2 font-semibold">Reference</th><th className="px-3 py-2 font-semibold">Date</th><th className="px-3 py-2 font-semibold">Estimated sale</th><th className="px-3 py-2 font-semibold">Commission</th><th className="px-3 py-2 font-semibold">Status</th></tr></thead><tbody>{rows.map((entry) => <tr key={entry.id} className="border-t border-[#eee5e1]"><td className="px-3 py-3 font-semibold">{entry.description.match(/#\d+/)?.[0] ?? entry.id.slice(0, 8)}</td><td className="px-3 py-3 text-[#75696b]">{new Date(entry.created_at).toLocaleDateString()}</td><td className="px-3 py-3">{money(Math.round(entry.amount_cents * 10000 / Math.max(commissionBps, 1)))}</td><td className="px-3 py-3 font-semibold">{money(entry.amount_cents)}</td><td className="px-3 py-3"><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">Completed</span></td></tr>)}</tbody></table></div>;
}

function PaymentModal({ balance, dueDate, reference, method, setMethod, connecting, gatewayMessage, onClose, onContinue }: { balance: number; dueDate: Date; reference: string; method: PaymentMethod; setMethod: (method: PaymentMethod) => void; connecting: boolean; gatewayMessage: string; onClose: () => void; onContinue: () => void }) {
  return <div className="fixed inset-0 z-[120] grid place-items-center overflow-hidden bg-[#211a1d]/45 p-3 backdrop-blur-[2px]" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section role="dialog" aria-modal="true" aria-labelledby="commission-payment-title" className="relative w-full max-w-md rounded-[24px] bg-white p-5 shadow-[0_30px_90px_rgba(55,31,39,.3)] sm:p-6"><button disabled={connecting} onClick={onClose} aria-label="Close payment" className="absolute right-4 top-4 rounded-full bg-[#f4dfda] p-2 text-[#9b514f] disabled:opacity-40"><X size={18} /></button>{connecting ? <div className="py-12 text-center"><LoaderCircle className="mx-auto animate-spin text-[#bf6d68]" size={38} /><h2 id="commission-payment-title" className="mt-5 text-xl font-black">Connecting securely…</h2><p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-[#75696b]">Connecting to Belize Bank’s hosted payment gateway. Card information will be entered only on the bank’s secure page.</p></div> : <><p className="text-xs font-bold uppercase tracking-[.16em] text-[#a85855]">BelGlow commission</p><h2 id="commission-payment-title" className="mt-2 text-2xl font-black">Pay BelGlow commission</h2><p className="mt-2 text-sm text-[#75696b]">Pay your outstanding monthly commission balance.</p><div className="mt-5 grid grid-cols-2 gap-3 rounded-xl bg-[#faf6f4] p-4 text-sm"><div><p className="text-xs text-[#817679]">Amount due</p><strong className="mt-1 block text-xl">{money(balance)}</strong></div><div><p className="text-xs text-[#817679]">Reference</p><strong className="mt-1 block text-xs">{reference}</strong><p className="mt-1 text-[10px] text-[#a85855]">Due {formatDate(dueDate)}</p></div></div><fieldset className="mt-5"><legend className="text-xs font-bold">Select payment method</legend><button type="button" onClick={() => setMethod("digiwallet")} className={`mt-2 flex w-full items-center gap-3 rounded-xl border p-3 text-left ${method === "digiwallet" ? "border-[#bf6d68] bg-[#faf6f4]" : "border-[#eadfdb]"}`}><span className="grid h-9 w-9 place-items-center rounded-lg bg-[#f4dfda] text-[#a85855]"><Smartphone size={19} /></span><span className="min-w-0 flex-1"><strong className="block text-sm">DigiWallet</strong><span className="text-xs text-[#817679]">Digital wallet payment</span></span><span className="rounded-full bg-[#f4dfda] px-2 py-1 text-[10px] font-bold text-[#a85855]">Coming soon</span></button>{method === "digiwallet" && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">DigiWallet payments are coming soon. Select Credit / Debit Card to continue today.</p>}<button type="button" onClick={() => setMethod("card")} className={`mt-2 flex w-full items-center gap-3 rounded-xl border p-3 text-left ${method === "card" ? "border-[#bf6d68] bg-[#faf6f4]" : "border-[#eadfdb]"}`}><span className="grid h-9 w-9 place-items-center rounded-lg bg-[#f4dfda] text-[#a85855]"><CreditCard size={19} /></span><span className="min-w-0 flex-1"><strong className="block text-sm">Credit / Debit Card</strong><span className="text-xs text-[#817679]">Continue securely to Belize Bank</span></span><span className={`h-4 w-4 rounded-full border-2 ${method === "card" ? "border-[5px] border-[#bf6d68]" : "border-[#b9afb3]"}`} /></button></fieldset>{gatewayMessage && <p role="alert" className="mt-4 rounded-xl bg-amber-50 p-3 text-sm leading-5 text-amber-900">{gatewayMessage}</p>}<div className="mt-5 flex gap-3"><button type="button" onClick={onClose} className="flex-1 rounded-xl border border-[#eadfdb] py-3 text-sm font-bold">Cancel</button><button disabled={method === "digiwallet" || balance <= 0} onClick={onContinue} className="flex-[1.5] rounded-xl bg-[#bf6d68] py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-45">Continue <ArrowRight size={16} className="ml-1 inline" /></button></div><p className="mt-4 text-center text-[11px] leading-5 text-[#817679]">BelGlow never collects or stores your card number, security code, PIN, or online-banking credentials.</p></>}</section></div>;
}

function Metric({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: string; detail: string }) { return <article className="rounded-2xl border border-[#ede3df] bg-white p-4 shadow-sm"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#f4dfda] text-[#a85855]">{icon}</span><p className="mt-3 text-xs font-bold text-[#817679]">{label}</p><p className="mt-1 text-xl font-black">{value}</p><p className="mt-1 text-[11px] text-[#817679]">{detail}</p></article>; }
function SummaryRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) { return <div className={`flex justify-between gap-3 ${strong ? "font-black text-[#a85855]" : ""}`}><dt>{label}</dt><dd>{value}</dd></div>; }
function Empty({ text }: { text: string }) { return <p className="mt-4 rounded-xl bg-[#faf6f4] p-5 text-center text-sm text-[#817679]">{text}</p>; }
function money(cents: number) { return `BZ$${(Math.max(0, cents) / 100).toFixed(2)}`; }
function formatDate(date: Date) { return new Intl.DateTimeFormat("en-BZ", { month: "short", day: "numeric", year: "numeric" }).format(date); }
function billingDates(now: Date) { const invoiceDate = new Date(now.getFullYear(), now.getMonth() + 1, 1); const dueDate = new Date(now.getFullYear(), now.getMonth() + 1, 7); return { invoiceDate, dueDate, period: new Intl.DateTimeFormat("en-BZ", { month: "long", year: "numeric" }).format(now) }; }
