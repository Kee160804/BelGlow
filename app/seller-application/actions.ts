"use server";

import { createClient } from "@/utils/supabase/server";

export async function applyForSeller(formData: FormData) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { error: "Please sign in before applying to sell." };

  const name = String(formData.get("storeName") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const ownerName = String(formData.get("ownerName") ?? "").trim();
  const businessAddress = String(formData.get("businessAddress") ?? "").trim();
  const deliveryAreas = String(formData.get("deliveryAreas") ?? "").trim();
  const contactMode = String(formData.get("contactMode") ?? "account");
  const { data: profile } = await supabase.from("profiles").select("phone").eq("id", user.id).maybeSingle();
  const supportEmail = contactMode === "business" ? String(formData.get("supportEmail") ?? "").trim() : user.email ?? "";
  const supportPhone = contactMode === "business" ? String(formData.get("supportPhone") ?? "").trim() : profile?.phone ?? "";
  if (name.length < 2 || name.length > 80) return { error: "Store name must be between 2 and 80 characters." };
  if (description.length > 2000) return { error: "Store description is too long." };
  if (ownerName.length < 2 || ownerName.length > 160) return { error: "Enter the business owner or representative name." };
  if (businessAddress.length < 5 || businessAddress.length > 500) return { error: "Enter the business location or operating address." };
  if (deliveryAreas.length < 2 || deliveryAreas.length > 1000) return { error: "Describe where you can deliver or offer pickup." };
  if (formData.get("sellerTerms") !== "on") return { error: "Accept the Seller Agreement and fulfillment responsibilities before applying." };
  if (contactMode !== "account" && contactMode !== "business") return { error: "Choose which contact details to use." };
  if (!supportEmail || supportEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supportEmail)) return { error: "Enter a valid business email address." };
  if (contactMode === "business" && (supportPhone.length < 5 || supportPhone.length > 40)) return { error: "Enter a valid business phone number." };

  const slugBase = name.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
  const slug = `${slugBase || "store"}-${user.id.slice(0, 8)}`;
  const application = {
    owner_id: user.id,
    name,
    slug,
    description,
    legal_owner_name: ownerName,
    business_address: businessAddress,
    delivery_areas: deliveryAreas,
    seller_terms_accepted_at: new Date().toISOString(),
    support_email: supportEmail || user.email || null,
    support_phone: supportPhone || null,
  };
  let { error } = await supabase.from("seller_stores").insert(application);
  if (error?.message.includes("legal_owner_name") || error?.message.includes("delivery_areas")) {
    const legacyResult = await supabase.from("seller_stores").insert({
      owner_id: application.owner_id, name: application.name, slug: application.slug, description: application.description,
      support_email: application.support_email, support_phone: application.support_phone,
    });
    error = legacyResult.error;
  }

  if (error) return { error: error.code === "23505" ? "A seller application already exists for this account." : error.message };
  return { success: true };
}
