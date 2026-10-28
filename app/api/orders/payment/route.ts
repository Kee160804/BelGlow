import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function POST(request: Request) {
  let body: { orderNumber?: number | string; email?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const orderNumber = Number(body.orderNumber);
  const email = String(body.email ?? "").trim().toLowerCase();
  if (!Number.isSafeInteger(orderNumber) || orderNumber < 1 || !email.includes("@")) {
    return NextResponse.json({ error: "Enter your order number and checkout email." }, { status: 400 });
  }
  const supabase = await createClient();
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const fingerprint = createHash("sha256").update(`${forwarded}:${email}`).digest("hex");
  const { data: allowed } = await supabase.rpc("consume_public_rate_limit", {
    rate_bucket: "payment_lookup", rate_subject_hash: fingerprint, rate_max_requests: 15, rate_window_seconds: 900,
  });
  if (!allowed) return NextResponse.json({ error: "Too many attempts. Please wait and try again." }, { status: 429 });
  const { data, error } = await supabase.rpc("get_order_payment_details", { lookup_order_number: orderNumber, lookup_email: email });
  if (error) return NextResponse.json({ error: "Unable to load payment details." }, { status: 400 });
  if (!data) return NextResponse.json({ error: "No matching order was found." }, { status: 404 });
  return NextResponse.json({ order: data });
}
