import type { Metadata } from "next";
import { redirect } from "next/navigation";
import CustomerDashboard from "@/components/account/CustomerDashboard";
import { getCurrentProfile } from "@/lib/auth";
import { createAdminClient } from "@/utils/supabase/admin";
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
      .select("id, order_number, status, payment_status, fulfillment_status, cancellation_reason, subtotal_cents, discount_cents, shipping_cents, tax_cents, total_cents, currency, shipping_method_name, placed_at, payments(provider), refunds(status, amount_cents)")
      .eq("user_id", current.user.id)
      .order("placed_at", { ascending: false })
      .limit(100),
    supabase
      .from("addresses")
      .select("id, label, recipient_name, phone, address_line_1, address_line_2, city, district, postal_code, delivery_notes, is_default")
      .eq("user_id", current.user.id)
      .order("is_default", { ascending: false })
      .limit(3),
  ]);

  const orderIds = (orders ?? []).map((order) => order.id);
  const { data: orderedItems } = orderIds.length
    ? await supabase.from("order_items").select("order_id, seller_store_id").in("order_id", orderIds)
    : { data: [] };
  const storeIds = [...new Set((orderedItems ?? []).flatMap((item) => item.seller_store_id ? [item.seller_store_id] : []))];
  const { data: stores } = storeIds.length
    ? await supabase.from("seller_stores").select("id, name").in("id", storeIds)
    : { data: [] };
  const storeNames = new Map((stores ?? []).map((store) => [store.id, store.name]));
  const businessesByOrder = new Map<string, string[]>();
  for (const item of orderedItems ?? []) {
    if (!item.seller_store_id) continue;
    const businessName = storeNames.get(item.seller_store_id);
    if (!businessName) continue;
    const businessNames = businessesByOrder.get(item.order_id) ?? [];
    if (!businessNames.includes(businessName)) businessNames.push(businessName);
    businessesByOrder.set(item.order_id, businessNames);
  }

  const adminClient = orders?.some((order) => order.payments?.some((payment) => payment.provider === "bank_transfer"))
    ? createAdminClient()
    : null;
  const enrichedOrders = await Promise.all((orders ?? []).map(async (order) => {
    const paymentProvider = order.payments?.[0]?.provider;
    if (paymentProvider !== "bank_transfer" || !adminClient) return { ...order, payment_attention: null, business_names: businessesByOrder.get(order.id) ?? [] };
    const { data } = await adminClient.rpc("get_order_payment_details", { lookup_order_number: order.order_number, lookup_email: current.user.email ?? "" });
    const sellers = ((data as { sellers?: Array<{ paymentStatus?: string }> } | null)?.sellers ?? []);
    const statuses = sellers.map((seller) => seller.paymentStatus);
    const paymentAttention: "rejected" | "under_review" | "awaiting_payment" | "confirmed" | null = statuses.includes("rejected") ? "rejected" : statuses.includes("under_review") ? "under_review" : statuses.includes("awaiting_payment") ? "awaiting_payment" : statuses.length > 0 && statuses.every((status) => status === "confirmed") ? "confirmed" : null;
    return { ...order, payment_attention: paymentAttention, business_names: businessesByOrder.get(order.id) ?? [] };
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
