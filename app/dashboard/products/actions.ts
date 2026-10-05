"use server";

import { createClient } from "@/utils/supabase/server";

const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

export async function createSellerProduct(formData: FormData) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { error: "Sign in to create a product." };

  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const categorySlug = String(formData.get("category") ?? "");
  const priceText = String(formData.get("price") ?? "").trim();
  const quantity = Number(formData.get("quantity"));
  const priceCents = Math.round(Number(priceText) * 100);
  const shouldSubmit = formData.get("submitForReview") === "on";
  const imageEntry = formData.get("image");
  const image = imageEntry instanceof File && imageEntry.size > 0 ? imageEntry : null;

  if (name.length < 2 || name.length > 160) return { error: "Product name must be between 2 and 160 characters." };
  if (!/^\d+(\.\d{1,2})?$/.test(priceText) || !Number.isSafeInteger(priceCents) || priceCents <= 0) return { error: "Enter a valid price with up to two decimal places." };
  if (!Number.isInteger(quantity) || quantity < 0 || quantity > 100000) return { error: "Enter a valid stock quantity." };
  if (image && image.size > 10 * 1024 * 1024) return { error: "Product images must be 10 MB or smaller." };
  if (image && !allowedImageTypes.has(image.type)) return { error: "Use a JPEG, PNG, WebP, or AVIF image." };

  const [{ data: profile }, { data: hasAdminAccess }] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
    supabase.rpc("is_admin"),
  ]);
  if (hasAdminAccess) {
    const { error: storeError } = await supabase.rpc("ensure_admin_seller_store");
    if (storeError) return { error: storeError.message };
  }

  const { data: store } = await supabase.from("seller_stores").select("id, status").eq("owner_id", user.id).maybeSingle();
  /* Keep the authorization check here as well as on dashboard routes because
     Server Actions can be invoked directly by crafted POST requests. */
  /* The product RPC also independently verifies store ownership and approval. */
  const authorizedRole = hasAdminAccess || profile?.role === "seller";
  if (!authorizedRole || store?.status !== "approved") return { error: "An approved seller account is required to list products." };

  /*
   * The database RPC is the trusted write boundary; client-provided store IDs,
   * platform roles, and calculated commission amounts are never accepted.
   */
  const { data, error } = await supabase.rpc("create_seller_product", {
    product_name: name,
    product_description: description,
    category_slug: categorySlug,
    unit_price_cents: priceCents,
    initial_quantity: quantity,
    submit_for_review: false,
  });
  if (error) return { error: error.message };
  const created = Array.isArray(data) ? data[0] : data;
  const productId = created?.created_product_id;
  if (typeof productId !== "string") return { error: "The product was not created. Please try again." };

  let imageWarning = "";
  if (image) {
    const extension = image.type === "image/jpeg" ? "jpg" : image.type.split("/")[1];
    const path = `${store.id}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage.from("product-images").upload(path, image, { contentType: image.type, upsert: false });
    if (uploadError) imageWarning = ` Product saved, but its image could not be uploaded: ${uploadError.message}`;
    else {
      const { error: imageRowError } = await supabase.from("product_images").insert({
        product_id: productId,
        storage_path: path,
        alt_text: name,
        is_primary: true,
      });
      if (imageRowError) imageWarning = ` Product saved, but its image could not be attached: ${imageRowError.message}`;
    }
  }

  if (shouldSubmit) {
    const { error: submitError } = await supabase.rpc("submit_product_for_review", { target_product_id: productId });
    if (submitError) return { error: `Product saved as a draft. It could not be submitted for review: ${submitError.message}${imageWarning}` };
  }

  return { success: true, message: `${shouldSubmit ? "Product submitted for review." : "Draft product saved."}${imageWarning}` };
}
