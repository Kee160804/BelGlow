"use client";

import { useEffect, useState } from "react";
import type { MarketplaceCategory } from "@/lib/marketplace-categories";
import { createClient } from "@/utils/supabase/client";

export function useMarketplaceCategories() {
  const [categories, setCategories] = useState<MarketplaceCategory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function load() {
      const { data } = await createClient()
        .from("categories")
        .select("id, parent_id, name, slug, description, image_url, sort_order, is_active")
        .eq("is_active", true)
        .order("sort_order")
        .order("name");
      if (active) {
        setCategories((data ?? []) as MarketplaceCategory[]);
        setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, []);

  return { categories, loading };
}
