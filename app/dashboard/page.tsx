import type { Metadata } from "next";
import SellerDashboard from "@/components/dashboard/SellerDashboard";

export const metadata: Metadata = {
  title: "Seller Dashboard | BelGlow",
  description: "Manage BelGlow marketplace products, orders, inventory, and payouts.",
};

export default function DashboardPage() {
  return <SellerDashboard />;
}
