"use server";

import { createClient } from "@/utils/supabase/server";

export async function applyForSeller(formData: FormData) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { error: "Please sign in before applying to sell." };

  const name = String(formData.get("storeName") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const supportEmail = String(formData.get("supportEmail") ?? "").trim();
  const supportPhone = String(formData.get("supportPhone") ?? "").trim();
  if (name.length < 2 || name.length > 80) return { error: "Store name must be between 2 and 80 characters." };
  if (description.length > 2000) return { error: "Store description is too long." };

  const slugBase = name.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
  const slug = `${slugBase || "store"}-${user.id.slice(0, 8)}`;
  const { error } = await supabase.from("seller_stores").insert({
    owner_id: user.id,
    name,
    slug,
    description,
    support_email: supportEmail || user.email || null,
    support_phone: supportPhone || null,
  });

  if (error) return { error: error.code === "23505" ? "A seller application already exists for this account." : error.message };
  return { success: true };
}
