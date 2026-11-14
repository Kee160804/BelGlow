import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { allowPublicRequest } from "@/lib/rate-limit";

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

function matchesFileSignature(type: string, bytes: Uint8Array) {
  if (type === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === "image/png") return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  if (type === "image/webp") return String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  if (type === "application/pdf") return String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-";
  return false;
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 5 * 1024 * 1024 + 64 * 1024) {
    return NextResponse.json({ error: "The upload is larger than 5 MB." }, { status: 413 });
  }

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
  const bytes = new Uint8Array(await receipt.arrayBuffer());
  if (!matchesFileSignature(receipt.type, bytes)) {
    return NextResponse.json({ error: "The file contents do not match the selected file type." }, { status: 400 });
  }

  const allowed = await allowPublicRequest(request, "payment_receipt", email, 8, 3600);
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
  const { error: uploadError } = await admin.storage.from("payment-receipts").upload(path, bytes, { contentType: receipt.type, upsert: false });
  if (uploadError) return NextResponse.json({ error: "The receipt could not be stored. Please try again." }, { status: 500 });
  const { data: submission, error: insertError } = await admin.from("seller_payment_submissions").insert({
    seller_order_id: sellerOrderId, receipt_path: path, original_filename: receipt.name.slice(0, 240),
    mime_type: receipt.type, file_size_bytes: receipt.size, customer_reference: reference || null,
  }).select("id").single();
  if (insertError) {
    await admin.storage.from("payment-receipts").remove([path]);
    console.error("Payment receipt metadata could not be saved:", insertError.message);
    return NextResponse.json({ error: "The receipt could not be recorded. Please try again." }, { status: 500 });
  }
  const { error: statusError } = await admin.from("seller_orders").update({ payment_status: "under_review" }).eq("id", sellerOrderId);
  if (statusError) {
    if (submission) await admin.from("seller_payment_submissions").delete().eq("id", submission.id);
    await admin.storage.from("payment-receipts").remove([path]);
    console.error("Seller payment status could not be updated:", statusError.message);
    return NextResponse.json({ error: "The receipt was uploaded but could not be submitted for review. Please try again." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
