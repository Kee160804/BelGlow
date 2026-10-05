import type { Metadata } from "next";
import SellerDashboard from "@/components/dashboard/SellerDashboard";
import { requireSeller } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Seller Dashboard | BelGlow",
  description: "Manage BelGlow marketplace products, orders, inventory, and payouts.",
};

export default async function DashboardPage() {
  await requireSeller();
  return <SellerDashboard />;
}
