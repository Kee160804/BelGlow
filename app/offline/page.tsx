import Link from "next/link";
import { RefreshCw, WifiOff } from "lucide-react";

export const metadata = { title: "You’re offline" };

export default function OfflinePage() {
  return <main className="grid min-h-dvh place-items-center bg-[radial-gradient(circle_at_top,#fff7f9,#f8d7e0_55%,#efbdcb)] px-5 py-10 text-[#2b2226]">
    <section className="w-full max-w-lg rounded-[28px] border border-white/70 bg-white/90 p-7 text-center shadow-[0_24px_80px_rgba(94,35,53,.16)] sm:p-10">
      <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-[#fff0f4] text-[#df3b68]"><WifiOff size={30} /></span>
      <p className="mt-6 text-xs font-bold uppercase tracking-[.2em] text-[#df3b68]">No internet connection</p>
      <h1 className="mt-3 font-serif text-4xl font-semibold">BelGlow will be right here</h1>
      <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-[#75696e]">Reconnect to continue shopping, manage your store, or view live order information. Private marketplace data is never stored for offline viewing.</p>
      <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
        <Link href="/" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#ef4b74] px-6 font-bold text-white"><RefreshCw size={17} /> Try again</Link>
        <Link href="/contact" className="inline-flex min-h-12 items-center justify-center rounded-full border border-[#e3c8d0] bg-white px-6 font-bold text-[#b7355a]">Support</Link>
      </div>
    </section>
  </main>;
}
