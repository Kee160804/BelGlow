import "server-only";

import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";

export async function getCurrentProfile() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return null;

  const [{ data: profile, error }, { data: hasAdminAccess }] = await Promise.all([
    supabase.from("profiles").select("role, full_name").eq("id", user.id).maybeSingle(),
    supabase.rpc("is_admin"),
  ]);

  if (error || !profile) return null;
  return {
    user,
    profile: {
      ...profile,
      role: hasAdminAccess ? "admin" : profile.role,
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
    redirect("/");
  return current;
}
