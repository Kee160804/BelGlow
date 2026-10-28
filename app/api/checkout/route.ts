import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { createClient } from "@/utils/supabase/server";
import { deliverPendingEmails } from "@/lib/resend";

type CheckoutBody = {
  idempotencyKey?: string;
  email?: string;
  phone?: string;
  recipientName?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  district?: string;
  postalCode?: string;
  deliveryNotes?: string;
  fulfillmentMethod?: string;
  paymentMethod?: string;
  customerNote?: string;
  promotionCode?: string;
  items?: Array<{ variantId?: string; quantity?: number }>;
};

export async function POST(request: Request) {
  let body: CheckoutBody;
  try {
    body = await request.json() as CheckoutBody;
  } catch {
    return NextResponse.json({ error: "Invalid checkout request." }, { status: 400 });
  }

  const items = Array.isArray(body.items)
    ? body.items.filter((item) => typeof item.variantId === "string" && Number.isInteger(item.quantity) && Number(item.quantity) > 0)
    : [];
  const fulfillmentMethod = body.fulfillmentMethod === "pickup" ? "pickup" : body.fulfillmentMethod === "delivery" ? "delivery" : "";
  const paymentMethod = new Set(["bank_transfer", "pay_on_delivery", "pay_on_pickup"]).has(body.paymentMethod ?? "") ? body.paymentMethod! : "";
  const needsAddress = fulfillmentMethod === "delivery";
  if (!body.idempotencyKey || !body.email || !body.recipientName || !fulfillmentMethod || !paymentMethod || !items.length || (needsAddress && (!body.addressLine1 || !body.city))) {
    return NextResponse.json({ error: "Complete your contact, delivery, and cart information." }, { status: 400 });
  }

  const supabase = await createClient();
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const fingerprint = createHash("sha256").update(`${forwarded}:${String(body.email).trim().toLowerCase()}`).digest("hex");
  const { data: allowed } = await supabase.rpc("consume_public_rate_limit", { rate_bucket: "checkout", rate_subject_hash: fingerprint, rate_max_requests: 12, rate_window_seconds: 3600 });
  if (!allowed) return NextResponse.json({ error: "Too many checkout attempts. Please wait before trying again." }, { status: 429 });

  // Sellers receive bank transfers directly. BelGlow never collects bank or
  // card credentials from customers in this flow.
  const provider = (process.env.PAYMENT_PROVIDER || "bank_transfer").trim().toLowerCase();
  if (provider !== "bank_transfer") {
    return NextResponse.json({ error: `The ${provider} payment adapter must be connected before checkout can use it.` }, { status: 503 });
  }

  const { data, error } = await supabase.rpc("create_marketplace_order_v2", {
    checkout_items: items.map((item) => ({ variant_id: item.variantId, quantity: item.quantity })),
    checkout_email: body.email,
    checkout_phone: body.phone ?? "",
    checkout_shipping_address: {
      recipient_name: body.recipientName,
      phone: body.phone ?? "",
      address_line_1: body.addressLine1,
      address_line_2: body.addressLine2 ?? "",
      city: body.city,
      district: body.district ?? "",
      postal_code: body.postalCode ?? "",
      country_code: "BZ",
      delivery_notes: body.deliveryNotes ?? "",
    },
    checkout_note: body.customerNote ?? "",
    checkout_promotion_code: body.promotionCode ?? "",
    checkout_fulfillment_method: fulfillmentMethod,
    checkout_payment_method: paymentMethod,
    checkout_idempotency_key: body.idempotencyKey,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const order = Array.isArray(data) ? data[0] : data;
  if (!order) return NextResponse.json({ error: "The order could not be created." }, { status: 500 });

  const { data: paymentDetails } = paymentMethod === "bank_transfer" ? await supabase.rpc("get_order_payment_details", {
    lookup_order_number: order.created_order_number, lookup_email: body.email,
  }) : { data: null };
  try { await deliverPendingEmails({ orderId: order.created_order_id }); }
  catch (emailError) { console.error("Order email delivery failed:", emailError); }

  return NextResponse.json({
    orderId: order.created_order_id,
    orderNumber: order.created_order_number,
    totalCents: order.created_total_cents,
    paymentMethod,
    fulfillmentMethod,
    paymentDetails,
  });
}

