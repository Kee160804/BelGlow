import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { reconcileCommissionPayment } from "@/lib/commission-payment-status";

function returnUrl(status: string) {
  const origin = new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://belglow.store").origin;
  const url = new URL("/dashboard/payouts", origin);
  url.searchParams.set("commission_payment", status);
  return url;
}

export async function GET(request: Request) {
  const reference = new URL(request.url).searchParams.get("reference")?.trim() ?? "";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/?login=required", returnUrl("pending").origin));

  const { data: store } = await supabase.from("seller_stores").select("id").eq("owner_id", user.id).maybeSingle();
  if (!store || !reference) return NextResponse.redirect(returnUrl("pending"));
  const { data: payment } = await createAdminClient().from("seller_commission_payments")
    .select("id, bank_order_id, status")
    .eq("seller_store_id", store.id).eq("payment_reference", reference).maybeSingle();
  if (!payment) return NextResponse.redirect(returnUrl("pending"));

  let status: string = payment.status;
  if (payment.status === "pending" && payment.bank_order_id) {
    try { status = await reconcileCommissionPayment(payment.id, payment.bank_order_id); }
    catch (error) { console.error("Belize Bank return status could not be verified:", error instanceof Error ? error.message : "Unknown error"); }
  }
  return NextResponse.redirect(returnUrl(status));
}
