import type { Metadata } from "next";
import { notFound } from "next/navigation";
import SellerDashboard from "@/components/dashboard/SellerDashboard";
import { requireSeller } from "@/lib/auth";

const sections = [
  "products", "add-product", "orders", "inventory", "customers", "reviews",
  "promotions", "analytics", "payouts", "store-profile", "settings",
] as const;

export async function generateMetadata({ params }: PageProps<"/dashboard/[section]">): Promise<Metadata> {
  const section = (await params).section;
  const title = section.split("-").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
  return { title: `${title} | BelGlow Seller` };
}

export default async function SellerSectionPage({ params }: PageProps<"/dashboard/[section]">) {
  const { section } = await params;
  if (!sections.includes(section as (typeof sections)[number])) notFound();
  await requireSeller();
  return <SellerDashboard />;
}
