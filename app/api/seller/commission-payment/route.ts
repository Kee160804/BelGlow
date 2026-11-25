import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { registerBelizeBankPayment } from "@/lib/belize-bank";

function siteUrl() {
  const value = process.env.NEXT_PUBLIC_SITE_URL;
  if (!value) throw new Error("The public site URL is not configured.");
  const url = new URL(value);
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") throw new Error("The production site URL must use HTTPS.");
  return url.origin;
}

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in again to pay your commission invoice." }, { status: 401 });
  const initializationToken = randomUUID();
  const paymentReference = `BG-COM-${randomUUID()}`;
  const { data, error } = await supabase.rpc("begin_seller_commission_payment", {
    payment_reference: paymentReference,
    initialization_token: initializationToken,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const payment = Array.isArray(data) ? data[0] : data;
  if (!payment?.payment_id) return NextResponse.json({ error: "A commission payment could not be started." }, { status: 500 });
  if (payment.status === "pending" && payment.hosted_payment_url) {
    return NextResponse.json({ redirectUrl: payment.hosted_payment_url });
  }
  if (payment.status !== "initiating" || payment.initialization_claim !== initializationToken) {
    return NextResponse.json({ error: "A commission payment is already being prepared. Please try again in a moment." }, { status: 409 });
  }

  const admin = createAdminClient();
  try {
    const origin = siteUrl();
    const reference = encodeURIComponent(payment.reference);
    const { orderId, formUrl } = await registerBelizeBankPayment({
      amountCents: Number(payment.amount_cents),
      reference: payment.reference,
      description: "BelGlow monthly seller commission",
      returnUrl: `${origin}/api/seller/commission-payment/return?reference=${reference}`,
      callbackUrl: `${origin}/api/seller/commission-payment/callback`,
    });
    const { error: updateError } = await admin.from("seller_commission_payments").update({
      bank_order_id: orderId,
      hosted_payment_url: formUrl,
      status: "pending",
      initialization_token: null,
    }).eq("id", payment.payment_id).eq("initialization_token", initializationToken);
    if (updateError) throw updateError;
    return NextResponse.json({ redirectUrl: formUrl });
  } catch (error) {
    await admin.from("seller_commission_payments").update({ status: "failed", initialization_token: null })
      .eq("id", payment.payment_id).eq("initialization_token", initializationToken);
    console.error("Belize Bank commission checkout could not be initialized:", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: error instanceof Error ? error.message : "Belize Bank could not start the payment." }, { status: 503 });
  }
}
