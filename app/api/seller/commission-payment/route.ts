import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function POST(request: Request) {
  let body: { expectedAmountCents?: number };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid payment request." }, { status: 400 }); }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in again to pay your commission invoice." }, { status: 401 });

  const { data: store } = await supabase.from("seller_stores").select("id").eq("owner_id", user.id).maybeSingle();
  if (!store) return NextResponse.json({ error: "No seller store is connected to this account." }, { status: 404 });

  const { data: entries, error } = await supabase.from("seller_commission_entries").select("amount_cents").eq("seller_store_id", store.id);
  if (error) return NextResponse.json({ error: "Unable to verify the commission balance." }, { status: 400 });
  const balance = (entries ?? []).reduce((sum, entry) => sum + Number(entry.amount_cents), 0);
  if (balance <= 0) return NextResponse.json({ error: "There is no outstanding commission balance to pay." }, { status: 400 });
  if (body.expectedAmountCents !== balance) return NextResponse.json({ error: "Your commission balance changed. Refresh the page before paying." }, { status: 409 });

  return NextResponse.json({
    error: "The commission checkout is ready, but Belize Bank’s gateway credentials and signed request format still need to be configured.",
    code: "gateway_not_configured",
  }, { status: 503 });
}
