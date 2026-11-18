"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { isExternalProductImage } from "@/lib/product-image-url";

const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
type VariantInput = { id?: string; name: string; price_cents: number; quantity: number };

function text(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

function parseOptionalPrice(value: string) {
  if (!value) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(value)) throw new Error("Enter a valid original price with up to two decimal places.");
  const cents = Math.round(Number(value) * 100);
  if (!Number.isSafeInteger(cents) || cents <= 0) throw new Error("Enter a valid original price.");
  return cents;
}

function parseVariants(formData: FormData): VariantInput[] {
  let parsed: unknown;
  try { parsed = JSON.parse(text(formData, "variants")); }
  catch { throw new Error("Product options could not be read. Please review the sizes, prices, and stock amounts."); }
  if (!Array.isArray(parsed) || parsed.length < 1 || parsed.length > 50) throw new Error("Add between 1 and 50 product options.");
  return parsed.map((entry, index) => {
    if (!entry || typeof entry !== "object") throw new Error(`Option ${index + 1} is invalid.`);
    const row = entry as Record<string, unknown>;
    const name = String(row.name ?? "").trim() || "Default";
    const price = String(row.price ?? "").trim();
    const priceCents = Math.round(Number(price) * 100);
    const quantity = Number(row.quantity);
    if (name.length > 100) throw new Error(`Option ${index + 1} name is too long.`);
    if (!/^\d+(\.\d{1,2})?$/.test(price) || !Number.isSafeInteger(priceCents) || priceCents <= 0) throw new Error(`Option ${index + 1} needs a valid price.`);
    if (!Number.isInteger(quantity) || quantity < 0 || quantity > 100000) throw new Error(`Option ${index + 1} needs a valid stock amount.`);
    const id = typeof row.id === "string" && row.id ? row.id : undefined;
    return { id, name, price_cents: priceCents, quantity };
  });
}

function getImages(formData: FormData) {
  const images = formData.getAll("images").filter((entry): entry is File => entry instanceof File && entry.size > 0);
  if (images.length > 6) throw new Error("Upload no more than 6 product images at once.");
  for (const image of images) {
    if (image.size > 10 * 1024 * 1024) throw new Error(`${image.name || "A product image"} is larger than 10 MB.`);
    if (!allowedImageTypes.has(image.type)) throw new Error("Use JPEG, PNG, WebP, or AVIF product images.");
  }
  return images;
}

function getImageUrls(formData: FormData) {
  const rawUrls = text(formData, "imageUrls");
  if (rawUrls.length > 6 * 2048 + 5) throw new Error("Product image links must be no longer than 2,048 characters each.");
  const urls = rawUrls.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
  if (urls.length > 6) throw new Error("Add no more than 6 product image URLs.");
  return urls.map((value) => {
    let parsed: URL;
    try { parsed = new URL(value); }
    catch { throw new Error("Enter a complete image URL beginning with https://."); }
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.toString().length > 2048) {
      throw new Error("Product image links must be valid HTTPS URLs no longer than 2,048 characters.");
    }
    return parsed.toString();
  });
}

function productFields(formData: FormData) {
  const name = text(formData, "name");
  if (name.length < 2 || name.length > 160) throw new Error("Product name must be between 2 and 160 characters.");
  const shortDescription = text(formData, "shortDescription");
  const description = text(formData, "description");
  const ingredients = text(formData, "ingredients");
  const usage = text(formData, "usage");
  const category = text(formData, "category");
  if (!category) throw new Error("Choose a product category.");
  if (shortDescription.length > 240) throw new Error("The short description must be 240 characters or less.");
  if (description.length > 5000 || ingredients.length > 5000 || usage.length > 5000) throw new Error("Product information must be 5,000 characters or less per section.");
  return {
    name, shortDescription, description, ingredients, usage, category,
    comparePriceCents: parseOptionalPrice(text(formData, "comparePrice")),
    attributes: {
      subtitle: text(formData, "subtitle").slice(0, 180),
      shipping_info: text(formData, "shippingInfo").slice(0, 500),
    },
    variants: parseVariants(formData),
    images: getImages(formData),
    imageUrls: getImageUrls(formData),
  };
}

async function authorizedSeller() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { error: "Sign in to manage products." } as const;
  const [{ data: profile }, { data: hasAdminAccess }] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
    supabase.rpc("is_admin"),
  ]);
  if (hasAdminAccess) {
    const { error } = await supabase.rpc("ensure_admin_seller_store");
    if (error) return { error: error.message } as const;
  }
  const { data: store } = await supabase.from("seller_stores").select("id, status").eq("owner_id", user.id).maybeSingle();
  if (!(hasAdminAccess || profile?.role === "seller") || store?.status !== "approved") return { error: "An approved seller account is required to manage products." } as const;
  return { supabase, store } as const;
}

async function attachImages(supabase: Awaited<ReturnType<typeof createClient>>, storeId: string, productId: string, name: string, images: File[], imageUrls: string[], replace: boolean) {
  if (!images.length && !imageUrls.length) return "";
  const { data: existing } = await supabase.from("product_images").select("id, storage_path, is_primary").eq("product_id", productId).order("sort_order");
  if (!replace && (existing?.length ?? 0) + images.length + imageUrls.length > 6) return "The gallery can contain up to 6 images. Replace the current gallery or add fewer images.";
  if (images.length + imageUrls.length > 6) return "Add no more than 6 product images at a time.";
  const uploaded: Array<{ path: string; id: string }> = [];
  for (let index = 0; index < images.length; index += 1) {
    const image = images[index];
    const extension = image.type === "image/jpeg" ? "jpg" : image.type.split("/")[1];
    const path = `${storeId}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage.from("product-images").upload(path, image, { contentType: image.type, upsert: false });
    if (uploadError) {
      await supabase.from("product_images").delete().in("id", uploaded.map((row) => row.id));
      await supabase.storage.from("product-images").remove([...uploaded.map((row) => row.path), path]);
      return `Images could not be saved: ${uploadError.message}`;
    }
    const { data: row, error: rowError } = await supabase.from("product_images").insert({ product_id: productId, storage_path: path, alt_text: name, sort_order: (existing?.length ?? 0) + index, is_primary: false }).select("id").single();
    if (rowError || !row) {
      await supabase.from("product_images").delete().in("id", uploaded.map((item) => item.id));
      await supabase.storage.from("product-images").remove([...uploaded.map((item) => item.path), path]);
      return `An uploaded image could not be attached: ${rowError?.message ?? "Unknown error"}`;
    }
    uploaded.push({ path, id: row.id });
  }
  for (let index = 0; index < imageUrls.length; index += 1) {
    const { data: row, error: rowError } = await supabase.from("product_images").insert({ product_id: productId, storage_path: imageUrls[index], alt_text: name, sort_order: (existing?.length ?? 0) + images.length + index, is_primary: false }).select("id").single();
    if (rowError || !row) {
      await supabase.from("product_images").delete().in("id", uploaded.map((item) => item.id));
      const uploadedStoragePaths = uploaded.map((item) => item.path).filter((path) => !isExternalProductImage(path));
      if (uploadedStoragePaths.length) await supabase.storage.from("product-images").remove(uploadedStoragePaths);
      return `An image URL could not be attached: ${rowError?.message ?? "Unknown error"}`;
    }
    uploaded.push({ path: imageUrls[index], id: row.id });
  }
  if (replace && existing?.length) {
    const { error: deleteError } = await supabase.from("product_images").delete().in("id", existing.map((image) => image.id));
    if (deleteError) return `New images were added, but the old gallery could not be replaced: ${deleteError.message}`;
    const existingStoragePaths = existing.map((image) => image.storage_path).filter((path) => !isExternalProductImage(path));
    if (existingStoragePaths.length) await supabase.storage.from("product-images").remove(existingStoragePaths);
  }
  if (replace || !existing?.some((image) => image.is_primary)) await supabase.from("product_images").update({ is_primary: true, sort_order: 0 }).eq("id", uploaded[0].id);
  return "";
}

export async function createSellerProduct(formData: FormData) {
  const seller = await authorizedSeller();
  if ("error" in seller) return { error: seller.error };
  let fields: ReturnType<typeof productFields>;
  try { fields = productFields(formData); }
  catch (error) { return { error: error instanceof Error ? error.message : "Review the product information." }; }
  const shouldSubmit = formData.get("submitForReview") === "on";
  const { data: productId, error } = await seller.supabase.rpc("create_seller_product_v2", {
    product_name: fields.name,
    product_short_description: fields.shortDescription,
    product_description: fields.description,
    category_slug: fields.category,
    product_ingredients: fields.ingredients,
    product_usage_instructions: fields.usage,
    product_attributes: fields.attributes,
    compare_price_cents: fields.comparePriceCents,
    product_variants: fields.variants,
    submit_for_review: shouldSubmit,
  });
  if (error || typeof productId !== "string") return { error: error?.message ?? "The product was not created." };
  const imageWarning = await attachImages(seller.supabase, seller.store.id, productId, fields.name, fields.images, fields.imageUrls, true);
  revalidatePath("/dashboard/products");
  revalidatePath("/shop");
  revalidatePath("/");
  return { success: true, message: `${shouldSubmit ? "Product submitted for review." : "Draft product saved."}${imageWarning ? ` ${imageWarning}` : ""}` };
}

export async function updateSellerProduct(formData: FormData) {
  const seller = await authorizedSeller();
  if ("error" in seller) return { error: seller.error };
  const productId = text(formData, "productId");
  if (!/^[0-9a-f-]{36}$/i.test(productId)) return { error: "Choose a valid product to edit." };
  let fields: ReturnType<typeof productFields>;
  try { fields = productFields(formData); }
  catch (error) { return { error: error instanceof Error ? error.message : "Review the product information." }; }
  const { error } = await seller.supabase.rpc("update_seller_product", {
    target_product_id: productId,
    product_name: fields.name,
    product_short_description: fields.shortDescription,
    product_description: fields.description,
    category_slug: fields.category,
    product_ingredients: fields.ingredients,
    product_usage_instructions: fields.usage,
    product_attributes: fields.attributes,
    compare_price_cents: fields.comparePriceCents,
    product_variants: fields.variants,
  });
  if (error) return { error: error.message };
  const imageWarning = await attachImages(seller.supabase, seller.store.id, productId, fields.name, fields.images, fields.imageUrls, formData.get("replaceImages") === "on");
  revalidatePath("/dashboard/products");
  revalidatePath("/shop");
  revalidatePath("/");
  return { success: true, message: `Product changes saved and stock updated.${imageWarning ? ` ${imageWarning}` : ""}` };
}
