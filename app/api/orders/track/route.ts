import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function POST(request: Request) {
  let body: { orderNumber?: string | number; email?: string };
  try { body = await request.json() as typeof body; } catch { return NextResponse.json({ error: "Invalid tracking request." }, { status: 400 }); }
  const orderNumber = Number(body.orderNumber);
  const email = String(body.email ?? "").trim().toLowerCase();
  if (!Number.isSafeInteger(orderNumber) || orderNumber < 1 || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Enter a valid order number and checkout email." }, { status: 400 });

  const supabase = await createClient();
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const fingerprint = createHash("sha256").update(`${forwarded}:${email}`).digest("hex");
  const { data: allowed } = await supabase.rpc("consume_public_rate_limit", { rate_bucket: "order_tracking", rate_subject_hash: fingerprint, rate_max_requests: 10, rate_window_seconds: 900 });
  if (!allowed) return NextResponse.json({ error: "Too many lookup attempts. Please wait before trying again." }, { status: 429 });

  const { data, error } = await supabase.rpc("track_guest_order", { lookup_order_number: orderNumber, lookup_email: email });
  if (error) return NextResponse.json({ error: "Order tracking is temporarily unavailable." }, { status: 503 });
  if (!data) return NextResponse.json({ error: "No order matched those details." }, { status: 404 });
  return NextResponse.json({ order: data });
}
