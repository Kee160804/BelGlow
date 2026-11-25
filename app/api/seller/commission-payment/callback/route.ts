import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { reconcileCommissionPayment } from "@/lib/commission-payment-status";

export async function POST(request: Request) {
  const fields = new URLSearchParams(await request.text());
  const bankOrderId = fields.get("mdOrder")?.trim() ?? "";
  const reference = fields.get("orderNumber")?.trim() ?? "";
  if (!bankOrderId || !reference) return new NextResponse("Invalid callback", { status: 400 });

  const { data: payment, error } = await createAdminClient().from("seller_commission_payments")
    .select("id, payment_reference, bank_order_id")
    .eq("payment_reference", reference).eq("bank_order_id", bankOrderId).maybeSingle();
  if (error) return new NextResponse("Payment lookup failed", { status: 503 });
  if (!payment) return new NextResponse("Payment not found", { status: 404 });

  try {
    // The callback is only a signal to check the transaction. The bank's
    // authenticated status endpoint and the recorded amount determine success.
    await reconcileCommissionPayment(payment.id, bankOrderId);
    return new NextResponse("OK");
  } catch (error) {
    console.error("Belize Bank commission callback reconciliation failed:", error instanceof Error ? error.message : "Unknown error");
    return new NextResponse("Could not verify payment", { status: 503 });
  }
}
