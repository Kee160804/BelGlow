import type { Metadata } from "next";
import ShopCatalog from "@/components/shop/ShopCatalog";

export const metadata: Metadata = {
  title: "Shop Beauty & Self-Care | BelGlow",
  description: "Shop BelGlow skincare, haircare, body care, fragrance, cosmetics, bath products, natural care, and beauty accessories.",
};

export default async function ShopPage({ searchParams }: PageProps<"/shop">) {
  const params = await searchParams;
  const initialCategory = typeof params.category === "string" ? params.category : "All";
  const initialQuery = typeof params.q === "string" ? params.q : "";
  return <ShopCatalog initialCategory={initialCategory} initialQuery={initialQuery} />;
}
