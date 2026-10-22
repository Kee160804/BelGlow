import type { Metadata } from "next";
import ProductRouteClient from "@/components/products/ProductRouteClient";
import { createClient } from "@/utils/supabase/server";

export async function generateMetadata({ params }: PageProps<"/product/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const { data: product } = await (await createClient()).from("products").select("name, short_description, description").eq("slug", slug).eq("status", "published").maybeSingle();
  if (!product) return { title: "Product not found" };
  return { title: product.name, description: product.short_description || product.description?.slice(0, 160) || `Shop ${product.name} on BelGlow.` };
}

export default async function ProductPage({ params }: PageProps<"/product/[slug]">) {
  const { slug } = await params;
  return <ProductRouteClient slug={slug} />;
}
