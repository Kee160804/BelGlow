import Link from "next/link";
import GuestCheckout from "@/components/shop/GuestCheckout";

export const dynamic = "force-dynamic";

export default function CheckoutPage() {
  return <main className="min-h-dvh bg-[#fff8fa] p-3 sm:p-5">
    <div className="mx-auto max-w-4xl">
      <div className="flex items-center justify-between gap-4 px-1"><div><p className="text-[10px] font-bold uppercase tracking-[.2em] text-[#ed4773]">BelGlow secure checkout</p><h1 className="mt-1 text-2xl font-black tracking-[-.03em]">Complete your order</h1></div><Link href="/shop" className="rounded-full border border-[#edcbd5] px-4 py-2 text-xs font-bold text-[#df3765]">Back to shop</Link></div>
      <GuestCheckout />
    </div>
  </main>;
}
