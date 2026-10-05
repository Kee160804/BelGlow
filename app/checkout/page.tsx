import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import GuestCheckout from "@/components/shop/GuestCheckout";

export const dynamic = "force-dynamic";

export default async function CheckoutPage() {
  const supabase = await createClient();
  const { data: shippingMethods } = await supabase.from("shipping_methods").select("name, code, price_cents, description").eq("is_active", true).order("sort_order");
  return <main className="min-h-screen bg-[#fff8fa] p-5 sm:p-8">
    <div className="mx-auto max-w-3xl rounded-[28px] bg-white p-6 shadow-[0_28px_90px_rgba(107,44,62,.12)] sm:p-10">
      <p className="text-xs font-bold uppercase tracking-[.22em] text-[#ed4773]">BelGlow secure checkout</p>
      <h1 className="mt-2 text-4xl font-black tracking-[-.04em]">Complete your order</h1>
      <GuestCheckout shippingMethods={shippingMethods ?? []} />
      <Link href="/shop" className="mt-7 inline-flex rounded-full border border-[#edcbd5] px-5 py-3 text-sm font-bold text-[#df3765]">Return to shopping</Link>
    </div>
  </main>;
}
