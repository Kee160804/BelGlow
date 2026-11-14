import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { allowPublicRequest } from "@/lib/rate-limit";

export async function POST(request: Request) {
  let body: { orderNumber?: number | string; email?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const orderNumber = Number(body.orderNumber);
  const email = String(body.email ?? "").trim().toLowerCase();
  if (!Number.isSafeInteger(orderNumber) || orderNumber < 1 || !email.includes("@")) {
    return NextResponse.json({ error: "Enter your order number and checkout email." }, { status: 400 });
  }
  const allowed = await allowPublicRequest(request, "payment_lookup", email, 15, 900);
  if (!allowed) return NextResponse.json({ error: "Too many attempts. Please wait and try again." }, { status: 429 });
  const { data, error } = await createAdminClient().rpc("get_order_payment_details", { lookup_order_number: orderNumber, lookup_email: email });
  if (error) return NextResponse.json({ error: "Unable to load payment details." }, { status: 400 });
  if (!data) return NextResponse.json({ error: "No matching order was found." }, { status: 404 });
  return NextResponse.json({ order: data });
}
