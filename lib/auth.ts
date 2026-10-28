import "server-only";

import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";

export async function getCurrentProfile() {
  const supabase = await createClient();
  const { data: claimsData, error: authError } = await supabase.auth.getClaims();
  const claims = claimsData?.claims;
  if (authError || !claims?.sub) return null;
  const user = {
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email : undefined,
    user_metadata: claims.user_metadata && typeof claims.user_metadata === "object" ? claims.user_metadata : {},
  };

  const [profileResult, adminResult] = await Promise.all([
    supabase.from("profiles").select("role, full_name, phone, account_status, suspended_until").eq("id", user.id).maybeSingle(),
    supabase.rpc("is_admin"),
  ]);
  let profile = profileResult.data as { role: string; full_name: string | null; phone: string | null; account_status?: string; suspended_until?: string | null } | null;
  let profileError = profileResult.error;

  // Keep existing accounts navigable until the customer-lifecycle migration
  // has been applied to a deployment. Once present, status enforcement below
  // automatically takes over.
  if (profileError?.message.includes("account_status") || profileError?.message.includes("suspended_until")) {
    const legacyResult = await supabase.from("profiles").select("role, full_name, phone").eq("id", user.id).maybeSingle();
    profile = legacyResult.data;
    profileError = legacyResult.error;
  }

  if (profileError || !profile) return null;
  const suspensionActive = profile.account_status === "suspended"
    && (!profile.suspended_until || new Date(profile.suspended_until).getTime() > Date.now());
  if (profile.account_status === "archived" || suspensionActive) return null;
  return {
    user,
    profile: {
      ...profile,
      role: adminResult.data ? "admin" : profile.role,
    },
  };
}

export async function requireSeller() {
  const current = await getCurrentProfile();
  if (!current) redirect("/?login=required");
  if (current.profile.role !== "seller" && current.profile.role !== "admin") redirect("/seller-application");

  const supabase = await createClient();
  if (current.profile.role === "admin") {
    const { error } = await supabase.rpc("ensure_admin_seller_store");
    if (error) redirect("/admin?storeSetup=failed");
  }
  const { data: store } = await supabase
    .from("seller_stores")
    .select("status")
    .eq("owner_id", current.user.id)
    .maybeSingle();
  if (store?.status !== "approved") redirect(store?.status === "pending" ? "/seller-application?status=pending" : "/seller-application");
  return current;
}

export async function requireAdmin() {
  const current = await getCurrentProfile();
  if (!current) redirect("/?login=required");
  if (current.profile.role !== "admin" && current.profile.role !== "staff")
    redirect("/account");
  return current;
}
