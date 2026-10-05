"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

export default function PasswordUpdateForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirmation = String(form.get("confirmation") ?? "");
    if (password !== confirmation) {
      setError("The passwords do not match.");
      return;
    }

    setBusy(true);
    setError("");
    const { error: updateError } = await createClient().auth.updateUser({ password });
    setBusy(false);
    if (updateError) setError(updateError.message);
    else setSaved(true);
  }

  return <section className="w-full max-w-md rounded-3xl bg-white p-8 shadow-xl">
    <h1 className="text-3xl font-black">Choose a new password</h1>
    <p className="mt-2 text-sm text-[#75696e]">Use at least 8 characters for your BelGlow account.</p>
    {saved ? <div role="status" className="mt-6 rounded-2xl bg-emerald-50 p-5 text-sm text-emerald-800">Your password has been updated.<button onClick={() => router.replace("/account")} className="mt-4 block font-bold underline">Continue to your account</button></div> : <form onSubmit={submit} className="mt-6 space-y-4">
      <label className="block text-sm font-bold">New password<input name="password" type="password" minLength={8} autoComplete="new-password" required className="mt-2 h-12 w-full rounded-xl border border-[#e7dade] px-4 font-normal" /></label>
      <label className="block text-sm font-bold">Confirm password<input name="confirmation" type="password" minLength={8} autoComplete="new-password" required className="mt-2 h-12 w-full rounded-xl border border-[#e7dade] px-4 font-normal" /></label>
      {error && <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
      <button disabled={busy} className="w-full rounded-full bg-[#ef4b74] py-3.5 font-bold text-white disabled:opacity-50">{busy ? "Updating…" : "Update password"}</button>
    </form>}
  </section>;
}
