import type { Metadata } from "next";
import { notFound } from "next/navigation";
import SellerStorefront from "@/components/shop/SellerStorefront";
import { createClient } from "@/utils/supabase/server";

export async function generateMetadata({ params }: PageProps<"/store/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const { data: store } = await (await createClient()).from("seller_stores").select("name, description, brand_story").eq("slug", slug).eq("status", "approved").maybeSingle();
  if (!store) return { title: "Store not found" };
  return { title: store.name, description: store.description || store.brand_story?.slice(0, 160) || `Shop ${store.name} on BelGlow.` };
}

export default async function StorePage({ params }: PageProps<"/store/[slug]">) {
  const { slug } = await params;
  const supabase = await createClient();
  const storeResult = await supabase.from("seller_stores").select("id, name, description, brand_story, location, delivery_areas, delivery_instructions, preparation_days_min, preparation_days_max, return_window_days").eq("slug", slug).eq("status", "approved").maybeSingle();
  const legacyResult = storeResult.error?.message.includes("delivery_areas")
    ? await supabase.from("seller_stores").select("id, name, description, brand_story, location, preparation_days_min, preparation_days_max, return_window_days").eq("slug", slug).eq("status", "approved").maybeSingle()
    : null;
  const store = storeResult.data ?? legacyResult?.data;
  if (!store) notFound();
  return <SellerStorefront store={{ ...store, delivery_areas: "delivery_areas" in store && typeof store.delivery_areas === "string" ? store.delivery_areas : null, delivery_instructions: "delivery_instructions" in store && typeof store.delivery_instructions === "string" ? store.delivery_instructions : null }} />;
}
