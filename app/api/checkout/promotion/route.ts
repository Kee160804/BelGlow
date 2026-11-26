import { NextResponse } from "next/server";
import { allowPublicRequest } from "@/lib/rate-limit";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";

type PreviewBody = {
  code?: string;
  items?: Array<{ variantId?: string; quantity?: number }>;
};

function invalid(message: string) {
  return NextResponse.json({ valid: false, message });
}

export async function POST(request: Request) {
  let body: PreviewBody;
  try {
    body = await request.json() as PreviewBody;
  } catch {
    return NextResponse.json({ error: "Invalid promotion request." }, { status: 400 });
  }

  const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
  const items = Array.isArray(body.items) ? body.items : [];
  if (!/^[A-Z0-9_-]{3,40}$/.test(code)) return invalid("Enter a valid promotion code.");
  if (!items.length || items.length > 100 || items.some((item) => typeof item.variantId !== "string" || !Number.isInteger(item.quantity) || Number(item.quantity) < 1 || Number(item.quantity) > 99)) {
    return NextResponse.json({ error: "Your cart could not be checked for this promotion." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to apply a promotion." }, { status: 401 });
  const allowed = await allowPublicRequest(request, "checkout", `promotion-preview:${user.id}`, 30, 600);
  if (!allowed) return NextResponse.json({ error: "Too many promotion checks. Please wait a moment." }, { status: 429 });

  try {
    const admin = createAdminClient();
    const { data: promotions, error: promotionError } = await admin.from("promotions")
      .select("id, seller_store_id, code, name, discount_type, discount_value, minimum_order_cents, maximum_discount_cents, usage_limit, usage_count, starts_at, ends_at, is_active")
      .eq("is_active", true)
      .limit(500);
    if (promotionError) throw promotionError;
    const promotion = (promotions ?? []).find((entry) => entry.code.trim().toUpperCase() === code);
    if (!promotion) return invalid("That promotion code is not active.");
    const now = Date.now();
    if (promotion.starts_at && new Date(promotion.starts_at).getTime() > now) return invalid("That promotion has not started yet.");
    if (promotion.ends_at && new Date(promotion.ends_at).getTime() <= now) return invalid("That promotion has expired.");
    if (promotion.usage_limit !== null && promotion.usage_count >= promotion.usage_limit) return invalid("That promotion has reached its usage limit.");

    const variantIds = [...new Set(items.map((item) => item.variantId as string))];
    if (variantIds.length !== items.length) return NextResponse.json({ error: "Remove duplicate cart lines and try again." }, { status: 400 });
    const { data: variants, error: variantError } = await admin.from("product_variants")
      .select("id, product_id, price_cents, is_active")
      .in("id", variantIds);
    if (variantError) throw variantError;
    if (!variants || variants.length !== variantIds.length || variants.some((variant) => !variant.is_active)) return invalid("A product in your cart is no longer available.");

    const productIds = [...new Set(variants.map((variant) => variant.product_id))];
    const { data: products, error: productError } = await admin.from("products")
      .select("id, seller_store_id, base_price_cents, status")
      .in("id", productIds);
    if (productError) throw productError;
    const productsById = new Map((products ?? []).map((product) => [product.id, product]));
    let eligibleSubtotalCents = 0;
    for (const item of items) {
      const variant = variants.find((entry) => entry.id === item.variantId);
      const product = variant ? productsById.get(variant.product_id) : null;
      if (!variant || !product || product.status !== "active") return invalid("A product in your cart is no longer available.");
      if (!promotion.seller_store_id || promotion.seller_store_id === product.seller_store_id) {
        const unitPrice = Number(variant.price_cents ?? product.base_price_cents);
        eligibleSubtotalCents += unitPrice * Number(item.quantity);
      }
    }

    if (promotion.seller_store_id && eligibleSubtotalCents === 0) return invalid("This code only applies to products from the seller who created it.");
    if (eligibleSubtotalCents < Number(promotion.minimum_order_cents)) return invalid(`Add BZ$${((Number(promotion.minimum_order_cents) - eligibleSubtotalCents) / 100).toFixed(2)} more in eligible items to use this code.`);

    let discountCents = promotion.discount_type === "percentage"
      ? Math.round(eligibleSubtotalCents * Number(promotion.discount_value) / 100)
      : Math.min(eligibleSubtotalCents, Number(promotion.discount_value));
    if (promotion.maximum_discount_cents !== null) discountCents = Math.min(discountCents, Number(promotion.maximum_discount_cents));

    return NextResponse.json({
      valid: true,
      code: promotion.code,
      name: promotion.name,
      discountCents,
      eligibleSubtotalCents,
    });
  } catch (error) {
    console.error("Promotion validation failed:", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: "Unable to validate this promotion right now." }, { status: 503 });
  }
}
