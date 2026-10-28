import { NextResponse } from "next/server";
import { deliverPendingEmails } from "@/lib/resend";
import { createClient } from "@/utils/supabase/server";

export async function POST(request: Request) {
  let body: { submissionId?: string; approve?: boolean; note?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  if (!body.submissionId || typeof body.approve !== "boolean") {
    return NextResponse.json({ error: "Choose whether to confirm or reject this payment." }, { status: 400 });
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in again to review this payment." }, { status: 401 });
  const { data, error } = await supabase.rpc("verify_seller_payment_submission", {
    target_submission_id: body.submissionId,
    approve: body.approve,
    review_note: String(body.note ?? "").trim().slice(0, 500),
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  let email = { sent: 0, failed: 0, skipped: true };
  if (data?.orderId) {
    try { email = await deliverPendingEmails({ orderId: data.orderId }); }
    catch (emailError) { console.error("Payment email delivery failed:", emailError); email = { sent: 0, failed: 1, skipped: false }; }
  }
  return NextResponse.json({ result: data, email });
}
