import type { Metadata } from "next";
import { notFound } from "next/navigation";
import AdminDashboard from "@/components/admin/AdminDashboard";

const sections = ["sellers", "approvals", "orders", "commission", "payouts", "customers", "settings"] as const;

export async function generateMetadata({ params }: PageProps<"/admin/[section]">): Promise<Metadata> {
  const section = (await params).section;
  const title = section.charAt(0).toUpperCase() + section.slice(1);
  return { title: `${title} | BelGlow Admin` };
}

export default async function AdminSectionPage({ params }: PageProps<"/admin/[section]">) {
  const { section } = await params;
  if (!sections.includes(section as (typeof sections)[number])) notFound();
  return <AdminDashboard />;
}
