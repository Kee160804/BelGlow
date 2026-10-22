import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { createClient } from "@/utils/supabase/server";

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
  shippingCode?: string;
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
  if (!body.idempotencyKey || !body.email || !body.recipientName || !body.addressLine1 || !body.city || !body.shippingCode || !items.length) {
    return NextResponse.json({ error: "Complete your contact, delivery, and cart information." }, { status: 400 });
  }

  const supabase = await createClient();
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const fingerprint = createHash("sha256").update(`${forwarded}:${String(body.email).trim().toLowerCase()}`).digest("hex");
  const { data: allowed } = await supabase.rpc("consume_public_rate_limit", { rate_bucket: "checkout", rate_subject_hash: fingerprint, rate_max_requests: 12, rate_window_seconds: 3600 });
  if (!allowed) return NextResponse.json({ error: "Too many checkout attempts. Please wait before trying again." }, { status: 429 });

  // Manual/cash-on-delivery is the safe built-in provider. A card processor can
  // replace this through PAYMENT_PROVIDER without sending card data to BelGlow.
  const provider = (process.env.PAYMENT_PROVIDER || "cash_on_delivery").trim().toLowerCase();
  if (!new Set(["manual", "cash_on_delivery"]).has(provider)) {
    return NextResponse.json({ error: `The ${provider} payment adapter must be connected before checkout can use it.` }, { status: 503 });
  }

  const { data, error } = await supabase.rpc("create_marketplace_order", {
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
    checkout_shipping_code: body.shippingCode,
    checkout_note: body.customerNote ?? "",
    checkout_promotion_code: body.promotionCode ?? "",
    checkout_provider: provider,
    checkout_idempotency_key: body.idempotencyKey,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const order = Array.isArray(data) ? data[0] : data;
  if (!order) return NextResponse.json({ error: "The order could not be created." }, { status: 500 });

  return NextResponse.json({
    orderId: order.created_order_id,
    orderNumber: order.created_order_number,
    totalCents: order.created_total_cents,
    paymentMethod: provider === "cash_on_delivery" ? "Pay on delivery" : "Manual payment",
  });
}

