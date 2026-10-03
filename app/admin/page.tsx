import type { Metadata } from "next";
import AdminDashboard from "@/components/admin/AdminDashboard";

export const metadata: Metadata = {
  title: "Admin Dashboard | BelGlow",
  description: "Manage the BelGlow marketplace, sellers, commissions, products, and payouts.",
};

export default function AdminPage() {
  return <AdminDashboard />;
}
