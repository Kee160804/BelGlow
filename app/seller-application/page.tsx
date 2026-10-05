import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/utils/supabase/server";
import SellerApplicationForm from "./SellerApplicationForm";

export default async function SellerApplicationPage() {
  const current = await getCurrentProfile();
  if (!current) redirect("/?login=required");
  if (current.profile.role === "admin") redirect("/dashboard");

  const supabase = await createClient();
  const { data: store } = await supabase.from("seller_stores").select("name, status, rejection_reason").eq("owner_id", current.user.id).maybeSingle();
  if (store?.status === "approved" && current.profile.role === "seller") redirect("/dashboard");

  return <main className="grid min-h-screen place-items-center bg-[radial-gradient(circle_at_top,#fff7f4,#f5e8e3_48%,#ead8d2)] p-5">
    <section className="w-full max-w-2xl rounded-[32px] border border-white/70 bg-white/95 p-7 shadow-[0_30px_90px_rgba(87,48,42,.16)] sm:p-10">
      <p className="text-xs font-bold uppercase tracking-[.22em] text-[#b85f5d]">BelGlow seller marketplace</p>
      <h1 className="mt-3 font-serif text-4xl font-semibold">Apply to sell</h1>
      <p className="mt-3 text-sm leading-6 text-[#74696a]">Tell us about your store. BelGlow reviews seller applications before product listings can be published.</p>
      {store ? <div className="mt-7 rounded-2xl bg-[#fff5f2] p-5 text-sm leading-6 text-[#705b59]" role="status">
        <strong>{store.name}</strong> — application {store.status}.
        {store.rejection_reason && <p className="mt-2">Review note: {store.rejection_reason}</p>}
      </div> : <SellerApplicationForm />}
    </section>
  </main>;
}
