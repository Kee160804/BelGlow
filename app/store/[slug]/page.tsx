import { notFound } from "next/navigation";
import SellerStorefront from "@/components/shop/SellerStorefront";
import { createClient } from "@/utils/supabase/server";

export default async function StorePage({ params }: PageProps<"/store/[slug]">) {
  const { slug } = await params;
  const { data: store } = await (await createClient()).from("seller_stores").select("id, name, description, brand_story, location").eq("slug", slug).eq("status", "approved").maybeSingle();
  if (!store) notFound();
  return <SellerStorefront store={store} />;
}
