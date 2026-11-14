import type { Metadata } from "next";
import OrderTracker from "@/components/orders/OrderTracker";

export const metadata: Metadata = { title: "Track an Order | BelGlow", description: "Track a BelGlow guest order using the order number and checkout email." };
export default async function TrackOrderPage({ searchParams }: PageProps<"/track-order">) {
  const params = await searchParams;
  const order = typeof params.order === "string" ? params.order : "";
  return <OrderTracker initialOrderNumber={/^\d{1,20}$/.test(order) ? order : ""} />;
}
