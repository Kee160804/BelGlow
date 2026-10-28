import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient as createSessionClient } from "@/utils/supabase/server";

type CustomerAction = "suspend" | "reactivate" | "archive" | "restore";
type CustomerAccountRequest = {
  action: CustomerAction;
  id: string;
  durationDays?: number | null;
  reason?: string | null;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const actions = new Set<CustomerAction>(["suspend", "reactivate", "archive", "restore"]);

function errorResponse(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

function createServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return null;
  return createAdminClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function requireAdministrator() {
  const sessionClient = await createSessionClient();
  const [{ data: claimsData, error: authError }, { data: hasAdminAccess, error: adminError }] = await Promise.all([
    sessionClient.auth.getClaims(),
    sessionClient.rpc("is_admin"),
  ]);
  if (authError || adminError || !claimsData?.claims.sub || !hasAdminAccess) return null;
  return { actor: { id: claimsData.claims.sub }, sessionClient };
}

export async function GET(request: Request) {
  const administrator = await requireAdministrator();
  if (!administrator) return errorResponse("Platform administrator access required.", 403);

  const adminClient = createServiceClient();
  if (!adminClient) return errorResponse("Customer account management is not configured on this deployment.", 503);

  const insightsFor = new URL(request.url).searchParams.get("insightsFor");
  if (insightsFor) {
    if (!uuidPattern.test(insightsFor)) return errorResponse("Select a valid customer account.", 400);
    const { data: interactions, error: interactionError } = await adminClient
      .from("product_interactions")
      .select("product_id, interaction, weight, created_at")
      .eq("user_id", insightsFor)
      .not("product_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1000);
    if (interactionError) return errorResponse(interactionError.message, 500);

    const productIds = [...new Set((interactions ?? []).map((interaction) => interaction.product_id).filter((id): id is string => Boolean(id)))];
    const [productsResult, categoriesResult] = productIds.length ? await Promise.all([
      adminClient.from("products").select("id, name").in("id", productIds),
      adminClient.from("product_categories").select("product_id, categories(name)").in("product_id", productIds).eq("is_primary", true),
    ]) : [{ data: [], error: null }, { data: [], error: null }];
    if (productsResult.error || categoriesResult.error) return errorResponse(productsResult.error?.message || categoriesResult.error?.message || "Customer insights could not be loaded.", 500);

    const productNames = new Map((productsResult.data ?? []).map((product) => [product.id, product.name]));
    const categoryByProduct = new Map<string, string>();
    for (const link of categoriesResult.data ?? []) {
      const category = Array.isArray(link.categories) ? link.categories[0] : link.categories;
      if (category?.name) categoryByProduct.set(link.product_id, category.name);
    }
    const productStats = new Map<string, { views: number; score: number; lastViewedAt: string | null }>();
    const categoryScores = new Map<string, number>();
    for (const interaction of interactions ?? []) {
      if (!interaction.product_id) continue;
      const current = productStats.get(interaction.product_id) ?? { views: 0, score: 0, lastViewedAt: null };
      current.views += interaction.interaction === "view" ? 1 : 0;
      current.score += Number(interaction.weight);
      if (interaction.interaction === "view" && !current.lastViewedAt) current.lastViewedAt = interaction.created_at;
      productStats.set(interaction.product_id, current);
      const category = categoryByProduct.get(interaction.product_id);
      if (category) categoryScores.set(category, (categoryScores.get(category) ?? 0) + Math.max(0, Number(interaction.weight)));
    }
    const mostViewedProducts = [...productStats.entries()]
      .map(([productId, stats]) => ({ productId, name: productNames.get(productId) ?? "Product", ...stats }))
      .sort((left, right) => right.views - left.views || right.score - left.score)
      .slice(0, 8);
    const topCategories = [...categoryScores.entries()]
      .map(([name, score]) => ({ name, score }))
      .sort((left, right) => right.score - left.score)
      .slice(0, 6);
    return Response.json({ mostViewedProducts, topCategories, interactionCount: interactions?.length ?? 0 });
  }

  const [profilesResult, administratorsResult, storesResult, summariesResult] = await Promise.all([
    adminClient.from("profiles").select("id, full_name, phone, role, account_status, suspended_until, suspension_reason, archived_at, created_at, account_status_updated_at").limit(1000),
    adminClient.from("platform_admins").select("user_id"),
    adminClient.from("seller_stores").select("owner_id, name, slug, status"),
    administrator.sessionClient.rpc("admin_list_customer_accounts"),
  ]);

  const firstError = profilesResult.error || administratorsResult.error || storesResult.error;
  if (firstError) return errorResponse(firstError.message, 500);

  const administratorIds = new Set((administratorsResult.data ?? []).map((row) => row.user_id));
  const storesByOwner = new Map((storesResult.data ?? []).map((store) => [store.owner_id, store]));
  const eligibleProfiles = (profilesResult.data ?? [])
    .filter((profile) => storesByOwner.has(profile.id) || (!administratorIds.has(profile.id) && !["admin", "staff"].includes(profile.role)));
  const summaryRows = ((summariesResult.error ? [] : summariesResult.data) ?? []) as Array<Record<string, unknown> & { id: string }>;
  const summaryById = new Map<string, Record<string, unknown>>(
    summaryRows.map((summary) => [summary.id, summary]),
  );
  const missingProfileIds = eligibleProfiles.filter((profile) => !summaryById.has(profile.id)).map((profile) => profile.id);

  const [missingOrdersResult, authUsersResult] = missingProfileIds.length
    ? await Promise.all([
      adminClient.from("orders").select("id, user_id, total_cents, payment_status, placed_at").in("user_id", missingProfileIds).limit(5000),
      adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    ])
    : [{ data: [], error: null }, { data: { users: [] }, error: null }];
  if (missingOrdersResult.error || authUsersResult.error) {
    return errorResponse(missingOrdersResult.error?.message || authUsersResult.error?.message || "Account summaries could not be loaded.", 500);
  }

  const missingOrderIds = (missingOrdersResult.data ?? []).map((order) => order.id);
  const missingRefundsResult = missingOrderIds.length
    ? await adminClient.from("refunds").select("order_id, amount_cents, status").in("order_id", missingOrderIds).limit(5000)
    : { data: [], error: null };
  if (missingRefundsResult.error) return errorResponse(missingRefundsResult.error.message, 500);

  const usersById = new Map((authUsersResult.data.users ?? []).map((user) => [user.id, user]));
  const ordersByUser = new Map<string, Array<{ id: string; total_cents: number; payment_status: string; placed_at: string }>>();
  for (const order of missingOrdersResult.data ?? []) {
    if (!order.user_id) continue;
    const userOrders = ordersByUser.get(order.user_id) ?? [];
    userOrders.push(order);
    ordersByUser.set(order.user_id, userOrders);
  }
  const refundedByOrder = new Map<string, number>();
  for (const refund of missingRefundsResult.data ?? []) {
    if (refund.status !== "refunded") continue;
    refundedByOrder.set(refund.order_id, (refundedByOrder.get(refund.order_id) ?? 0) + Number(refund.amount_cents));
  }

  const now = Date.now();
  const paidStatuses = new Set(["paid", "partially_refunded", "refunded"]);
  const accounts = eligibleProfiles
    .map((profile) => {
      const store = storesByOwner.get(profile.id);
      const orders = ordersByUser.get(profile.id) ?? [];
      const summary = summaryById.get(profile.id);
      const suspensionIsCurrent = profile.account_status === "suspended"
        && (!profile.suspended_until || new Date(profile.suspended_until).getTime() > now);
      const accountStatus = profile.account_status === "archived"
        ? "archived"
        : suspensionIsCurrent || store?.status === "suspended" ? "suspended" : "active";
      return {
        id: profile.id,
        email: typeof summary?.email === "string" ? summary.email : usersById.get(profile.id)?.email ?? "Email unavailable",
        full_name: profile.full_name,
        phone: profile.phone,
        role: store ? "seller" : profile.role,
        store_name: store?.name ?? null,
        store_slug: store?.slug ?? null,
        is_platform_admin: administratorIds.has(profile.id),
        account_status: accountStatus,
        suspended_until: profile.suspended_until,
        suspension_reason: profile.suspension_reason || (store?.status === "suspended" ? "Seller access suspended by a platform administrator." : null),
        archived_at: profile.archived_at,
        created_at: profile.created_at,
        order_count: summary ? Number(summary.order_count ?? 0) : orders.length,
        total_spent_cents: summary ? Number(summary.total_spent_cents ?? 0) : orders.reduce((sum, order) => sum + (paidStatuses.has(order.payment_status) ? Number(order.total_cents) : 0), 0),
        refund_total_cents: summary ? Number(summary.refund_total_cents ?? 0) : orders.reduce((sum, order) => sum + (refundedByOrder.get(order.id) ?? 0), 0),
        last_order_at: typeof summary?.last_order_at === "string" ? summary.last_order_at : orders.reduce<string | null>((latest, order) => !latest || order.placed_at > latest ? order.placed_at : latest, null),
        account_status_updated_at: profile.account_status_updated_at,
      };
    })
    .sort((left, right) => (right.account_status_updated_at || right.created_at).localeCompare(left.account_status_updated_at || left.created_at))
    .slice(0, 500);

  return Response.json({ accounts });
}

export async function PATCH(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return errorResponse("Cross-origin account changes are not allowed.", 403);
  }

  const administrator = await requireAdministrator();
  if (!administrator) return errorResponse("Platform administrator access required.", 403);
  const actor = administrator.actor;

  let body: CustomerAccountRequest;
  try {
    body = await request.json() as CustomerAccountRequest;
  } catch {
    return errorResponse("A valid JSON request body is required.", 400);
  }

  if (!body || !actions.has(body.action) || !uuidPattern.test(body.id)) {
    return errorResponse("Select a valid customer account and action.", 400);
  }
  if (body.id === actor.id) return errorResponse("You cannot change your own administrator account here.", 409);

  const durationDays = body.durationDays == null ? null : Number(body.durationDays);
  if (body.action === "suspend" && durationDays !== null && (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 3650)) {
    return errorResponse("Suspension length must be between 1 and 3,650 days, or left blank for an indefinite suspension.", 400);
  }
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 1000) : "";

  const adminClient = createServiceClient();
  if (!adminClient) {
    console.error("Customer account management is missing its server-side Supabase configuration.");
    return errorResponse("Customer account management is not configured on this deployment.", 503);
  }

  const [{ data: profile, error: profileError }, { data: protectedAdmin }, { data: sellerStore, error: sellerStoreError }] = await Promise.all([
    adminClient.from("profiles").select("id, full_name, phone, role, account_status, created_at").eq("id", body.id).maybeSingle(),
    adminClient.from("platform_admins").select("user_id").eq("user_id", body.id).maybeSingle(),
    adminClient.from("seller_stores").select("id, status").eq("owner_id", body.id).maybeSingle(),
  ]);
  if (profileError) return errorResponse(profileError.message, 500);
  if (sellerStoreError) return errorResponse(sellerStoreError.message, 500);
  if (!profile || !["customer", "seller"].includes(profile.role)) return errorResponse("Customer or seller account not found.", 404);
  if (protectedAdmin) return errorResponse("Platform administrator accounts cannot be managed here.", 409);

  const { data: authUserData, error: authUserError } = await adminClient.auth.admin.getUserById(body.id);
  if (authUserError || !authUserData.user) return errorResponse(authUserError?.message || "Customer login not found.", 404);
  const email = authUserData.user.email || "Unknown email";

  const isBlocking = body.action === "suspend" || body.action === "archive";
  const banDuration = isBlocking
    ? body.action === "suspend" && durationDays !== null ? `${durationDays * 24}h` : "876000h"
    : "none";
  const { error: authUpdateError } = await adminClient.auth.admin.updateUserById(body.id, { ban_duration: banDuration });
  if (authUpdateError) return errorResponse(authUpdateError.message, 500);

  const now = new Date();
  const nowIso = now.toISOString();
  const suspendedUntil = body.action === "suspend" && durationDays !== null
    ? new Date(now.getTime() + durationDays * 86_400_000).toISOString()
    : null;
  const nextStatus = body.action === "suspend" ? "suspended" : body.action === "archive" ? "archived" : "active";
  const profileUpdate = body.action === "suspend"
    ? { account_status: nextStatus, suspended_at: nowIso, suspended_until: suspendedUntil, suspension_reason: reason || null, suspended_by: actor.id, account_status_updated_at: nowIso }
    : body.action === "archive"
      ? { account_status: nextStatus, archived_at: nowIso, archived_by: actor.id, account_status_updated_at: nowIso }
      : { account_status: nextStatus, suspended_at: null, suspended_until: null, suspension_reason: null, suspended_by: null, restored_at: nowIso, account_status_updated_at: nowIso };

  const { error: profileUpdateError } = await adminClient.from("profiles").update(profileUpdate).eq("id", body.id);
  if (profileUpdateError) {
    await adminClient.auth.admin.updateUserById(body.id, { ban_duration: "none" });
    return errorResponse(profileUpdateError.message, 500);
  }

  if (sellerStore) {
    const nextStoreStatus = body.action === "suspend" || body.action === "archive" ? "suspended" : "approved";
    const { error: storeUpdateError } = await adminClient.from("seller_stores").update({
      status: nextStoreStatus,
      rejection_reason: body.action === "suspend" || body.action === "archive" ? reason || "Account disabled by a platform administrator." : null,
      updated_at: nowIso,
    }).eq("id", sellerStore.id);
    if (storeUpdateError) {
      console.error("Seller store status synchronization failed:", storeUpdateError.message);
      return errorResponse(`The login was updated, but the seller store could not be synchronized: ${storeUpdateError.message}`, 500);
    }
  }

  const eventType = body.action === "suspend" ? "suspended" : body.action === "archive" ? "archived" : body.action === "restore" ? "restored" : "reactivated";
  const { error: eventError } = await adminClient.from("customer_account_events").insert({
    user_id: body.id,
    email,
    event_type: eventType,
    reason: reason || null,
    scheduled_until: suspendedUntil,
    performed_by: actor.id,
    account_snapshot: { full_name: profile.full_name, phone: profile.phone, role: profile.role, created_at: profile.created_at, previous_status: profile.account_status },
  });
  if (eventError) console.error("Customer account audit event failed:", eventError.message);

  const { data: administrators } = await adminClient.from("platform_admins").select("user_id");
  if (administrators?.length) {
    const actionLabel = body.action === "suspend" ? "suspended" : body.action === "archive" ? "archived" : body.action === "restore" ? "restored" : "reactivated";
    const notifications = administrators.map((administrator) => ({
      user_id: administrator.user_id,
      kind: "customer_account",
      title: `${profile.role === "seller" ? "Seller" : "Customer"} account ${actionLabel}`,
      body: `${email} was ${actionLabel}. ${body.action === "archive" ? "This email was previously used on BelGlow and can be restored from Archived Data." : reason}`.trim(),
      href: "/admin/customers",
    }));
    const { error: notificationError } = await adminClient.from("notifications").insert(notifications);
    if (notificationError) console.error("Customer account notification failed:", notificationError.message);
  }

  const accountLabel = profile.role === "seller" ? "Seller" : "Customer";
  const message = body.action === "suspend"
    ? `${accountLabel} suspended${suspendedUntil ? ` until ${new Date(suspendedUntil).toLocaleDateString("en-BZ")}` : " until an administrator reactivates the account"}.`
    : body.action === "archive"
      ? "Customer moved to Archived Data. Their login is disabled and all historical data is retained."
      : body.action === "restore"
        ? "Archived customer restored to Live Customers."
        : `${accountLabel} account reactivated.`;

  return Response.json({ success: true, message });
}
