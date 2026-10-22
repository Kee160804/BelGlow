import type { Metadata } from "next";
import OrderTracker from "@/components/orders/OrderTracker";

export const metadata: Metadata = { title: "Track an Order | BelGlow", description: "Track a BelGlow guest order using the order number and checkout email." };
export default function TrackOrderPage() { return <OrderTracker />; }
