import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

export async function POST(request: Request) {
  let form: FormData;
  try { form = await request.formData(); } catch { return NextResponse.json({ error: "Invalid upload." }, { status: 400 }); }
  const orderNumber = Number(form.get("orderNumber"));
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const sellerOrderId = String(form.get("sellerOrderId") ?? "");
  const reference = String(form.get("reference") ?? "").trim().slice(0, 200);
  const receipt = form.get("receipt");
  if (!Number.isSafeInteger(orderNumber) || !email.includes("@") || !/^[0-9a-f-]{36}$/i.test(sellerOrderId) || !(receipt instanceof File)) {
    return NextResponse.json({ error: "Complete the order, email, and receipt information." }, { status: 400 });
  }
  if (!allowedTypes.has(receipt.type) || receipt.size < 1 || receipt.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: "Upload a JPG, PNG, WebP, or PDF no larger than 5 MB." }, { status: 400 });
  }

  const publicClient = await createClient();
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const fingerprint = createHash("sha256").update(`${forwarded}:${email}`).digest("hex");
  const { data: allowed } = await publicClient.rpc("consume_public_rate_limit", {
    rate_bucket: "payment_receipt", rate_subject_hash: fingerprint, rate_max_requests: 8, rate_window_seconds: 3600,
  });
  if (!allowed) return NextResponse.json({ error: "Too many uploads. Please wait before trying again." }, { status: 429 });

  const admin = createAdminClient();
  const { data: sellerOrder } = await admin.from("seller_orders")
    .select("id, order_id, seller_store_id, payment_status").eq("id", sellerOrderId).maybeSingle();
  if (!sellerOrder) return NextResponse.json({ error: "Seller order not found." }, { status: 404 });
  const { data: order } = await admin.from("orders").select("order_number, email").eq("id", sellerOrder.order_id).maybeSingle();
  if (!order || Number(order.order_number) !== orderNumber || order.email.toLowerCase() !== email) {
    return NextResponse.json({ error: "The order information does not match." }, { status: 403 });
  }
  if (sellerOrder.payment_status === "confirmed") return NextResponse.json({ error: "This payment is already confirmed." }, { status: 409 });
  const { data: pending } = await admin.from("seller_payment_submissions").select("id")
    .eq("seller_order_id", sellerOrderId).eq("status", "pending").maybeSingle();
  if (pending) return NextResponse.json({ error: "A receipt is already awaiting seller review." }, { status: 409 });

  const extension = receipt.type === "application/pdf" ? "pdf" : receipt.type.split("/")[1].replace("jpeg", "jpg");
  const path = `${sellerOrder.seller_store_id}/${sellerOrderId}/${randomUUID()}.${extension}`;
  const bytes = new Uint8Array(await receipt.arrayBuffer());
  const { error: uploadError } = await admin.storage.from("payment-receipts").upload(path, bytes, { contentType: receipt.type, upsert: false });
  if (uploadError) return NextResponse.json({ error: "The receipt could not be stored. Please try again." }, { status: 500 });
  const { error: insertError } = await admin.from("seller_payment_submissions").insert({
    seller_order_id: sellerOrderId, receipt_path: path, original_filename: receipt.name.slice(0, 240),
    mime_type: receipt.type, file_size_bytes: receipt.size, customer_reference: reference || null,
  });
  if (insertError) {
    await admin.storage.from("payment-receipts").remove([path]);
    return NextResponse.json({ error: insertError.message }, { status: 400 });
  }
  await admin.from("seller_orders").update({ payment_status: "under_review" }).eq("id", sellerOrderId);
  return NextResponse.json({ ok: true });
}
