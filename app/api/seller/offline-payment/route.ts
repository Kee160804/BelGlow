import { NextResponse } from "next/server";
import { deliverPendingEmails } from "@/lib/resend";
import { createClient } from "@/utils/supabase/server";

export async function POST(request: Request) {
  let body: { sellerOrderId?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  if (!body.sellerOrderId) return NextResponse.json({ error: "Seller order is required." }, { status: 400 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in again to confirm this payment." }, { status: 401 });
  const { data, error } = await supabase.rpc("seller_confirm_offline_payment", { target_seller_order_id: body.sellerOrderId });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (data?.orderId) {
    try { await deliverPendingEmails({ orderId: data.orderId }); }
    catch (emailError) { console.error("Offline payment email delivery failed:", emailError); }
  }
  return NextResponse.json({ result: data });
}
