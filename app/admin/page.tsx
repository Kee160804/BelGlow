import type { Metadata } from "next";
import AdminDashboard from "@/components/admin/AdminDashboard";
import { requireAdmin } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Admin Dashboard | BelGlow",
  description: "Manage the BelGlow marketplace, sellers, commissions, products, and payouts.",
};

export default async function AdminPage() {
  const current = await requireAdmin();
  return <AdminDashboard initialUserName={current.profile.full_name || current.user.email?.split("@")[0] || "Administrator"} />;
}
