import "server-only";

import { createAdminClient } from "@/utils/supabase/admin";
import { getBelizeBankPaymentStatus } from "@/lib/belize-bank";

export async function reconcileCommissionPayment(paymentId: string, bankOrderId: string) {
  const admin = createAdminClient();
  const { data: payment, error } = await admin.from("seller_commission_payments")
    .select("id, amount_cents, bank_order_id, status")
    .eq("id", paymentId).eq("bank_order_id", bankOrderId).maybeSingle();
  if (error) throw error;
  if (!payment) return "not_found" as const;
  if (payment.status === "paid") return "paid" as const;
  if (payment.status !== "pending") return payment.status as "initiating" | "failed";

  const bankStatus = await getBelizeBankPaymentStatus(bankOrderId);
  if (bankStatus.status === 2 && bankStatus.amountCents === Number(payment.amount_cents)) {
    const { data: confirmed, error: confirmError } = await admin.rpc("confirm_seller_commission_payment", {
      target_payment_id: payment.id,
      target_bank_order_id: bankOrderId,
      verified_amount_cents: bankStatus.amountCents,
    });
    if (confirmError) throw confirmError;
    return confirmed ? "paid" as const : "pending" as const;
  }

  if ([3, 6].includes(bankStatus.status)) {
    const { error: updateError } = await admin.from("seller_commission_payments")
      .update({ status: "failed" }).eq("id", payment.id).eq("status", "pending");
    if (updateError) throw updateError;
    return "failed" as const;
  }
  return "pending" as const;
}
