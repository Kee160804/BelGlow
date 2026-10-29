import type { Metadata } from "next";
import { redirect } from "next/navigation";
import CustomerDashboard from "@/components/account/CustomerDashboard";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/utils/supabase/server";

export const metadata: Metadata = {
  title: "My Account | BelGlow",
  description: "Open the BelGlow workspace connected to your account.",
};

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ order?: string | string[] }> }) {
  const requestedOrder = Number((await searchParams).order);
  const current = await getCurrentProfile();

  if (!current) redirect("/?login=required");
  const accountRole = current.profile.role === "admin" || current.profile.role === "staff" ? "admin" : current.profile.role === "seller" ? "seller" : "shopper";

  const supabase = await createClient();
  const [{ data: orders }, { data: addresses }] = await Promise.all([
    supabase
      .from("orders")
      .select("id, order_number, status, payment_status, fulfillment_status, total_cents, placed_at, payments(provider)")
      .eq("user_id", current.user.id)
      .order("placed_at", { ascending: false })
      .limit(8),
    supabase
      .from("addresses")
      .select("id, label, recipient_name, phone, address_line_1, address_line_2, city, district, postal_code, delivery_notes, is_default")
      .eq("user_id", current.user.id)
      .order("is_default", { ascending: false })
      .limit(3),
  ]);

  const enrichedOrders = await Promise.all((orders ?? []).map(async (order) => {
    const paymentProvider = order.payments?.[0]?.provider;
    if (paymentProvider !== "bank_transfer") return { ...order, payment_attention: null };
    const { data } = await supabase.rpc("get_order_payment_details", { lookup_order_number: order.order_number, lookup_email: current.user.email ?? "" });
    const sellers = ((data as { sellers?: Array<{ paymentStatus?: string }> } | null)?.sellers ?? []);
    const statuses = sellers.map((seller) => seller.paymentStatus);
    const paymentAttention: "rejected" | "under_review" | "awaiting_payment" | "confirmed" | null = statuses.includes("rejected") ? "rejected" : statuses.includes("under_review") ? "under_review" : statuses.includes("awaiting_payment") ? "awaiting_payment" : statuses.length > 0 && statuses.every((status) => status === "confirmed") ? "confirmed" : null;
    return { ...order, payment_attention: paymentAttention };
  }));

  return (
    <CustomerDashboard
      name={current.profile.full_name || current.user.user_metadata?.full_name || current.user.email?.split("@")[0] || "BelGlow shopper"}
      email={current.user.email ?? ""}
      phone={current.profile.phone ?? ""}
      role={accountRole}
      orders={enrichedOrders}
      addresses={addresses ?? []}
      initialOrderNumber={Number.isSafeInteger(requestedOrder) && requestedOrder > 0 ? requestedOrder : undefined}
    />
  );
}
