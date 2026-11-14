import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { allowPublicRequest } from "@/lib/rate-limit";

export async function POST(request: Request) {
  let body: { orderNumber?: string | number; email?: string };
  try { body = await request.json() as typeof body; } catch { return NextResponse.json({ error: "Invalid tracking request." }, { status: 400 }); }
  const orderNumber = Number(body.orderNumber);
  const email = String(body.email ?? "").trim().toLowerCase();
  if (!Number.isSafeInteger(orderNumber) || orderNumber < 1 || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Enter a valid order number and checkout email." }, { status: 400 });

  const allowed = await allowPublicRequest(request, "order_tracking", email, 10, 900);
  if (!allowed) return NextResponse.json({ error: "Too many lookup attempts. Please wait before trying again." }, { status: 429 });

  const { data, error } = await createAdminClient().rpc("track_guest_order", { lookup_order_number: orderNumber, lookup_email: email });
  if (error) return NextResponse.json({ error: "Order tracking is temporarily unavailable." }, { status: 503 });
  if (!data) return NextResponse.json({ error: "No order matched those details." }, { status: 404 });
  return NextResponse.json({ order: data });
}
