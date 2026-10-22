"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";

type SupportRequest = {
  id: string;
  requester_type: string;
  topic: string;
  requester_name: string;
  requester_email: string;
  order_number: string | null;
  subject: string;
  message: string;
  status: "new" | "in_progress" | "resolved" | "closed";
  admin_note: string | null;
  created_at: string;
};

export default function AdminSupportManager() {
  const [requests, setRequests] = useState<SupportRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const { data, error: loadError } = await createClient().from("support_requests").select("id, requester_type, topic, requester_name, requester_email, order_number, subject, message, status, admin_note, created_at").order("created_at", { ascending: false }).limit(200);
    setLoading(false);
    if (loadError) setError(loadError.message);
    else setRequests((data ?? []) as SupportRequest[]);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function updateRequest(request: SupportRequest, status: SupportRequest["status"]) {
    const note = window.prompt("Internal admin note (optional):", request.admin_note ?? "");
    if (note === null) return;
    setBusyId(request.id);
    setError("");
    const { error: updateError } = await createClient().from("support_requests").update({ status, admin_note: note.trim() || null }).eq("id", request.id);
    setBusyId("");
    if (updateError) setError(updateError.message);
    else await load();
  }

  if (loading) return <section className="rounded-2xl border border-[#e9dfdc] bg-white p-8 text-center text-sm text-[#756a6d]">Loading support requests…</section>;
  return <section className="rounded-2xl border border-[#e9dfdc] bg-white p-5">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-lg font-bold">Contact and support inbox</h2><p className="mt-1 text-sm text-[#756a6d]">Review shopper, seller, product, and order issues submitted through the public contact page.</p></div><span className="rounded-full bg-[#f2dfdb] px-3 py-1 text-xs font-bold text-[#97504d]">{requests.filter((request) => request.status === "new").length} new</span></div>
    {error && <p role="alert" className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
    <div className="mt-5 divide-y divide-[#eee5e1]">{requests.map((request) => <article key={request.id} className="py-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-bold">{request.subject}</p><p className="mt-1 text-xs text-[#817679]">{request.requester_name} · {request.requester_email} · {request.requester_type} · {request.topic}{request.order_number ? ` · Order ${request.order_number}` : ""}</p></div><span className="rounded-full bg-[#faf3f1] px-3 py-1 text-xs font-bold capitalize">{request.status.replace("_", " ")}</span></div>
      <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[#62595c]">{request.message}</p>
      {request.admin_note && <p className="mt-3 rounded-xl bg-[#faf6f4] p-3 text-xs text-[#756a6d]"><strong>Internal note:</strong> {request.admin_note}</p>}
      <div className="mt-4 flex flex-wrap gap-2"><a href={`mailto:${request.requester_email}?subject=${encodeURIComponent(`Re: ${request.subject}`)}`} className="rounded-lg border border-[#d9b9b4] px-3 py-2 text-xs font-bold text-[#9b514f]">Reply by email</a>{request.status !== "in_progress" && <button disabled={busyId === request.id} onClick={() => void updateRequest(request, "in_progress")} className="rounded-lg border border-[#d9b9b4] px-3 py-2 text-xs font-bold">Mark in progress</button>}{request.status !== "resolved" && <button disabled={busyId === request.id} onClick={() => void updateRequest(request, "resolved")} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white">Resolve</button>}</div>
    </article>)}{!requests.length && <p className="py-8 text-center text-sm text-[#756a6d]">No support requests have been submitted.</p>}</div>
  </section>;
}
