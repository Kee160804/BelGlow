"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowUpRight, Bell, Check, CircleDollarSign, Clock, Download,
  LayoutDashboard, LogOut, Menu, PackageCheck, Percent, Search, Settings,
  ShieldCheck, ShoppingBag, Store, TrendingUp, UserPlus, Users,
  WalletCards, X,
} from "lucide-react";
import { FormEvent, ReactNode, useState } from "react";
import { useStore } from "@/components/providers/StoreProvider";
import AdminMarketplaceTools from "@/components/admin/AdminMarketplaceTools";

type AdminModal = {
  kind: "seller" | "approval" | "order" | "commission" | "payout" | "add-seller" | "customer" | "settings";
  title: string;
  detail?: string;
} | null;

const adminNavigation = [
  ["Overview", "/admin", LayoutDashboard],
  ["Sellers", "/admin/sellers", Store],
  ["Product approvals", "/admin/approvals", PackageCheck],
  ["Marketplace orders", "/admin/orders", ShoppingBag],
  ["Commission", "/admin/commission", Percent],
  ["Seller payouts", "/admin/payouts", WalletCards],
  ["Customers", "/admin/customers", Users],
  ["Settings", "/admin/settings", Settings],
] as const;

const sellers = [
  ["Glow Essentials", "18 products", "BZ$4,280", "BZ$642", "Active"],
  ["Island Botanics", "12 products", "BZ$3,140", "BZ$471", "Active"],
  ["Maya Beauty Co.", "9 products", "BZ$2,460", "BZ$369", "Review"],
  ["Caribbean Curls", "15 products", "BZ$1,920", "BZ$288", "Active"],
] as const;

const approvals = [
  ["Hibiscus Glow Oil", "Glow Essentials", "Face care", "BZ$26.00", "Today"],
  ["Moringa Scalp Mist", "Caribbean Curls", "Hair care", "BZ$22.00", "Today"],
  ["Cacao Body Polish", "Maya Beauty Co.", "Body care", "BZ$18.00", "Yesterday"],
] as const;

const orders = [
  ["#BG12456", "Janelle P.", "Glow Essentials", "BZ$48.50", "BZ$7.28", "Processing"],
  ["#BG12455", "Daniela M.", "Island Botanics", "BZ$72.00", "BZ$10.80", "Shipped"],
  ["#BG12454", "Kayla R.", "Maya Beauty Co.", "BZ$35.20", "BZ$5.28", "Pending"],
] as const;

const payouts = [
  ["Glow Essentials", "BZ$4,280", "BZ$642", "BZ$3,638", "Ready"],
  ["Island Botanics", "BZ$3,140", "BZ$471", "BZ$2,669", "Processing"],
  ["Maya Beauty Co.", "BZ$2,460", "BZ$369", "BZ$2,091", "On hold"],
] as const;

const customers = [
  ["Janelle Perez", "8", "BZ$418.20", "Oct 2, 2026", "Active"],
  ["Daniela Martinez", "5", "BZ$284.00", "Oct 1, 2026", "Active"],
  ["Kayla Ramirez", "4", "BZ$199.50", "Sep 30, 2026", "Active"],
] as const;

export default function AdminDashboard() {
  const { userName, userRole, openAuth, signOut } = useStore();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [modal, setModal] = useState<AdminModal>(null);
  const [commissionRate, setCommissionRate] = useState(15);
  const [pendingApprovals, setPendingApprovals] = useState<ReadonlyArray<ReadonlyArray<string>>>(approvals);
  const [payoutRows, setPayoutRows] = useState<ReadonlyArray<ReadonlyArray<string>>>(payouts);
  const [notice, setNotice] = useState("");
  const section = pathname.split("/").filter(Boolean).at(-1) ?? "admin";

  function showNotice(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2600);
  }

  function completeAction(message: string) {
    if (modal?.kind === "approval" && pendingApprovals.some((row) => row[0] === modal.title)) {
      setPendingApprovals((current) => current.filter((row) => row[0] !== modal.title));
    }
    if (modal?.kind === "payout") {
      const sellerName = modal.title.replace(" payout", "");
      setPayoutRows((current) => current.map((row) => modal.title === "Process ready payouts" ? (row[4] === "Ready" ? [...row.slice(0, 4), "Processing"] : row) : (row[0] === sellerName ? [...row.slice(0, 4), "Processing"] : row)));
    }
    setModal(null);
    showNotice(message);
  }

  function downloadCsv(name: string, headings: readonly string[], rows: ReadonlyArray<ReadonlyArray<string>>) {
    const csv = [headings, ...rows].map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${name}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    showNotice(`${name.replaceAll("-", " ")} exported`);
  }

  if (!userName || userRole !== "admin") {
    return <main className="grid min-h-screen place-items-center bg-[radial-gradient(circle_at_top,#fff7f4,#eaded9_55%,#dfcdc7)] p-5"><section className="w-full max-w-lg rounded-[32px] bg-white p-9 text-center shadow-[0_28px_80px_rgba(69,39,34,.18)]"><span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-[#2d2528] text-white"><ShieldCheck size={30} /></span><p className="mt-6 text-xs font-bold uppercase tracking-[.22em] text-[#a95855]">Restricted access</p><h1 className="mt-2 font-serif text-4xl font-semibold">BelGlow administration</h1><p className="mt-4 text-sm leading-6 text-[#74696b]">Only BelGlow platform administrators can manage sellers, approvals, commission, and payouts.</p><button onClick={openAuth} className="mt-7 w-full rounded-xl bg-[#2d2528] py-3.5 font-bold text-white">Sign in as administrator</button><Link href="/" className="mt-4 inline-block text-sm font-semibold text-[#9f5754]">Return to marketplace</Link></section></main>;
  }

  return <main className="min-h-screen bg-[#e9dfdb] p-0 text-[#292527] lg:p-5">
    <div className="mx-auto grid min-h-screen max-w-[1600px] overflow-hidden bg-[#f8f5f3] shadow-[0_26px_90px_rgba(61,39,35,.16)] lg:min-h-[calc(100vh-40px)] lg:grid-cols-[250px_1fr] lg:rounded-[28px]">
      <aside className={`fixed inset-y-0 left-0 z-50 flex w-[280px] flex-col bg-[#292326] p-5 text-white transition-transform lg:static lg:w-auto lg:translate-x-0 ${menuOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex items-center justify-between"><Link href="/" className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-[#e4b4ad] text-[#652e2d]"><ShieldCheck size={23} /></span><span><strong className="block font-serif text-2xl">BelGlow</strong><small className="text-[9px] uppercase tracking-[.2em] text-[#d4c7c8]">Platform admin</small></span></Link><button onClick={() => setMenuOpen(false)} className="p-2 lg:hidden" aria-label="Close admin navigation"><X /></button></div>
        <nav className="mt-8 space-y-1" aria-label="Admin navigation">{adminNavigation.map(([label, href, Icon]) => { const active = pathname === href; return <Link key={href} href={href} onClick={() => { setMenuOpen(false); setQuery(""); }} aria-current={active ? "page" : undefined} className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm transition ${active ? "bg-[#c8726b] text-white" : "text-[#ddd3d4] hover:bg-white/8 hover:text-white"}`}><Icon size={19} /><span className="flex-1">{label}</span>{label === "Product approvals" && pendingApprovals.length > 0 && <span className="rounded-full bg-[#e6aaa2] px-2 py-0.5 text-[10px] font-bold text-[#542422]">{pendingApprovals.length}</span>}</Link>; })}</nav>
        <div className="mt-auto rounded-2xl border border-white/10 bg-white/5 p-4"><p className="text-xs leading-5 text-[#d4c7c8]">Admin actions affect every seller and customer on BelGlow.</p><button onClick={signOut} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-white/10 py-2.5 text-sm font-bold hover:bg-white/15"><LogOut size={16} /> Sign out</button></div>
      </aside>

      {menuOpen && <button className="fixed inset-0 z-40 bg-black/30 lg:hidden" onClick={() => setMenuOpen(false)} aria-label="Close admin navigation overlay" />}

      <div className="min-w-0">
        <header className="relative flex h-20 items-center gap-3 border-b border-[#e8dedb] bg-white px-4 sm:px-7">
          <button onClick={() => setMenuOpen(true)} className="rounded-xl border border-[#e1d5d1] p-2.5 lg:hidden" aria-label="Open admin navigation"><Menu size={20} /></button>
          <label className="hidden max-w-xl flex-1 items-center gap-3 rounded-xl bg-[#f3efed] px-4 sm:flex"><Search size={18} /><span className="sr-only">Search current admin page</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search this section..." className="h-11 flex-1 bg-transparent text-sm outline-none" /></label>
          <div className="ml-auto flex items-center gap-2">
            <div className="relative"><button onClick={() => { setNotificationsOpen((open) => !open); setAccountOpen(false); }} aria-expanded={notificationsOpen} className="relative rounded-full p-2" aria-label="Admin notifications"><Bell size={20} />{pendingApprovals.length > 0 && <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-red-500" />}</button>{notificationsOpen && <div className="absolute right-0 top-12 z-50 w-72 rounded-2xl border border-[#e8dedb] bg-white p-3 shadow-2xl"><p className="px-2 py-1 text-sm font-bold">Notifications</p>{pendingApprovals.length > 0 ? <Notification text={`${pendingApprovals.length} products need approval`} href="/admin/approvals" onClick={() => setNotificationsOpen(false)} /> : <p className="px-2 py-3 text-sm text-[#776d70]">No pending product approvals.</p>}<Notification text="5 payouts are ready" href="/admin/payouts" onClick={() => setNotificationsOpen(false)} /><button onClick={() => { setNotificationsOpen(false); showNotice("All notifications marked as read"); }} className="mt-2 w-full rounded-xl bg-[#f6efed] py-2 text-xs font-bold text-[#a45653]">Mark all as read</button></div>}</div>
            <div className="relative"><button onClick={() => { setAccountOpen((open) => !open); setNotificationsOpen(false); }} aria-expanded={accountOpen} className="flex items-center gap-3 rounded-xl p-1.5 text-left hover:bg-[#f6f0ee]"><span className="grid h-10 w-10 place-items-center rounded-full bg-[#292326] font-serif text-white">A</span><span className="hidden sm:block"><strong className="block text-sm">{userName}</strong><small className="text-[#7c7174]">Administrator</small></span></button>{accountOpen && <div className="absolute right-0 top-14 z-50 w-56 rounded-2xl border border-[#e8dedb] bg-white p-2 shadow-2xl"><Link href="/dashboard" onClick={() => setAccountOpen(false)} className="block rounded-xl px-3 py-2.5 text-sm font-semibold text-[#9b514f] hover:bg-[#f6efed]">Switch to seller</Link><Link href="/admin" onClick={() => setAccountOpen(false)} className="block rounded-xl px-3 py-2.5 text-sm font-semibold hover:bg-[#f6efed]">Stay in admin mode</Link><Link href="/" onClick={() => setAccountOpen(false)} className="block rounded-xl px-3 py-2.5 text-sm font-semibold hover:bg-[#f6efed]">View marketplace</Link><Link href="/admin/settings" onClick={() => setAccountOpen(false)} className="block rounded-xl px-3 py-2.5 text-sm font-semibold hover:bg-[#f6efed]">Admin settings</Link><button onClick={signOut} className="mt-1 flex w-full items-center gap-2 border-t border-[#eee5e2] px-3 py-3 text-left text-sm font-bold text-[#aa4f4c]"><LogOut size={16} /> Sign out</button></div>}</div>
          </div>
        </header>

        <div className="p-4 sm:p-7 lg:p-8">{section === "admin" ? <AdminMarketplaceTools section="overview" /> : <AdminSection section={section} query={query} setQuery={setQuery} openModal={setModal} commissionRate={commissionRate} approvalRows={pendingApprovals} payoutRows={payoutRows} onExport={downloadCsv} onNotice={showNotice} />}</div>
      </div>
    </div>

    {modal && <AdminActionModal modal={modal} commissionRate={commissionRate} setCommissionRate={setCommissionRate} onClose={() => setModal(null)} onComplete={completeAction} />}
    {notice && <div role="status" className="toast-in fixed bottom-6 left-1/2 z-[120] -translate-x-1/2 rounded-full bg-[#292326] px-5 py-3 text-sm font-semibold text-white shadow-xl"><span className="mr-2 inline-flex align-middle text-emerald-300"><Check size={16} /></span>{notice}</div>}
  </main>;
}

function AdminOverview({ openModal, commissionRate, approvalRows }: { openModal: (modal: AdminModal) => void; commissionRate: number; approvalRows: ReadonlyArray<ReadonlyArray<string>> }) {
  return <><div><p className="text-xs font-bold uppercase tracking-[.2em] text-[#ac5d59]">Platform overview</p><h1 className="mt-2 font-serif text-4xl font-semibold">Good morning, Admin</h1><p className="mt-2 text-sm text-[#716669]">Monitor marketplace activity and keep BelGlow running smoothly.</p></div><div className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><AdminStat href="/admin/orders" icon={<TrendingUp />} label="Marketplace sales" value="BZ$18,640" note="+16.4%" /><AdminStat href="/admin/commission" icon={<CircleDollarSign />} label="Commission revenue" value="BZ$2,796" note={`${commissionRate}% platform rate`} /><AdminStat href="/admin/sellers" icon={<Store />} label="Active sellers" value="24" note="3 awaiting review" /><AdminStat href="/admin/orders" icon={<ShoppingBag />} label="Marketplace orders" value="548" note="42 open" /></div><div className="mt-5 grid gap-5 xl:grid-cols-[1.2fr_.8fr]"><Card><Title title="Seller performance" href="/admin/sellers" /><SellerTable query="" onManage={(name) => openModal({ kind: "seller", title: name, detail: "Review store performance, permissions, and account status." })} /></Card><Card><Title title="Needs attention" href="/admin/approvals" /><div className="mt-4 space-y-3"><Attention href="/admin/approvals" icon={<PackageCheck />} value={String(approvalRows.length)} label="Products awaiting approval" /><Attention href="/admin/payouts" icon={<Clock />} value="5" label="Payouts processing" /><Attention href="/admin/sellers" icon={<Store />} value="2" label="Seller applications" /></div></Card></div><div className="mt-5"><Card><Title title="Pending product approvals" href="/admin/approvals" /><ApprovalTable rows={approvalRows} query="" onReview={(name) => openModal({ kind: "approval", title: name, detail: "Review product content, pricing, images, and marketplace policy compliance." })} /></Card></div></>;
}

function AdminSection({ section, query, setQuery, openModal, commissionRate, approvalRows, payoutRows, onExport, onNotice }: { section: string; query: string; setQuery: (value: string) => void; openModal: (modal: AdminModal) => void; commissionRate: number; approvalRows: ReadonlyArray<ReadonlyArray<string>>; payoutRows: ReadonlyArray<ReadonlyArray<string>>; onExport: (name: string, headings: readonly string[], rows: ReadonlyArray<ReadonlyArray<string>>) => void; onNotice: (message: string) => void }) {
  const names: Record<string, string> = { sellers: "Sellers", approvals: "Product approvals", orders: "Marketplace orders", commission: "Commission", payouts: "Seller payouts", customers: "Customers", settings: "Platform settings" };
  return <><p className="text-xs font-bold uppercase tracking-[.2em] text-[#ac5d59]">BelGlow administration</p><h1 className="mt-2 font-serif text-4xl font-semibold">{names[section] ?? "Administration"}</h1><p className="mt-2 text-sm text-[#716669]">{sectionDescription(section)}</p><div className="mt-7">{sectionContent({ section, query, setQuery, openModal, commissionRate, approvalRows, payoutRows, onExport, onNotice })}</div></>;
}

function sectionDescription(section: string) {
  const descriptions: Record<string, string> = { sellers: "Approve accounts, review performance, and manage seller access.", approvals: "Review new marketplace listings before they become visible to shoppers.", orders: "Monitor every order placed across all BelGlow sellers.", commission: "Track the platform percentage earned from completed marketplace sales.", payouts: "Review and release seller balances after commission and refunds.", customers: "Support shoppers and review marketplace activity.", settings: "Control marketplace rules, commission, and operational preferences." };
  return descriptions[section] ?? "Manage the BelGlow marketplace.";
}

function sectionContent({ section, query, setQuery, openModal, commissionRate, approvalRows, payoutRows, onExport, onNotice }: { section: string; query: string; setQuery: (value: string) => void; openModal: (modal: AdminModal) => void; commissionRate: number; approvalRows: ReadonlyArray<ReadonlyArray<string>>; payoutRows: ReadonlyArray<ReadonlyArray<string>>; onExport: (name: string, headings: readonly string[], rows: ReadonlyArray<ReadonlyArray<string>>) => void; onNotice: (message: string) => void }) {
  if (["sellers", "approvals", "commission", "orders", "payouts", "customers", "settings"].includes(section)) return <AdminMarketplaceTools section={section as "sellers" | "approvals" | "commission" | "orders" | "payouts" | "customers" | "settings"} />;
  if (section === "sellers") return <Card><AdminToolbar query={query} setQuery={setQuery} placeholder="Search sellers" action="Add seller" icon={<UserPlus size={16} />} onAction={() => openModal({ kind: "add-seller", title: "Invite a seller", detail: "Create a seller invitation and choose their initial access." })} /><SellerTable query={query} onManage={(name) => openModal({ kind: "seller", title: name, detail: "Review store performance, permissions, and account status." })} /></Card>;
  if (section === "approvals") return <Card><AdminToolbar query={query} setQuery={setQuery} placeholder="Search pending products" action="Review queue" onAction={() => approvalRows[0] ? openModal({ kind: "approval", title: approvalRows[0][0], detail: "Work through all products waiting for marketplace approval." }) : onNotice("The approval queue is clear")} /><ApprovalTable rows={approvalRows} query={query} onReview={(name) => openModal({ kind: "approval", title: name, detail: "Review product content, pricing, images, and marketplace policy compliance." })} /></Card>;
  if (section === "orders") return <Card><AdminToolbar query={query} setQuery={setQuery} placeholder="Search marketplace orders" action="Export orders" icon={<Download size={16} />} onAction={() => onExport("belglow-orders", ["Order", "Customer", "Seller", "Total", "Platform fee", "Status"], orders)} /><SimpleRows query={query} headings={["Order", "Customer", "Seller", "Total", "Platform fee", "Status"]} rows={orders} actionLabel="Open" onAction={(row) => openModal({ kind: "order", title: row[0], detail: `${row[1]} ordered from ${row[2]} for ${row[3]}.` })} /></Card>;
  if (section === "commission") return <div className="grid gap-5 xl:grid-cols-[.7fr_1.3fr]"><Card><p className="text-sm text-[#716669]">Current marketplace rate</p><p className="mt-2 font-serif text-5xl font-semibold">{commissionRate}%</p><p className="mt-3 text-xs leading-5 text-[#7d7275]">Collected automatically from each completed seller order.</p><button onClick={() => openModal({ kind: "commission", title: "Update commission rate", detail: "This demo updates the percentage across the admin interface." })} className="mt-6 w-full rounded-xl bg-[#292326] py-3 text-sm font-bold text-white">Update commission</button></Card><Card><Title title="Commission by seller" href="/admin/sellers" /><SimpleRows query={query} headings={["Seller", "Gross sales", "Rate", "BelGlow earned"]} rows={sellers.map((seller) => [seller[0], seller[2], `${commissionRate}%`, seller[3]])} actionLabel="Details" onAction={(row) => openModal({ kind: "seller", title: row[0], detail: `Commission earned: ${row[3]}.` })} /></Card></div>;
  if (section === "payouts") return <Card><AdminToolbar query={query} setQuery={setQuery} placeholder="Search seller payouts" action="Process payouts" onAction={() => openModal({ kind: "payout", title: "Process ready payouts", detail: "Review the payout batch before marking transfers as processing." })} /><SimpleRows query={query} headings={["Seller", "Gross", "Commission", "Seller balance", "Status"]} rows={payoutRows} actionLabel="Manage" onAction={(row) => openModal({ kind: "payout", title: `${row[0]} payout`, detail: `${row[3]} is currently ${row[4].toLowerCase()}.` })} /></Card>;
  if (section === "customers") return <Card><AdminToolbar query={query} setQuery={setQuery} placeholder="Search customers" action="Export customers" icon={<Download size={16} />} onAction={() => onExport("belglow-customers", ["Customer", "Orders", "Total spent", "Last order", "Status"], customers)} /><SimpleRows query={query} headings={["Customer", "Orders", "Total spent", "Last order", "Status"]} rows={customers} actionLabel="View" onAction={(row) => openModal({ kind: "customer", title: row[0], detail: `${row[1]} orders totaling ${row[2]}.` })} /></Card>;
  return <SettingsPanel commissionRate={commissionRate} onCommission={() => openModal({ kind: "commission", title: "Update commission rate" })} onSave={() => onNotice("Platform settings saved")} />;
}

function AdminActionModal({ modal, commissionRate, setCommissionRate, onClose, onComplete }: { modal: NonNullable<AdminModal>; commissionRate: number; setCommissionRate: (rate: number) => void; onClose: () => void; onComplete: (message: string) => void }) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (modal.kind === "commission") setCommissionRate(Number(data.get("rate") || commissionRate));
    const messages: Record<NonNullable<AdminModal>["kind"], string> = { seller: `${modal.title} updated`, approval: `${modal.title} approved`, order: `${modal.title} updated`, commission: "Commission rate updated", payout: "Payout batch is processing", "add-seller": "Seller invitation created", customer: `${modal.title} account updated`, settings: "Settings saved" };
    onComplete(messages[modal.kind]);
  }

  return <div className="fixed inset-0 z-[110] grid place-items-center overflow-y-auto bg-[#211a1d]/50 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="admin-modal-title" onMouseDown={onClose}><form onSubmit={submit} onMouseDown={(event) => event.stopPropagation()} className="relative w-full max-w-lg rounded-[28px] bg-white p-7 shadow-2xl"><button type="button" onClick={onClose} className="absolute right-5 top-5 rounded-full bg-[#f7efed] p-2" aria-label="Close dialog"><X size={19} /></button><span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#f0ddda] text-[#a95552]">{modal.kind === "approval" ? <PackageCheck /> : modal.kind === "payout" ? <WalletCards /> : modal.kind === "commission" ? <Percent /> : modal.kind === "add-seller" ? <UserPlus /> : <ShieldCheck />}</span><h2 id="admin-modal-title" className="mt-5 font-serif text-3xl font-semibold">{modal.title}</h2>{modal.detail && <p className="mt-2 text-sm leading-6 text-[#756a6d]">{modal.detail}</p>}<ModalFields kind={modal.kind} commissionRate={commissionRate} />
    {modal.kind === "approval" && <button type="button" onClick={() => onComplete(`${modal.title} rejected`)} className="mt-5 w-full rounded-xl border border-[#d9b9b4] py-3 text-sm font-bold text-[#a44f4c]">Reject product</button>}
    <button className="mt-3 w-full rounded-xl bg-[#292326] py-3.5 font-bold text-white">{modal.kind === "approval" ? "Approve product" : modal.kind === "payout" ? "Confirm payout" : modal.kind === "commission" ? "Save rate" : modal.kind === "add-seller" ? "Send invitation" : "Save changes"}</button></form></div>;
}

function ModalFields({ kind, commissionRate }: { kind: NonNullable<AdminModal>["kind"]; commissionRate: number }) {
  if (kind === "commission") return <label className="mt-6 block text-sm font-semibold">Platform commission (%)<input name="rate" type="number" min="1" max="50" defaultValue={commissionRate} className="mt-2 h-12 w-full rounded-xl border border-[#ddd2cf] px-4 outline-none focus:border-[#b85f5d]" /></label>;
  if (kind === "add-seller") return <div className="mt-6 space-y-4"><label className="block text-sm font-semibold">Business name<input name="business" required placeholder="Seller business name" className="mt-2 h-12 w-full rounded-xl border border-[#ddd2cf] px-4" /></label><label className="block text-sm font-semibold">Seller email<input name="email" type="email" required placeholder="seller@example.com" className="mt-2 h-12 w-full rounded-xl border border-[#ddd2cf] px-4" /></label></div>;
  if (kind === "approval") return <div className="mt-6 rounded-2xl bg-[#f8f3f1] p-4 text-sm text-[#62595c]"><p><strong>Checklist</strong></p><p className="mt-2">✓ Product image and title</p><p>✓ Price and category</p><p>✓ Marketplace policy</p></div>;
  if (kind === "payout") return <label className="mt-6 block text-sm font-semibold">Admin note<textarea name="note" rows={3} placeholder="Optional payout note" className="mt-2 w-full rounded-xl border border-[#ddd2cf] p-4" /></label>;
  return <label className="mt-6 block text-sm font-semibold">Status<select name="status" className="mt-2 h-12 w-full rounded-xl border border-[#ddd2cf] bg-white px-4"><option>Active</option><option>Under review</option><option>Suspended</option></select></label>;
}

function SettingsPanel({ commissionRate, onCommission, onSave }: { commissionRate: number; onCommission: () => void; onSave: () => void }) {
  return <form onSubmit={(event) => { event.preventDefault(); onSave(); }} className="grid gap-5 xl:grid-cols-2"><Card><h2 className="text-lg font-bold">Marketplace rules</h2><button type="button" onClick={onCommission} className="mt-5 flex w-full items-center justify-between rounded-xl border border-[#ddd2cf] px-4 py-3 text-left text-sm"><span><strong className="block">Default commission rate</strong><small className="text-[#796e71]">Applied to completed sales</small></span><strong>{commissionRate}%</strong></button><label className="mt-5 flex items-center justify-between text-sm font-semibold">Require product approval<input type="checkbox" defaultChecked className="h-5 w-5 accent-[#b85f5d]" /></label><button className="mt-6 rounded-xl bg-[#292326] px-6 py-3 font-bold text-white">Save rules</button></Card><Card><h2 className="text-lg font-bold">Seller onboarding</h2><p className="mt-3 text-sm leading-6 text-[#716669]">New sellers must complete their store profile and receive admin approval before publishing products.</p><label className="mt-5 flex items-center justify-between text-sm font-semibold">Accept seller applications<input type="checkbox" defaultChecked className="h-5 w-5 accent-[#b85f5d]" /></label><label className="mt-5 flex items-center justify-between text-sm font-semibold">Email approval notifications<input type="checkbox" defaultChecked className="h-5 w-5 accent-[#b85f5d]" /></label></Card></form>;
}

function AdminStat({ href, icon, label, value, note }: { href: string; icon: ReactNode; label: string; value: string; note: string }) { return <Link href={href} className="rounded-2xl border border-[#e9dfdc] bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"><div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-[#f2dfdb] text-[#a75754]">{icon}</span><div><p className="text-xs text-[#756a6d]">{label}</p><p className="font-serif text-2xl font-bold">{value}</p></div></div><p className="mt-3 flex items-center gap-1 text-xs font-semibold text-emerald-700"><ArrowUpRight size={13} /> {note}</p></Link>; }
function Card({ children }: { children: ReactNode }) { return <section className="rounded-2xl border border-[#e9dfdc] bg-white p-5 shadow-sm">{children}</section>; }
function Title({ title, href }: { title: string; href: string }) { return <div className="flex items-center justify-between"><h2 className="text-lg font-bold">{title}</h2><Link href={href} className="text-xs font-bold text-[#a85855] underline">View all</Link></div>; }
function Attention({ href, icon, value, label }: { href: string; icon: ReactNode; value: string; label: string }) { return <Link href={href} className="flex items-center gap-3 rounded-xl bg-[#f8f3f1] p-4 transition hover:bg-[#f1e4e1]"><span className="text-[#a85855]">{icon}</span><div><strong className="text-lg">{value}</strong><p className="text-xs text-[#756a6d]">{label}</p></div></Link>; }
function Notification({ text, href, onClick }: { text: string; href: string; onClick: () => void }) { return <Link href={href} onClick={onClick} className="mt-1 flex items-center gap-3 rounded-xl px-2 py-3 text-sm hover:bg-[#f7f1ef]"><span className="h-2 w-2 rounded-full bg-[#c5615c]" />{text}</Link>; }
function AdminToolbar({ query, setQuery, placeholder, action, icon, onAction }: { query: string; setQuery: (value: string) => void; placeholder: string; action: string; icon?: ReactNode; onAction: () => void }) { return <div className="mb-5 flex flex-col gap-3 sm:flex-row"><label className="flex flex-1 items-center gap-2 rounded-xl bg-[#f5f1ef] px-4"><Search size={17} /><span className="sr-only">{placeholder}</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={placeholder} className="h-11 flex-1 bg-transparent text-sm outline-none" /></label><button onClick={onAction} className="flex items-center justify-center gap-2 rounded-xl bg-[#292326] px-5 py-3 text-sm font-bold text-white">{icon}{action}</button></div>; }
function SellerTable({ query, onManage }: { query: string; onManage: (name: string) => void }) { return <SimpleRows query={query} headings={["Seller", "Products", "Gross sales", "BelGlow fee", "Status"]} rows={sellers} actionLabel="Manage" onAction={(row) => onManage(row[0])} />; }
function ApprovalTable({ rows, query, onReview }: { rows: ReadonlyArray<ReadonlyArray<string>>; query: string; onReview: (name: string) => void }) { return <SimpleRows query={query} headings={["Product", "Seller", "Category", "Price", "Submitted"]} rows={rows} actionLabel="Review" onAction={(row) => onReview(row[0])} />; }
function SimpleRows({ headings, rows, query, actionLabel, onAction }: { headings: string[]; rows: ReadonlyArray<ReadonlyArray<string>>; query: string; actionLabel?: string; onAction?: (row: ReadonlyArray<string>) => void }) { const needle = query.trim().toLowerCase(); const visibleRows = needle ? rows.filter((row) => row.join(" ").toLowerCase().includes(needle)) : rows; return <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[700px] text-left text-sm"><thead className="bg-[#f8f3f1] text-xs text-[#72686b]"><tr>{headings.map((heading) => <th key={heading} className="px-4 py-3 font-semibold">{heading}</th>)}{actionLabel && <th className="px-4 py-3 text-right font-semibold">Action</th>}</tr></thead><tbody>{visibleRows.map((row) => <tr key={row.join("-")} className="border-t border-[#eee5e2]">{row.map((cell, index) => <td key={`${cell}-${index}`} className={`px-4 py-4 ${index === 0 ? "font-semibold" : "text-[#62595c]"}`}>{cell}</td>)}{actionLabel && <td className="px-4 py-3 text-right"><button onClick={() => onAction?.(row)} className="rounded-lg bg-[#f0ded9] px-3 py-1.5 text-xs font-bold text-[#99504d]">{actionLabel}</button></td>}</tr>)}</tbody></table>{visibleRows.length === 0 && <div className="py-12 text-center text-sm text-[#7b7073]">No records match “{query}”.</div>}</div>; }
