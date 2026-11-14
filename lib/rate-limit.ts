import "server-only";

import { createHash } from "node:crypto";
import { createAdminClient } from "@/utils/supabase/admin";

export type PublicRateLimitBucket =
  | "checkout"
  | "order_tracking"
  | "payment_lookup"
  | "payment_receipt"
  | "support";

function clientIp(request: Request) {
  const platformIp = request.headers.get("x-vercel-forwarded-for")
    ?? request.headers.get("cf-connecting-ip");
  if (platformIp?.trim()) return platformIp.split(",")[0].trim();

  // Standard proxy chains append their observed client address to X-Forwarded-For.
  // Configure the hosting proxy to overwrite/append this header; never expose
  // the app server directly to untrusted traffic.
  const forwarded = request.headers.get("x-forwarded-for")
    ?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return forwarded?.at(-1) ?? request.headers.get("x-real-ip")?.trim() ?? "unknown";
}

export async function allowPublicRequest(
  request: Request,
  bucket: PublicRateLimitBucket,
  subject: string,
  maxRequests: number,
  windowSeconds: number,
) {
  const subjectHash = createHash("sha256")
    .update(`${clientIp(request)}:${subject.trim().toLowerCase()}`)
    .digest("hex");

  try {
    const { data, error } = await createAdminClient().rpc("consume_public_rate_limit", {
      rate_bucket: bucket,
      rate_subject_hash: subjectHash,
      rate_max_requests: maxRequests,
      rate_window_seconds: windowSeconds,
    });
    if (error) throw error;
    return data === true;
  } catch (error) {
    console.error("Public request rate-limit check failed:", error instanceof Error ? error.message : "Unknown error");
    // Fail closed when the abuse-control store is unavailable.
    return false;
  }
}
