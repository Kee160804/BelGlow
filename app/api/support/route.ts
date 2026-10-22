import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { createClient } from "@/utils/supabase/server";

type SupportBody = {
  requesterType?: string;
  topic?: string;
  name?: string;
  email?: string;
  orderNumber?: string;
  subject?: string;
  message?: string;
  website?: string;
};

const requesterTypes = new Set(["shopper", "seller", "visitor"]);
const topics = new Set(["order", "account", "product", "seller", "payment", "other"]);

export async function POST(request: Request) {
  let body: SupportBody;
  try {
    body = await request.json() as SupportBody;
  } catch {
    return NextResponse.json({ error: "Invalid support request." }, { status: 400 });
  }

  const requesterType = String(body.requesterType ?? "").trim();
  const topic = String(body.topic ?? "").trim();
  const name = String(body.name ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  const orderNumber = String(body.orderNumber ?? "").trim();
  const subject = String(body.subject ?? "").trim();
  const message = String(body.message ?? "").trim();

  // Silently accept honeypot submissions without writing spam to the database.
  if (String(body.website ?? "").trim()) return NextResponse.json({ reference: "REQUEST-RECEIVED" });

  const supabase = await createClient();
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const fingerprint = createHash("sha256").update(`${forwarded}:${email}`).digest("hex");
  const { data: allowed } = await supabase.rpc("consume_public_rate_limit", { rate_bucket: "support", rate_subject_hash: fingerprint, rate_max_requests: 5, rate_window_seconds: 3600 });
  if (!allowed) return NextResponse.json({ error: "Too many requests. Please wait before trying again." }, { status: 429 });

  if (!requesterTypes.has(requesterType) || !topics.has(topic)) return NextResponse.json({ error: "Choose a valid request type and help topic." }, { status: 400 });
  if (name.length < 2 || name.length > 100) return NextResponse.json({ error: "Enter your name." }, { status: 400 });
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  if (orderNumber.length > 40) return NextResponse.json({ error: "The order number is too long." }, { status: 400 });
  if (subject.length < 4 || subject.length > 140) return NextResponse.json({ error: "Enter a short subject." }, { status: 400 });
  if (message.length < 20 || message.length > 4000) return NextResponse.json({ error: "Please describe the issue in 20 to 4,000 characters." }, { status: 400 });

  const { data, error } = await supabase.rpc("submit_support_request", {
    request_type: requesterType,
    request_topic: topic,
    request_name: name,
    request_email: email,
    request_order_number: orderNumber,
    request_subject: subject,
    request_message: message,
  });

  if (error) return NextResponse.json({ error: "Support is temporarily unavailable. Please try again shortly." }, { status: 503 });
  const id = typeof data === "string" ? data : "";
  if (!id) return NextResponse.json({ error: "Your request could not be recorded." }, { status: 500 });

  return NextResponse.json({ reference: `BG-${id.slice(0, 8).toUpperCase()}` });
}
