import { createClient } from "@/utils/supabase/client";

export type SellerCommissionLedgerEntry = {
  id: string;
  entry_type: "sale_commission" | "payment" | "adjustment" | "refund";
  amount_cents: number;
  description: string;
  external_reference: string | null;
  created_at: string;
};

export async function readSellerCommissionLedger(storeId: string): Promise<{
  entries: SellerCommissionLedgerEntry[];
  error: { message: string } | null;
}> {
  const supabase = createClient();
  const pageSize = 1000;
  const entries: SellerCommissionLedgerEntry[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase.from("seller_commission_entries")
      .select("id, entry_type, amount_cents, description, external_reference, created_at")
      .eq("seller_store_id", storeId)
      .order("created_at")
      .order("id")
      .range(offset, offset + pageSize - 1);
    if (error) return { entries: [], error };
    entries.push(...((data ?? []) as SellerCommissionLedgerEntry[]));
    if (!data || data.length < pageSize) break;
    offset += pageSize;
  }

  entries.sort((first, second) => new Date(second.created_at).getTime() - new Date(first.created_at).getTime());
  return { entries, error: null };
}

export function sellerCommissionBalance(entries: SellerCommissionLedgerEntry[]): number {
  return entries.reduce((balance, entry) => balance + Number(entry.amount_cents), 0);
}
