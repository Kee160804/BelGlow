import "server-only";

import { createAdminClient } from "@/utils/supabase/admin";

type OutboxRow = {
  id: string;
  recipient_email: string;
  subject: string;
  body: string;
  attempts: number;
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  })[character] ?? character);
}

async function sendWithResend(message: OutboxRow) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) throw new Error("Resend is not configured.");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      from,
      to: [message.recipient_email],
      reply_to: process.env.RESEND_REPLY_TO_EMAIL || undefined,
      subject: message.subject,
      text: message.body,
      html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#292527"><div style="border-bottom:3px solid #ef4b74;padding:18px 0"><strong style="font-size:24px">Bel<span style="color:#ef4b74">Glow</span></strong></div><h1 style="font-size:24px;margin:28px 0 12px">${escapeHtml(message.subject)}</h1><p style="font-size:16px;line-height:1.7">${escapeHtml(message.body)}</p><p style="margin-top:30px;color:#75696b;font-size:13px">This is an automated order email from BelGlow.</p></div>`,
    }),
  });
  if (!response.ok) throw new Error(`Resend returned ${response.status}: ${(await response.text()).slice(0, 300)}`);
}

export async function deliverPendingEmails(options: { orderId?: string; limit?: number } = {}) {
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) return { sent: 0, failed: 0, skipped: true };
  const admin = createAdminClient();
  await admin.from("notification_outbox").update({ status: "failed", last_error: "Delivery worker was interrupted; retrying." })
    .eq("status", "processing").lt("updated_at", new Date(Date.now() - 5 * 60_000).toISOString());
  let query = admin.from("notification_outbox").select("id, recipient_email, subject, body, attempts")
    .in("status", ["pending", "failed"]).lt("attempts", 3).order("created_at").limit(options.limit ?? 20);
  if (options.orderId) query = query.eq("order_id", options.orderId);
  const { data, error } = await query;
  if (error) throw error;
  let sent = 0;
  let failed = 0;
  for (const row of (data ?? []) as OutboxRow[]) {
    const { data: claimed } = await admin.from("notification_outbox")
      .update({ status: "processing", attempts: row.attempts + 1 }).eq("id", row.id).in("status", ["pending", "failed"])
      .select("id").maybeSingle();
    if (!claimed) continue;
    try {
      await sendWithResend(row);
      await admin.from("notification_outbox").update({ status: "sent", sent_at: new Date().toISOString(), last_error: null }).eq("id", row.id);
      sent += 1;
    } catch (emailError) {
      await admin.from("notification_outbox").update({ status: "failed", last_error: emailError instanceof Error ? emailError.message.slice(0, 1000) : "Email delivery failed" }).eq("id", row.id);
      failed += 1;
    }
  }
  return { sent, failed, skipped: false };
}
