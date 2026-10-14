"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";

type Notice = { id: string; title: string; body: string | null; href: string | null; read_at: string | null; created_at: string };

export default function NotificationBell({ dark = false }: { dark?: boolean }) {
  const [open, setOpen] = useState(false);
  const [notices, setNotices] = useState<Notice[]>([]);
  const load = useCallback(async () => { const { data } = await createClient().from("notifications").select("id, title, body, href, read_at, created_at").order("created_at", { ascending: false }).limit(12); setNotices((data ?? []) as Notice[]); }, []);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  const unread = notices.filter((notice) => !notice.read_at).length;
  async function markRead() { const ids = notices.filter((notice) => !notice.read_at).map((notice) => notice.id); if (!ids.length) return; await createClient().from("notifications").update({ read_at: new Date().toISOString() }).in("id", ids); await load(); }
  return <div className="relative"><button onClick={() => setOpen((value) => !value)} className={`relative rounded-full p-2 ${dark ? "text-white" : ""}`} aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}><Bell size={20} />{unread > 0 && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500" />}</button>{open && <div className="absolute right-0 top-12 z-50 w-80 overflow-hidden rounded-2xl border border-[#eadeda] bg-white p-2 text-[#292527] shadow-2xl"><div className="flex items-center justify-between px-3 py-2"><p className="text-sm font-bold">Notifications</p>{unread > 0 && <button onClick={() => void markRead()} className="text-[11px] font-bold text-[#a95b58]">Mark all read</button>}</div><div className="max-h-80 overflow-y-auto">{notices.map((notice) => <Link key={notice.id} href={notice.href || "#"} onClick={() => setOpen(false)} className={`block rounded-xl px-3 py-3 text-sm hover:bg-[#f8f1ef] ${notice.read_at ? "opacity-65" : "bg-[#fff7f5]"}`}><strong className="block">{notice.title}</strong>{notice.body && <span className="mt-1 block text-xs leading-5 text-[#756a6d]">{notice.body}</span>}</Link>)}{!notices.length && <p className="px-3 py-6 text-center text-xs text-[#817679]">No notifications yet.</p>}</div></div>}</div>;
}
