import type { Metadata } from "next";
import ProductRouteClient from "@/components/products/ProductRouteClient";

export async function generateMetadata({ params }: PageProps<"/product/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  return { title: `${slug.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ")} | BelGlow` };
}

export default async function ProductPage({ params }: PageProps<"/product/[slug]">) {
  const { slug } = await params;
  return <ProductRouteClient slug={slug} />;
}
