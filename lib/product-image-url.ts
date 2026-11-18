/** True when a product image is stored as an external HTTPS URL instead of Supabase Storage. */
export function isExternalProductImage(value: string) {
  return /^https:\/\//i.test(value);
}
