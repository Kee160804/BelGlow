"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { ShieldCheck, UserMinus, UserPlus } from "lucide-react";
import { createClient } from "@/utils/supabase/client";

type AdminAccount = { user_id: string; email: string; full_name: string | null; granted_at: string };

export default function AdminAccessManager() {
  const [admins, setAdmins] = useState<AdminAccount[]>([]);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadAdmins = useCallback(async () => {
    const { data, error: queryError } = await createClient().rpc("list_platform_admins");
    if (queryError) setError(queryError.message);
    else setAdmins((data ?? []) as AdminAccount[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadAdmins(), 0);
    return () => window.clearTimeout(timer);
  }, [loadAdmins]);

  async function changeAdminAccess(event: FormEvent<HTMLFormElement>, grant: boolean) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    const { error: actionError } = await createClient().rpc("set_platform_admin", {
      target_email: email.trim(),
      grant_access: grant,
    });
    setBusy(false);
    if (actionError) setError(actionError.message);
    else {
      setNotice(grant ? `Administrator access granted to ${email.trim()}.` : `Administrator access removed from ${email.trim()}.`);
      setEmail("");
      await loadAdmins();
    }
  }

  async function revokeAdmin(emailToRevoke: string) {
    setBusy(true);
    setError("");
    setNotice("");
    const { error: actionError } = await createClient().rpc("set_platform_admin", {
      target_email: emailToRevoke,
      grant_access: false,
    });
    setBusy(false);
    if (actionError) setError(actionError.message);
    else {
      setNotice(`Administrator access removed from ${emailToRevoke}.`);
      await loadAdmins();
    }
  }

  return <section className="rounded-2xl border border-[#e9dfdc] bg-white p-5 shadow-sm">
    <div className="flex items-start gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#f2dfdb] text-[#a75754]"><ShieldCheck /></span><div><h2 className="text-lg font-bold">Administrator access</h2><p className="mt-1 text-sm leading-6 text-[#756a6d]">Grant or remove BelGlow platform access for existing accounts. Admin permissions are separate from seller accounts, so one person can have both.</p></div></div>
    <form onSubmit={(event) => void changeAdminAccess(event, true)} className="mt-5 flex flex-col gap-3 sm:flex-row"><label className="sr-only" htmlFor="admin-account-email">Account email to make an admin</label><input id="admin-account-email" value={email} onChange={(event) => setEmail(event.target.value)} type="email" required placeholder="Existing BelGlow account email" className="h-12 min-w-0 flex-1 rounded-xl border border-[#ddd2cf] px-4 text-sm" /><button disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#292326] px-5 py-3 text-sm font-bold text-white disabled:opacity-50"><UserPlus size={17} />Grant admin access</button></form>
    {error && <p role="alert" className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
    {notice && <p role="status" className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</p>}
    <div className="mt-6 border-t border-[#eee5e2] pt-4"><h3 className="text-sm font-bold">Current platform administrators</h3>{loading ? <p className="mt-3 text-sm text-[#756a6d]">Loading admin accounts…</p> : admins.length ? <ul className="mt-2 divide-y divide-[#eee5e2]">{admins.map((admin) => <li key={admin.user_id} className="flex flex-wrap items-center gap-3 py-3"><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{admin.full_name || admin.email}</p><p className="truncate text-xs text-[#817679]">{admin.email}</p></div><button type="button" disabled={busy} onClick={() => void revokeAdmin(admin.email)} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-2 text-xs font-bold text-rose-700 disabled:opacity-50"><UserMinus size={14} />Remove admin</button></li>)}</ul> : <p className="mt-3 text-sm text-[#756a6d]">No administrator accounts were found.</p>}</div>
    <p className="mt-3 text-xs leading-5 text-[#817679]">The account must already exist in BelGlow. The last administrator cannot be removed.</p>
  </section>;
}
