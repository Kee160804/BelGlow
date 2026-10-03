import type { Metadata } from "next";
import CategoryDirectory from "@/components/categories/CategoryDirectory";

export const metadata: Metadata = {
  title: "Shop All Categories | BelGlow",
  description: "Explore BelGlow skincare, haircare, body care, cosmetics, fragrance, gentle care, natural products, accessories, and self-care sets.",
};

export default function CategoriesPage() {
  return <CategoryDirectory />;
}
