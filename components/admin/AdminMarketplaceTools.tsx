"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { Check, CircleDollarSign, Clock, PackageCheck, Store, Trash2, X } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import AdminAccessManager from "@/components/admin/AdminAccessManager";
import AdminCategoryManager from "@/components/admin/AdminCategoryManager";
import AdminShippingManager from "@/components/admin/AdminShippingManager";

type Section = "overview" | "sellers" | "approvals" | "commission" | "orders" | "payouts" | "customers" | "categories" | "settings";
type SellerRow = { id: string; owner_id: string; name: string; slug: string; status: string; created_at: string; rejection_reason: string | null };
type ProductRow = { id: string; name: string; seller_store_id: string; base_price_cents: number; submitted_at: string | null; short_description: string | null; description: string | null; ingredients: string | null; usage_instructions: string | null };
type OrderRow = { id: string; order_number: number; email: string; total_cents: number; payment_status: string; fulfillment_status: string; created_at: string };
type PayoutRow = { id: string; seller_store_id: string; status: string; net_payout_cents: number; created_at: string };
type CustomerStatus = "active" | "suspended" | "archived";
type CustomerRow = { id: string; email: string; full_name: string | null; phone: string | null; role: string; store_name: string | null; store_slug: string | null; is_platform_admin: boolean; account_status: CustomerStatus; suspended_until: string | null; suspension_reason: string | null; archived_at: string | null; created_at: string; order_count: number; total_spent_cents: number; refund_total_cents: number; last_order_at: string | null };
type CustomerOrderDetail = { id: string; order_number: number; status: string; payment_status: string; fulfillment_status: string; total_cents: number; placed_at: string; shipping_address: Record<string, unknown>; order_items: Array<{ id: string; product_name: string; variant_name: string | null; quantity: number; unit_price_cents: number; total_cents: number }>; payments: Array<{ id: string; provider: string; provider_reference: string | null; status: string; amount_cents: number; processed_at: string | null }>; refunds: Array<{ id: string; status: string; amount_cents: number; reason: string | null; processed_at: string | null }>; shipments: Array<{ id: string; carrier: string | null; tracking_number: string | null; status: string; shipped_at: string | null; delivered_at: string | null }> };
type CustomerEvent = { id: string; event_type: string; reason: string | null; scheduled_until: string | null; created_at: string };
type CustomerAddress = { id: string; label: string; recipient_name: string; phone: string | null; address_line_1: string; address_line_2: string | null; city: string; district: string | null; postal_code: string | null; country_code: string; delivery_notes: string | null };
type CustomerReview = { id: string; rating: number; title: string | null; body: string | null; is_verified_purchase: boolean; is_approved: boolean; created_at: string; products: Array<{ name: string }> };
type CustomerSupportRequest = { id: string; topic: string; order_number: string | null; subject: string; message: string; status: string; admin_note: string | null; created_at: string };
type CustomerInsights = { mostViewedProducts: Array<{ productId: string; name: string; views: number; score: number; lastViewedAt: string | null }>; topCategories: Array<{ name: string; score: number }>; interactionCount: number };
type CustomerHistory = { customer: CustomerRow; orders: CustomerOrderDetail[]; events: CustomerEvent[]; addresses: CustomerAddress[]; reviews: CustomerReview[]; supportRequests: CustomerSupportRequest[]; insights: CustomerInsights; loading: boolean; error: string };
type SellerProductHistory = { id: string; name: string; status: string; review_status: string; base_price_cents: number; created_at: string };
type SellerOrderHistory = { id: string; status: string; item_subtotal_cents: number; platform_fee_cents: number; seller_net_cents: number; created_at: string };
type SellerPayoutHistory = { id: string; status: string; net_payout_cents: number; created_at: string };
type SellerLedgerHistory = { id: string; entry_type: string; amount_cents: number; description: string; available_at: string; created_at: string };
type SellerPromotionHistory = { id: string; name: string; code: string; is_active: boolean; usage_count: number; created_at: string };
type SellerHistory = { seller: SellerRow; products: SellerProductHistory[]; orders: SellerOrderHistory[]; payouts: SellerPayoutHistory[]; ledger: SellerLedgerHistory[]; promotions: SellerPromotionHistory[]; loading: boolean; error: string };
type OrderRequestRow = { id: string; order_id: string; request_type: string; reason: string; status: string; created_at: string };
type ReviewRow = { id: string; product_id: string; rating: number; title: string | null; body: string | null; created_at: string };
type RefundRow = { id: string; order_id: string; amount_cents: number; reason: string | null; status: string; created_at: string };

async function fetchAdminAccounts(): Promise<{ data: CustomerRow[]; error: { message: string } | null }> {
  try {
    const response = await fetch("/api/admin/accounts", { cache: "no-store" });
    const payload = await response.json() as { accounts?: CustomerRow[]; error?: string };
    if (!response.ok) return { data: [], error: { message: payload.error || "Customer accounts could not be loaded." } };
    return { data: payload.accounts ?? [], error: null };
  } catch (accountError) {
    return { data: [], error: { message: accountError instanceof Error ? accountError.message : "Customer accounts could not be loaded." } };
  }
}

export default function AdminMarketplaceTools({ section }: { section: Section }) {
  const [sellers, setSellers] = useState<SellerRow[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [storeNames, setStoreNames] = useState<Map<string, string>>(new Map());
  const [productImages, setProductImages] = useState<Map<string, string>>(new Map());
  const [commissionBps, setCommissionBps] = useState(1000);
  const [commissionInput, setCommissionInput] = useState("10");
  const [pendingOrders, setPendingOrders] = useState(0);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [payouts, setPayouts] = useState<PayoutRow[]>([]);
  const [customerCount, setCustomerCount] = useState(0);
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [customerView, setCustomerView] = useState<CustomerStatus>("active");
  const [customerHistory, setCustomerHistory] = useState<CustomerHistory | null>(null);
  const [sellerHistory, setSellerHistory] = useState<SellerHistory | null>(null);
  const [currentAdminId, setCurrentAdminId] = useState("");
  const [orderRequests, setOrderRequests] = useState<OrderRequestRow[]>([]);
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [refunds, setRefunds] = useState<RefundRow[]>([]);
  const [applicationsOpen, setApplicationsOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const supabase = createClient();
    setError("");
    const needsSellers = ["overview", "sellers", "approvals", "payouts"].includes(section);
    const needsProducts = ["overview", "approvals"].includes(section);
    const needsSettings = ["overview", "commission", "settings"].includes(section);
    const needsOrders = ["overview", "orders"].includes(section);
    const [sellerResult, productResult, settingsResult, orderResult, payoutResult, customerResult, requestResult, reviewResult, refundResult, imageResult] = await Promise.all([
      needsSellers ? supabase.from("seller_stores").select("id, owner_id, name, slug, status, created_at, rejection_reason").order("created_at", { ascending: false }) : Promise.resolve({ data: [], error: null }),
      needsProducts ? supabase.from("products").select("id, name, seller_store_id, base_price_cents, submitted_at, short_description, description, ingredients, usage_instructions").eq("review_status", "submitted").not("seller_store_id", "is", null).order("submitted_at", { ascending: false }) : Promise.resolve({ data: [], error: null }),
      needsSettings ? supabase.from("marketplace_settings").select("default_commission_bps, seller_applications_open").eq("singleton", true).maybeSingle() : Promise.resolve({ data: null, error: null }),
      needsOrders ? supabase.from("orders").select("id, order_number, email, total_cents, payment_status, fulfillment_status, created_at").order("created_at", { ascending: false }).limit(100) : Promise.resolve({ data: [], error: null }),
      section === "payouts" ? supabase.from("seller_payouts").select("id, seller_store_id, status, net_payout_cents, created_at").order("created_at", { ascending: false }).limit(100) : Promise.resolve({ data: [], error: null }),
      section === "customers" ? fetchAdminAccounts() : Promise.resolve({ data: [], error: null }),
      section === "orders" ? supabase.from("order_requests").select("id, order_id, request_type, reason, status, created_at").eq("status", "pending").order("created_at", { ascending: false }) : Promise.resolve({ data: [], error: null }),
      section === "approvals" ? supabase.from("reviews").select("id, product_id, rating, title, body, created_at").eq("is_approved", false).order("created_at", { ascending: false }) : Promise.resolve({ data: [], error: null }),
      section === "orders" ? supabase.from("refunds").select("id, order_id, amount_cents, reason, status, created_at").eq("status", "pending").order("created_at", { ascending: false }) : Promise.resolve({ data: [], error: null }),
      needsProducts ? supabase.from("product_images").select("product_id, storage_path, sort_order").order("sort_order").limit(500) : Promise.resolve({ data: [], error: null }),
    ]);

    if (sellerResult.error) setError(sellerResult.error.message);
    if (productResult.error) setError((current) => current || productResult.error.message);
    if (orderResult.error) setError((current) => current || orderResult.error.message);
    const customerErrorMessage = customerResult.error?.message;
    if (customerErrorMessage) setError((current) => current || customerErrorMessage);
    const sellerRows = (sellerResult.data ?? []) as SellerRow[];
    const productRows = (productResult.data ?? []) as ProductRow[];
    setSellers(sellerRows);
    setProducts(productRows);
    setOrders((orderResult.data ?? []) as OrderRow[]);
    setPayouts((payoutResult.data ?? []) as PayoutRow[]);
    const customerRows = (customerResult.data ?? []) as CustomerRow[];
    setCustomerCount(customerRows.length);
    setCustomers(customerRows);
    setOrderRequests((requestResult.data ?? []) as OrderRequestRow[]);
    setReviews((reviewResult.data ?? []) as ReviewRow[]);
    setRefunds((refundResult.data ?? []) as RefundRow[]);
    setStoreNames(new Map(sellerRows.map((seller) => [seller.id, seller.name])));
    const firstImages = new Map<string, string>();
    for (const row of imageResult.data ?? []) if (!firstImages.has(row.product_id)) firstImages.set(row.product_id, supabase.storage.from("product-images").getPublicUrl(row.storage_path).data.publicUrl);
    setProductImages(firstImages);
    if (settingsResult.data) {
      setCommissionBps(settingsResult.data.default_commission_bps);
      setCommissionInput((settingsResult.data.default_commission_bps / 100).toString());
      setApplicationsOpen(settingsResult.data.seller_applications_open);
    }
    setPendingOrders((orderResult.data ?? []).filter((order) => order.payment_status === "paid").length);
    setLoading(false);
  }, [section]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    let active = true;
    void createClient().auth.getUser().then(({ data }) => {
      if (active) setCurrentAdminId(data.user?.id ?? "");
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (section !== "approvals") return;
    const supabase = createClient();
    const channel = supabase.channel("admin-product-approval-feed")
      .on("postgres_changes", { event: "*", schema: "public", table: "products" }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load, section]);

  useEffect(() => {
    if (!["overview", "sellers", "customers", "orders"].includes(section)) return;
    const supabase = createClient();
    let refreshTimer: number | undefined;
    const refresh = () => {
      if (refreshTimer) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => void load(), 150);
    };
    const channel = supabase.channel(`admin-account-feed-${section}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "seller_stores" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "payments" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "refunds" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "customer_account_events" }, refresh)
      .subscribe();
    return () => {
      if (refreshTimer) window.clearTimeout(refreshTimer);
      void supabase.removeChannel(channel);
    };
  }, [load, section]);

  async function reviewSeller(sellerId: string, approve: boolean) {
    setBusyId(sellerId);
    setError("");
    const { error: resultError } = await createClient().rpc("admin_review_seller_application", {
      target_store_id: sellerId,
      approve,
      review_note: approve ? null : "Please contact BelGlow for next steps.",
    });
    setBusyId("");
    if (resultError) setError(resultError.message);
    else {
      setNotice(approve ? "Seller application approved." : "Seller application rejected.");
      await load();
    }
  }

  async function reviewProduct(productId: string, approve: boolean) {
    setBusyId(productId);
    setError("");
    const { error: resultError } = await createClient().rpc("admin_review_product", {
      target_product_id: productId,
      approve,
      review_note: approve ? null : "Please revise this listing and submit it again.",
    });
    setBusyId("");
    if (resultError) setError(resultError.message);
    else {
      setNotice(approve ? "Product approved and published." : "Product returned to the seller for updates.");
      await load();
    }
  }

  async function saveCommission() {
    const percent = Number(commissionInput);
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
      setError("Commission must be between 0% and 100%.");
      return;
    }
    setBusyId("commission");
    setError("");
    const { error: resultError } = await createClient().rpc("admin_update_commission", { rate_bps: Math.round(percent * 100) });
    setBusyId("");
    if (resultError) setError(resultError.message);
    else {
      setNotice("Default commission updated. This applies to new orders only.");
      await load();
    }
  }

  async function updateApplicationsOpen(open: boolean) {
    setBusyId("settings");
    setError("");
    const { error: resultError } = await createClient().rpc("admin_update_seller_applications", { applications_open: open });
    setBusyId("");
    if (resultError) setError(resultError.message);
    else {
      setApplicationsOpen(open);
      setNotice("Seller application setting saved.");
    }
  }

  async function seedPaymentDemoCatalog() {
    setBusyId("demo-catalog");
    setError("");
    setNotice("");
    const { data, error: resultError } = await createClient().rpc("admin_seed_payment_demo_products");
    setBusyId("");
    if (resultError) setError(resultError.message);
    else setNotice(`${Number(data ?? 0)} payment demo products are ready—one for each active main category.`);
  }

  async function setSellerStatus(seller: SellerRow, status: "approved" | "suspended") {
    setBusyId(seller.id);
    setError("");
    setNotice("");
    try {
      if (seller.status === "rejected") {
        const { error: actionError } = await createClient().rpc("admin_set_seller_status", { target_store_id: seller.id, next_status: status, admin_note: null });
        if (actionError) throw actionError;
      } else {
        const response = await fetch("/api/admin/accounts", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: status === "suspended" ? "suspend" : "reactivate",
            id: seller.owner_id,
            durationDays: null,
            reason: status === "suspended" ? "Seller account suspended by a platform administrator." : "",
          }),
        });
        const result = await response.json() as { error?: string; message?: string };
        if (!response.ok) throw new Error(result.error || "The seller account could not be updated.");
        setNotice(result.message || `Seller ${status}.`);
      }
      if (seller.status === "rejected") setNotice(`Seller ${status}.`);
      await load();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "The seller account could not be updated.");
    } finally {
      setBusyId("");
    }
  }

  async function manageCustomer(customer: CustomerRow, action: "suspend" | "reactivate" | "archive" | "restore") {
    let durationDays: number | null = null;
    let reason = "";
    if (action === "suspend") {
      const duration = window.prompt("Suspension length in days. Leave blank to suspend until an administrator reactivates the account:", "7");
      if (duration === null) return;
      if (duration.trim()) {
        durationDays = Number(duration);
        if (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 3650) {
          setError("Enter a suspension length between 1 and 3,650 days, or leave it blank.");
          return;
        }
      }
      const suppliedReason = window.prompt("Reason for suspending this customer:", "Account review required");
      if (suppliedReason === null) return;
      reason = suppliedReason.trim();
    } else if (action === "archive") {
      if (!window.confirm(`Move ${customer.email} to Archived Data?\n\nTheir login will be disabled, but their profile, orders, payments, refunds, delivery records, reviews, and audit history will be retained. The account can be restored later.`)) return;
      reason = window.prompt("Optional archive note:", "Archived by a platform administrator")?.trim() ?? "";
    } else {
      const label = action === "restore" ? "restore this archived customer" : "reactivate this customer";
      if (!window.confirm(`Do you want to ${label}?\n\n${customer.email} will be able to sign in again.`)) return;
    }

    setBusyId(customer.id);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/accounts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, id: customer.id, durationDays, reason }),
      });
      const result = await response.json() as { error?: string; message?: string };
      if (!response.ok) throw new Error(result.error || "The customer account could not be updated.");
      setNotice(result.message || "Customer account updated.");
      setCustomerHistory(null);
      await load();
      if (action === "archive") setCustomerView("archived");
      if (action === "suspend") setCustomerView("suspended");
      if (action === "restore" || action === "reactivate") setCustomerView("active");
    } catch (accountError) {
      setError(accountError instanceof Error ? accountError.message : "The customer account could not be updated.");
    } finally {
      setBusyId("");
    }
  }

  async function showCustomerHistory(customer: CustomerRow) {
    const emptyInsights: CustomerInsights = { mostViewedProducts: [], topCategories: [], interactionCount: 0 };
    setCustomerHistory({ customer, orders: [], events: [], addresses: [], reviews: [], supportRequests: [], insights: emptyInsights, loading: true, error: "" });
    const supabase = createClient();
    const [ordersResult, eventsResult, addressesResult, reviewsResult, supportResult, insightsResult] = await Promise.all([
      supabase.from("orders").select("id, order_number, status, payment_status, fulfillment_status, total_cents, placed_at, shipping_address, order_items(id, product_name, variant_name, quantity, unit_price_cents, total_cents), payments(id, provider, provider_reference, status, amount_cents, processed_at), refunds(id, status, amount_cents, reason, processed_at), shipments(id, carrier, tracking_number, status, shipped_at, delivered_at)").eq("user_id", customer.id).order("placed_at", { ascending: false }),
      supabase.from("customer_account_events").select("id, event_type, reason, scheduled_until, created_at").eq("user_id", customer.id).order("created_at", { ascending: false }),
      supabase.from("addresses").select("id, label, recipient_name, phone, address_line_1, address_line_2, city, district, postal_code, country_code, delivery_notes").eq("user_id", customer.id).order("created_at", { ascending: false }),
      supabase.from("reviews").select("id, rating, title, body, is_verified_purchase, is_approved, created_at, products(name)").eq("user_id", customer.id).order("created_at", { ascending: false }),
      supabase.from("support_requests").select("id, topic, order_number, subject, message, status, admin_note, created_at").eq("user_id", customer.id).order("created_at", { ascending: false }),
      fetch(`/api/admin/accounts?insightsFor=${encodeURIComponent(customer.id)}`, { cache: "no-store" }).then(async (response) => ({ ok: response.ok, data: await response.json() as CustomerInsights & { error?: string } })),
    ]);
    const historyError = ordersResult.error?.message || eventsResult.error?.message || addressesResult.error?.message || reviewsResult.error?.message || supportResult.error?.message || (!insightsResult.ok ? insightsResult.data.error : "") || "";
    setCustomerHistory({ customer, orders: (ordersResult.data ?? []) as CustomerOrderDetail[], events: (eventsResult.data ?? []) as CustomerEvent[], addresses: (addressesResult.data ?? []) as CustomerAddress[], reviews: (reviewsResult.data ?? []) as CustomerReview[], supportRequests: (supportResult.data ?? []) as CustomerSupportRequest[], insights: insightsResult.ok ? insightsResult.data : emptyInsights, loading: false, error: historyError });
  }

  async function showSellerHistory(seller: SellerRow) {
    setSellerHistory({ seller, products: [], orders: [], payouts: [], ledger: [], promotions: [], loading: true, error: "" });
    const supabase = createClient();
    const [productsResult, ordersResult, payoutsResult, ledgerResult, promotionsResult] = await Promise.all([
      supabase.from("products").select("id, name, status, review_status, base_price_cents, created_at").eq("seller_store_id", seller.id).order("created_at", { ascending: false }),
      supabase.from("seller_orders").select("id, status, item_subtotal_cents, platform_fee_cents, seller_net_cents, created_at").eq("seller_store_id", seller.id).order("created_at", { ascending: false }).limit(100),
      supabase.from("seller_payouts").select("id, status, net_payout_cents, created_at").eq("seller_store_id", seller.id).order("created_at", { ascending: false }).limit(100),
      supabase.from("seller_ledger_entries").select("id, entry_type, amount_cents, description, available_at, created_at").eq("seller_store_id", seller.id).order("created_at", { ascending: false }).limit(200),
      supabase.from("promotions").select("id, name, code, is_active, usage_count, created_at").eq("seller_store_id", seller.id).order("created_at", { ascending: false }).limit(100),
    ]);
    const historyError = productsResult.error?.message || ordersResult.error?.message || payoutsResult.error?.message || ledgerResult.error?.message || promotionsResult.error?.message || "";
    setSellerHistory({
      seller,
      products: (productsResult.data ?? []) as SellerProductHistory[],
      orders: (ordersResult.data ?? []) as SellerOrderHistory[],
      payouts: (payoutsResult.data ?? []) as SellerPayoutHistory[],
      ledger: (ledgerResult.data ?? []) as SellerLedgerHistory[],
      promotions: (promotionsResult.data ?? []) as SellerPromotionHistory[],
      loading: false,
      error: historyError,
    });
  }

  async function recordPayment(orderId: string) {
    if (!window.confirm("Confirm that manual/payment-on-delivery funds were received?")) return;
    setBusyId(orderId); setError(""); const { error: actionError } = await createClient().rpc("admin_record_manual_payment", { target_order_id: orderId }); setBusyId("");
    if (actionError) setError(actionError.message); else { setNotice("Payment recorded and seller ledger credited."); await load(); }
  }

  async function addShipment(orderId: string) {
    const tracking = window.prompt("Tracking number:"); if (!tracking?.trim()) return;
    const carrier = window.prompt("Carrier name:") ?? ""; const url = window.prompt("Tracking URL (optional):") ?? "";
    setBusyId(orderId); setError(""); const { error: actionError } = await createClient().rpc("admin_save_shipment", { target_order_id: orderId, shipment_carrier: carrier, shipment_tracking_number: tracking, shipment_tracking_url: url }); setBusyId("");
    if (actionError) setError(actionError.message); else { setNotice("Shipment and tracking saved."); await load(); }
  }

  async function resolveRequest(requestId: string, approve: boolean) {
    const note = window.prompt(approve ? "Optional approval note:" : "Reason for declining:") ?? "";
    setBusyId(requestId); setError(""); const { error: actionError } = await createClient().rpc("admin_resolve_order_request", { target_request_id: requestId, approve, resolution_note: note }); setBusyId("");
    if (actionError) setError(actionError.message); else { setNotice(approve ? "Order request approved." : "Order request declined."); await load(); }
  }

  async function moderateReview(reviewId: string, approve: boolean) {
    setBusyId(reviewId); setError("");
    const result = approve ? await createClient().from("reviews").update({ is_approved: true }).eq("id", reviewId) : await createClient().from("reviews").delete().eq("id", reviewId);
    setBusyId(""); if (result.error) setError(result.error.message); else { setNotice(approve ? "Review published." : "Review removed."); await load(); }
  }

  async function preparePayouts() {
    setBusyId("prepare-payouts"); setError("");
    const { data, error: actionError } = await createClient().rpc("admin_prepare_payouts");
    setBusyId(""); if (actionError) setError(actionError.message); else { setNotice(`${data ?? 0} payout batch${data === 1 ? "" : "es"} prepared.`); await load(); }
  }

  async function markPayoutPaid(payoutId: string) {
    const reference = window.prompt("Enter the completed bank or transfer reference:"); if (!reference?.trim()) return;
    setBusyId(payoutId); setError("");
    const { error: actionError } = await createClient().rpc("admin_mark_payout_paid", { target_payout_id: payoutId, transfer_reference: reference });
    setBusyId(""); if (actionError) setError(actionError.message); else { setNotice("Payout marked paid and seller ledger updated."); await load(); }
  }

  async function completeRefund(refundId: string) {
    const reference = window.prompt("Enter the completed refund reference from your payment provider or bank:"); if (!reference?.trim()) return;
    setBusyId(refundId); setError(""); const { error: actionError } = await createClient().rpc("admin_complete_refund", { target_refund_id: refundId, external_reference: reference }); setBusyId("");
    if (actionError) setError(actionError.message); else { setNotice("Refund completed and all financial records updated."); await load(); }
  }

  const pendingSellers = sellers.filter((seller) => seller.status === "pending");
  const activeSellers = sellers.filter((seller) => seller.status === "approved");

  return <div className="space-y-5">
    {error && <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
    {notice && <p role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</p>}
    {loading ? <section className="rounded-2xl border border-[#e9dfdc] bg-white p-8 text-center text-sm text-[#756a6d]">Loading marketplace data…</section> : null}

    {section === "overview" && !loading && <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={<Store />} title="Approved sellers" value={activeSellers.length.toString()} />
        <Metric icon={<Clock />} title="Seller applications" value={pendingSellers.length.toString()} />
        <Metric icon={<PackageCheck />} title="Listings awaiting review" value={products.length.toString()} />
        <Metric icon={<CircleDollarSign />} title="Default commission" value={`${(commissionBps / 100).toFixed(2)}%`} />
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <section className="rounded-2xl border border-[#e9dfdc] bg-white p-5"><h2 className="text-lg font-bold">Seller applications</h2><p className="mt-1 text-sm text-[#756a6d]">New sellers remain unable to publish until approved.</p><SellerRows rows={pendingSellers} busyId={busyId} protectedOwnerId={currentAdminId} onReview={reviewSeller} onStatus={setSellerStatus} onHistory={(seller) => void showSellerHistory(seller)} /></section>
        <section className="rounded-2xl border border-[#e9dfdc] bg-white p-5"><h2 className="text-lg font-bold">Product review queue</h2><p className="mt-1 text-sm text-[#756a6d]">Listings only appear in the shop after approval.</p><ProductRows rows={products.slice(0, 4)} stores={storeNames} images={productImages} busyId={busyId} onReview={reviewProduct} /></section>
      </div>
      <section className="rounded-2xl border border-[#e9dfdc] bg-white p-5"><h2 className="text-lg font-bold">Paid orders</h2><p className="mt-2 text-sm text-[#756a6d]">{pendingOrders} paid orders are recorded. Order fulfillment and payment-provider processing still require the selected payment integration.</p></section>
    </>}

    {section === "sellers" && !loading && <section className="rounded-2xl border border-[#e9dfdc] bg-white p-5"><h2 className="text-lg font-bold">Seller applications and stores</h2><p className="mt-1 text-sm text-[#756a6d]">Manage seller access and business history here. Their shopping activity remains available under Customers.</p><SellerRows rows={sellers} busyId={busyId} protectedOwnerId={currentAdminId} onReview={reviewSeller} onStatus={setSellerStatus} onHistory={(seller) => void showSellerHistory(seller)} /></section>}

    {section === "approvals" && !loading && <><section className="rounded-2xl border border-[#e9dfdc] bg-white p-5"><h2 className="text-lg font-bold">Product approvals</h2><p className="mt-1 text-sm text-[#756a6d]">Review seller listings before making them publicly visible.</p><ProductRows rows={products} stores={storeNames} images={productImages} busyId={busyId} onReview={reviewProduct} /></section><section className="rounded-2xl border border-[#e9dfdc] bg-white p-5"><h2 className="text-lg font-bold">Review moderation</h2><p className="mt-1 text-sm text-[#756a6d]">Publish genuine customer feedback or remove inappropriate content.</p><div className="mt-4 divide-y divide-[#eee5e1]">{reviews.map((review) => <article key={review.id} className="flex flex-wrap items-center gap-3 py-4"><div className="min-w-0 flex-1"><p className="font-semibold">{review.title || "Customer review"} · {"★".repeat(review.rating)}</p><p className="mt-1 text-xs leading-5 text-[#817679]">{review.body || "No written feedback."}</p></div><button disabled={Boolean(busyId)} onClick={() => void moderateReview(review.id, false)} className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-bold text-rose-700">Remove</button><button disabled={Boolean(busyId)} onClick={() => void moderateReview(review.id, true)} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white">Publish</button></article>)}{!reviews.length && <p className="py-4 text-sm text-[#756a6d]">No reviews are awaiting moderation.</p>}</div></section></>}

    {section === "commission" && !loading && <section className="max-w-xl rounded-2xl border border-[#e9dfdc] bg-white p-6"><p className="text-sm text-[#716669]">Current default rate</p><p className="mt-2 font-serif text-5xl font-semibold">{(commissionBps / 100).toFixed(2)}%</p><p className="mt-3 text-sm leading-6 text-[#7d7275]">The SQL order-item trigger snapshots commission at checkout; changes apply to future orders, not past sales.</p><label className="mt-6 block text-sm font-semibold">New default commission (%)<input value={commissionInput} onChange={(event) => setCommissionInput(event.target.value)} type="number" min="0" max="100" step="0.01" className="mt-2 h-12 w-full rounded-xl border border-[#ddd2cf] px-4" /></label><button onClick={saveCommission} disabled={busyId === "commission"} className="mt-4 w-full rounded-xl bg-[#292326] py-3 font-bold text-white disabled:opacity-50">{busyId === "commission" ? "Saving…" : "Save commission"}</button></section>}

    {section === "orders" && !loading && <><section className="rounded-2xl border border-[#e9dfdc] bg-white p-5"><h2 className="text-lg font-bold">Customer requests</h2>{orderRequests.length ? <div className="mt-4 divide-y divide-[#eee5e1]">{orderRequests.map((request) => <article key={request.id} className="flex flex-wrap items-center gap-3 py-4"><div className="min-w-0 flex-1"><p className="font-semibold capitalize">{request.request_type} request</p><p className="mt-1 text-xs text-[#817679]">{request.reason} · {new Date(request.created_at).toLocaleDateString()}</p></div><button disabled={Boolean(busyId)} onClick={() => void resolveRequest(request.id, false)} className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-bold text-rose-700">Decline</button><button disabled={Boolean(busyId)} onClick={() => void resolveRequest(request.id, true)} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white">Approve</button></article>)}</div> : <p className="mt-3 text-sm text-[#756a6d]">No customer order requests are waiting.</p>}<h3 className="mt-6 border-t border-[#eee5e1] pt-5 font-bold">Pending refunds</h3>{refunds.map((refund) => <article key={refund.id} className="mt-2 flex flex-wrap items-center gap-3 rounded-xl bg-[#faf6f4] p-4"><div className="min-w-0 flex-1"><p className="font-semibold">BZ${(refund.amount_cents / 100).toFixed(2)} refund</p><p className="text-xs text-[#817679]">{refund.reason || "No reason supplied"}</p></div><button disabled={Boolean(busyId)} onClick={() => void completeRefund(refund.id)} className="rounded-lg bg-[#292326] px-3 py-2 text-xs font-bold text-white">Record completed refund</button></article>)}{!refunds.length && <p className="mt-2 text-sm text-[#756a6d]">No approved refunds are waiting for payment.</p>}</section><section className="rounded-2xl border border-[#e9dfdc] bg-white p-5"><h2 className="text-lg font-bold">Marketplace orders</h2>{orders.length ? <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[780px] text-left text-sm"><thead className="bg-[#f8f3f1] text-xs text-[#72686b]"><tr>{["Order", "Customer", "Total", "Payment", "Fulfillment", "Date", "Actions"].map((label) => <th key={label} className="px-3 py-3">{label}</th>)}</tr></thead><tbody>{orders.map((order) => <tr key={order.id} className="border-t border-[#eee5e2]"><td className="px-3 py-3 font-semibold">#{order.order_number}</td><td className="px-3">{order.email}</td><td className="px-3">BZ${(order.total_cents / 100).toFixed(2)}</td><td className="px-3">{order.payment_status}</td><td className="px-3">{order.fulfillment_status}</td><td className="px-3">{new Date(order.created_at).toLocaleDateString()}</td><td className="px-3"><div className="flex gap-2">{order.payment_status === "pending" && <button disabled={Boolean(busyId)} onClick={() => void recordPayment(order.id)} className="text-xs font-bold text-emerald-700 underline">Mark paid</button>}{order.fulfillment_status !== "shipped" && order.fulfillment_status !== "delivered" && <button disabled={Boolean(busyId)} onClick={() => void addShipment(order.id)} className="text-xs font-bold text-[#a85855] underline">Add tracking</button>}</div></td></tr>)}</tbody></table></div> : <p className="mt-4 text-sm text-[#756a6d]">No orders have been placed yet.</p>}</section></>}

    {section === "payouts" && !loading && <section className="rounded-2xl border border-[#e9dfdc] bg-white p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold">Seller payouts</h2><p className="mt-1 text-sm text-[#756a6d]">Prepare eligible balances, then record the completed bank or provider transfer reference.</p></div><button disabled={Boolean(busyId)} onClick={() => void preparePayouts()} className="rounded-xl bg-[#292326] px-4 py-3 text-xs font-bold text-white disabled:opacity-50">Prepare eligible payouts</button></div>{payouts.length ? <div className="mt-4 divide-y divide-[#eee5e1]">{payouts.map((payout) => <article key={payout.id} className="flex flex-wrap items-center justify-between gap-4 py-4"><div className="min-w-0 flex-1"><p className="font-semibold">{storeNames.get(payout.seller_store_id) ?? "Seller"}</p><p className="text-xs text-[#817679]">{payout.status} · {new Date(payout.created_at).toLocaleDateString()}</p></div><strong>BZ${(payout.net_payout_cents / 100).toFixed(2)}</strong>{["ready", "processing"].includes(payout.status) && <button disabled={Boolean(busyId)} onClick={() => void markPayoutPaid(payout.id)} className="rounded-lg border border-emerald-200 px-3 py-2 text-xs font-bold text-emerald-700">Mark paid</button>}</article>)}</div> : <p className="mt-4 text-sm text-[#756a6d]">No payout records yet.</p>}</section>}

    {section === "customers" && !loading && <CustomerAccountsSection customers={customers} total={customerCount} view={customerView} onView={setCustomerView} busyId={busyId} onAction={(customer, action) => void manageCustomer(customer, action)} onHistory={(customer) => void showCustomerHistory(customer)} />}
    {customerHistory && <CustomerHistoryModal history={customerHistory} onClose={() => setCustomerHistory(null)} />}
    {sellerHistory && <SellerHistoryModal history={sellerHistory} onClose={() => setSellerHistory(null)} />}

    {section === "categories" && !loading && <><section className="rounded-2xl border border-[#e9dfdc] bg-white p-5"><div className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="text-lg font-bold">Payment integration test catalog</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-[#756a6d]">Create or refresh one clearly labeled demo product in every active main category. These products use the official store and a non-payable demo bank account.</p></div><button type="button" disabled={Boolean(busyId)} onClick={() => void seedPaymentDemoCatalog()} className="rounded-xl bg-[#292326] px-4 py-3 text-sm font-bold text-white disabled:opacity-50">{busyId === "demo-catalog" ? "Preparing demos…" : "Create demo products"}</button></div></section><AdminCategoryManager /></>}

    {section === "settings" && !loading && <div className="grid gap-5 xl:grid-cols-2"><section className="rounded-2xl border border-[#e9dfdc] bg-white p-6"><h2 className="text-lg font-bold">Seller onboarding</h2><p className="mt-2 text-sm leading-6 text-[#756a6d]">Control whether customers may submit new seller applications.</p><label className="mt-5 flex items-center justify-between gap-4 text-sm font-semibold">Accept seller applications<input type="checkbox" checked={applicationsOpen} disabled={busyId === "settings"} onChange={(event) => void updateApplicationsOpen(event.target.checked)} className="h-5 w-5 accent-[#b85f5d]" /></label></section><AdminAccessManager /><AdminShippingManager /></div>}
  </div>;
}

function CustomerAccountsSection({ customers, total, view, onView, busyId, onAction, onHistory }: { customers: CustomerRow[]; total: number; view: CustomerStatus; onView: (view: CustomerStatus) => void; busyId: string; onAction: (customer: CustomerRow, action: "suspend" | "reactivate" | "archive" | "restore") => void; onHistory: (customer: CustomerRow) => void }) {
  const counts = {
    active: customers.filter((customer) => customer.account_status === "active").length,
    suspended: customers.filter((customer) => customer.account_status === "suspended").length,
    archived: customers.filter((customer) => customer.account_status === "archived").length,
  };
  const visibleCustomers = customers.filter((customer) => customer.account_status === view);
  const tabs: Array<{ id: CustomerStatus; label: string }> = [
    { id: "active", label: "Live Customers" },
    { id: "suspended", label: "Suspended" },
    { id: "archived", label: "Archived Data" },
  ];

  return <section className="rounded-2xl border border-[#e9dfdc] bg-white p-5">
    <h2 className="text-lg font-bold">Customer accounts</h2>
    <p className="mt-2 text-sm text-[#756a6d]">{total} customer account{total === 1 ? "" : "s"} recorded. Sellers remain customers and can continue purchasing from other stores unless their whole account is suspended.</p>
    <div className="mt-5 flex flex-wrap gap-2" role="tablist" aria-label="Customer account status">
      {tabs.map((tab) => <button key={tab.id} type="button" role="tab" aria-selected={view === tab.id} onClick={() => onView(tab.id)} className={`rounded-xl px-4 py-2.5 text-xs font-bold transition ${view === tab.id ? "bg-[#292326] text-white" : "bg-[#f6efed] text-[#7b6465] hover:bg-[#eedfdb]"}`}>{tab.label} <span className="ml-1 opacity-75">{counts[tab.id]}</span></button>)}
    </div>
    {view === "archived" && <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900"><strong>Previously used accounts:</strong> each email below has already been registered on BelGlow. Restore the existing account instead of creating a duplicate.</div>}
    <div className="mt-4 divide-y divide-[#eee5e1]">
      {visibleCustomers.map((customer) => <article key={customer.id} className="flex flex-wrap items-center gap-4 py-4">
        <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-full font-bold ${view === "archived" ? "bg-amber-100 text-amber-800" : view === "suspended" ? "bg-rose-100 text-rose-700" : "bg-[#f2dfdb] text-[#a75754]"}`}>{(customer.store_name || customer.full_name || customer.email || "C").charAt(0).toUpperCase()}</span>
        <div className="min-w-[220px] flex-1">
          <div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{customer.store_name || customer.full_name || "BelGlow customer"}</p><span className="rounded-full bg-[#f1e9e7] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#725f61]">{customer.is_platform_admin ? "Official Store + Customer" : customer.role === "seller" ? "Seller + Customer" : "Customer"}</span><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${view === "archived" ? "bg-amber-100 text-amber-800" : view === "suspended" ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-800"}`}>{view === "active" ? "Live" : view}</span></div>
          <p className="mt-1 break-all text-xs text-[#817679]">{customer.email} · {customer.phone || "No phone saved"}</p>
          <p className="mt-1 text-xs text-[#817679]">{customer.order_count} order{Number(customer.order_count) === 1 ? "" : "s"} · BZ${(Number(customer.total_spent_cents) / 100).toFixed(2)} paid · BZ${(Number(customer.refund_total_cents) / 100).toFixed(2)} refunded</p>
          {customer.is_platform_admin && <p className="mt-1 text-xs font-semibold text-[#9b5754]">Protected platform administrator account</p>}
          {view === "suspended" && <p className="mt-1 text-xs font-semibold text-rose-700">{customer.suspended_until ? `Suspended until ${new Date(customer.suspended_until).toLocaleString()}` : "Suspended until an administrator reactivates the account"}{customer.suspension_reason ? ` · ${customer.suspension_reason}` : ""}</p>}
          {view === "archived" && <p className="mt-1 text-xs font-semibold text-amber-800">Archived {customer.archived_at ? new Date(customer.archived_at).toLocaleString() : "previously"} · Email flagged as previously used</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => onHistory(customer)} className="rounded-lg border border-[#d8cecb] px-3 py-2 text-xs font-bold text-[#62595c]">View history</button>
          {!customer.is_platform_admin && view === "active" && <button type="button" disabled={Boolean(busyId)} onClick={() => onAction(customer, "suspend")} className="rounded-lg border border-amber-300 px-3 py-2 text-xs font-bold text-amber-800 disabled:opacity-50">Suspend</button>}
          {!customer.is_platform_admin && view === "suspended" && <button type="button" disabled={Boolean(busyId)} onClick={() => onAction(customer, "reactivate")} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Reactivate</button>}
          {!customer.is_platform_admin && view !== "archived" && <button type="button" disabled={Boolean(busyId)} onClick={() => onAction(customer, "archive")} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300 px-3 py-2 text-xs font-bold text-rose-700 disabled:opacity-50"><Trash2 size={14} />{busyId === customer.id ? "Archiving…" : "Archive account"}</button>}
          {!customer.is_platform_admin && view === "archived" && <button type="button" disabled={Boolean(busyId)} onClick={() => onAction(customer, "restore")} className="inline-flex items-center gap-1.5 rounded-lg bg-[#292326] px-3 py-2 text-xs font-bold text-white disabled:opacity-50"><Check size={14} />{busyId === customer.id ? "Restoring…" : "Restore account"}</button>}
        </div>
      </article>)}
      {!visibleCustomers.length && <p className="py-8 text-center text-sm text-[#756a6d]">No {view === "active" ? "live" : view} accounts were found.</p>}
    </div>
  </section>;
}

function CustomerHistoryModal({ history, onClose }: { history: CustomerHistory; onClose: () => void }) {
  const customer = history.customer;
  return <div className="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto bg-[#211a1d]/60 p-4 backdrop-blur-sm sm:p-8" role="dialog" aria-modal="true" aria-labelledby="customer-history-title" onMouseDown={onClose}>
    <section onMouseDown={(event) => event.stopPropagation()} className="relative w-full max-w-4xl rounded-[28px] bg-white p-5 shadow-2xl sm:p-7">
      <button type="button" onClick={onClose} className="absolute right-5 top-5 rounded-full bg-[#f7efed] p-2" aria-label="Close customer history"><X size={19} /></button>
      <p className="text-xs font-bold uppercase tracking-[.18em] text-[#a85855]">{customer.account_status === "archived" ? "Archived customer data" : "Customer history"}</p>
      <h2 id="customer-history-title" className="mt-2 pr-12 font-serif text-3xl font-semibold">{customer.store_name || customer.full_name || customer.email}</h2>
      <p className="mt-1 break-all text-sm text-[#756a6d]">{customer.email} · Joined {new Date(customer.created_at).toLocaleDateString()}</p>
      <div className="mt-5 grid gap-3 sm:grid-cols-3"><HistoryStat label="Orders" value={String(customer.order_count)} /><HistoryStat label="Paid total" value={`BZ$${(Number(customer.total_spent_cents) / 100).toFixed(2)}`} /><HistoryStat label="Refunded" value={`BZ$${(Number(customer.refund_total_cents) / 100).toFixed(2)}`} /></div>
      {history.loading && <p className="mt-6 rounded-xl bg-[#faf6f4] p-5 text-sm text-[#756a6d]">Loading complete customer history…</p>}
      {history.error && <p role="alert" className="mt-6 rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{history.error}</p>}
      {!history.loading && !history.error && <>
        <div className="mt-6 grid gap-5 md:grid-cols-2">
          <div><h3 className="font-bold">Most viewed products</h3><div className="mt-2 space-y-2">{history.insights.mostViewedProducts.map((product) => <div key={product.productId} className="flex items-center justify-between gap-3 rounded-xl bg-[#faf6f4] px-4 py-3 text-sm"><div><strong>{product.name}</strong><p className="mt-0.5 text-xs text-[#817679]">{product.views} view{product.views === 1 ? "" : "s"}{product.lastViewedAt ? ` · Last viewed ${new Date(product.lastViewedAt).toLocaleDateString()}` : ""}</p></div><span className="rounded-full bg-white px-2 py-1 text-xs font-bold text-[#a85855]">{product.score.toFixed(0)} pts</span></div>)}{!history.insights.mostViewedProducts.length && <p className="text-sm text-[#817679]">No product activity recorded yet.</p>}</div></div>
          <div><h3 className="font-bold">Top categories</h3><div className="mt-2 space-y-2">{history.insights.topCategories.map((category, index) => <div key={category.name} className="rounded-xl bg-[#faf6f4] px-4 py-3"><div className="flex justify-between gap-3 text-sm"><strong>{category.name}</strong><span className="text-xs font-semibold text-[#817679]">{category.score.toFixed(0)} pts</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#eadfdb]"><div className="h-full rounded-full bg-[#c8726b]" style={{ width: `${Math.max(8, 100 - index * 18)}%` }} /></div></div>)}{!history.insights.topCategories.length && <p className="text-sm text-[#817679]">No category preferences recorded yet.</p>}</div></div>
        </div>
        <div className="mt-6"><h3 className="font-bold">Account activity</h3><div className="mt-2 space-y-2">{history.events.map((event) => <div key={event.id} className="rounded-xl bg-[#faf6f4] px-4 py-3 text-sm"><strong className="capitalize">{event.event_type}</strong><span className="text-[#817679]"> · {new Date(event.created_at).toLocaleString()}{event.scheduled_until ? ` · until ${new Date(event.scheduled_until).toLocaleString()}` : ""}</span>{event.reason && <p className="mt-1 text-xs text-[#756a6d]">{event.reason}</p>}</div>)}{!history.events.length && <p className="text-sm text-[#817679]">No suspension or archive events recorded.</p>}</div></div>
        <div className="mt-6 grid gap-5 md:grid-cols-2"><div><h3 className="font-bold">Saved addresses</h3><div className="mt-2 space-y-2">{history.addresses.map((address) => <div key={address.id} className="rounded-xl bg-[#faf6f4] px-4 py-3 text-sm"><strong>{address.label} · {address.recipient_name}</strong><p className="mt-1 text-xs leading-5 text-[#756a6d]">{[address.address_line_1, address.address_line_2, address.city, address.district, address.postal_code, address.country_code].filter(Boolean).join(", ")}{address.phone ? ` · ${address.phone}` : ""}</p>{address.delivery_notes && <p className="mt-1 text-xs text-[#817679]">Delivery note: {address.delivery_notes}</p>}</div>)}{!history.addresses.length && <p className="text-sm text-[#817679]">No saved addresses.</p>}</div></div><div><h3 className="font-bold">Reviews</h3><div className="mt-2 space-y-2">{history.reviews.map((review) => <div key={review.id} className="rounded-xl bg-[#faf6f4] px-4 py-3 text-sm"><strong>{review.products[0]?.name || "Product"} · {"★".repeat(review.rating)}</strong><p className="mt-1 text-xs text-[#756a6d]">{review.title || review.body || "No written review"} · {review.is_approved ? "Published" : "Not published"}</p></div>)}{!history.reviews.length && <p className="text-sm text-[#817679]">No customer reviews.</p>}</div></div></div>
        <div className="mt-6"><h3 className="font-bold">Support requests</h3><div className="mt-2 space-y-2">{history.supportRequests.map((support) => <div key={support.id} className="rounded-xl bg-[#faf6f4] px-4 py-3 text-sm"><div className="flex flex-wrap justify-between gap-2"><strong>{support.subject}</strong><span className="text-xs font-semibold capitalize text-[#817679]">{support.status.replace("_", " ")}</span></div><p className="mt-1 text-xs leading-5 text-[#756a6d]">{support.message}</p>{support.admin_note && <p className="mt-1 text-xs font-semibold text-[#62595c]">Admin note: {support.admin_note}</p>}</div>)}{!history.supportRequests.length && <p className="text-sm text-[#817679]">No support requests.</p>}</div></div>
        <div className="mt-6"><h3 className="font-bold">Orders and transactions</h3><div className="mt-2 space-y-3">{history.orders.map((order) => <article key={order.id} className="rounded-2xl border border-[#e9dfdc] p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold">Order #{order.order_number}</p><p className="mt-1 text-xs text-[#817679]">{new Date(order.placed_at).toLocaleString()} · {order.status} · {order.fulfillment_status}</p></div><strong>BZ${(Number(order.total_cents) / 100).toFixed(2)}</strong></div><div className="mt-3 grid gap-3 text-xs sm:grid-cols-2"><div><p className="font-bold">Products</p>{order.order_items.map((item) => <p key={item.id} className="mt-1 text-[#756a6d]">{item.quantity}× {item.product_name}{item.variant_name ? ` · ${item.variant_name}` : ""} — BZ${(Number(item.total_cents) / 100).toFixed(2)}</p>)}</div><div><p className="font-bold">Payment and delivery</p><p className="mt-1 text-[#756a6d]">Payment: {order.payment_status}{order.payments[0]?.provider ? ` via ${order.payments[0].provider}` : ""}</p><p className="mt-1 text-[#756a6d]">Shipments: {order.shipments.length || "None"}{order.shipments[0]?.tracking_number ? ` · ${order.shipments[0].tracking_number}` : ""}</p><p className="mt-1 text-[#756a6d]">Refunds: {order.refunds.length ? `BZ$${(order.refunds.reduce((sum, refund) => sum + Number(refund.amount_cents), 0) / 100).toFixed(2)}` : "None"}</p></div></div></article>)}{!history.orders.length && <p className="rounded-xl bg-[#faf6f4] p-5 text-sm text-[#817679]">This customer has no orders or transactions.</p>}</div></div>
      </>}
    </section>
  </div>;
}

function SellerHistoryModal({ history, onClose }: { history: SellerHistory; onClose: () => void }) {
  const grossSales = history.orders.reduce((sum, order) => sum + Number(order.item_subtotal_cents), 0);
  const platformFees = history.orders.reduce((sum, order) => sum + Number(order.platform_fee_cents), 0);
  const sellerNet = history.orders.reduce((sum, order) => sum + Number(order.seller_net_cents), 0);
  const paidOut = history.payouts.filter((payout) => payout.status === "paid").reduce((sum, payout) => sum + Number(payout.net_payout_cents), 0);

  return <div className="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto bg-[#211a1d]/60 p-4 backdrop-blur-sm sm:p-8" role="dialog" aria-modal="true" aria-labelledby="seller-history-title" onMouseDown={onClose}>
    <section onMouseDown={(event) => event.stopPropagation()} className="relative w-full max-w-5xl rounded-[28px] bg-white p-5 shadow-2xl sm:p-7">
      <button type="button" onClick={onClose} className="absolute right-5 top-5 rounded-full bg-[#f7efed] p-2" aria-label="Close seller history"><X size={19} /></button>
      <p className="text-xs font-bold uppercase tracking-[.18em] text-[#a85855]">Seller business history</p>
      <h2 id="seller-history-title" className="mt-2 pr-12 font-serif text-3xl font-semibold">{history.seller.name}</h2>
      <p className="mt-1 text-sm text-[#756a6d]">{history.seller.slug} - {history.seller.status} - Joined {new Date(history.seller.created_at).toLocaleDateString()}</p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <HistoryStat label="Products" value={String(history.products.length)} />
        <HistoryStat label="Seller orders" value={String(history.orders.length)} />
        <HistoryStat label="Gross sales" value={`BZ$${(grossSales / 100).toFixed(2)}`} />
        <HistoryStat label="Platform fees" value={`BZ$${(platformFees / 100).toFixed(2)}`} />
        <HistoryStat label="Seller net" value={`BZ$${(sellerNet / 100).toFixed(2)}`} />
      </div>
      {history.loading && <p className="mt-6 rounded-xl bg-[#faf6f4] p-5 text-sm text-[#756a6d]">Loading seller business history...</p>}
      {history.error && <p role="alert" className="mt-6 rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{history.error}</p>}
      {!history.loading && !history.error && <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div><h3 className="font-bold">Products</h3><div className="mt-2 space-y-2">{history.products.map((product) => <div key={product.id} className="flex items-center justify-between gap-3 rounded-xl bg-[#faf6f4] px-4 py-3 text-sm"><div><strong>{product.name}</strong><p className="mt-1 text-xs capitalize text-[#817679]">{product.status} - review: {product.review_status} - {new Date(product.created_at).toLocaleDateString()}</p></div><span className="font-semibold">BZ${(Number(product.base_price_cents) / 100).toFixed(2)}</span></div>)}{!history.products.length && <p className="text-sm text-[#817679]">No products recorded for this store.</p>}</div></div>
        <div><h3 className="font-bold">Orders and earnings</h3><div className="mt-2 space-y-2">{history.orders.map((order) => <div key={order.id} className="rounded-xl bg-[#faf6f4] px-4 py-3 text-sm"><div className="flex justify-between gap-3"><strong className="capitalize">{order.status}</strong><span>{new Date(order.created_at).toLocaleDateString()}</span></div><p className="mt-1 text-xs text-[#817679]">Gross BZ${(Number(order.item_subtotal_cents) / 100).toFixed(2)} - Fee BZ${(Number(order.platform_fee_cents) / 100).toFixed(2)} - Net BZ${(Number(order.seller_net_cents) / 100).toFixed(2)}</p></div>)}{!history.orders.length && <p className="text-sm text-[#817679]">No seller orders recorded.</p>}</div></div>
        <div><div className="flex items-center justify-between gap-3"><h3 className="font-bold">Payouts</h3><span className="text-xs font-semibold text-[#817679]">Paid BZ${(paidOut / 100).toFixed(2)}</span></div><div className="mt-2 space-y-2">{history.payouts.map((payout) => <div key={payout.id} className="flex items-center justify-between gap-3 rounded-xl bg-[#faf6f4] px-4 py-3 text-sm"><div><strong className="capitalize">{payout.status}</strong><p className="mt-1 text-xs text-[#817679]">{new Date(payout.created_at).toLocaleDateString()}</p></div><span className="font-semibold">BZ${(Number(payout.net_payout_cents) / 100).toFixed(2)}</span></div>)}{!history.payouts.length && <p className="text-sm text-[#817679]">No payouts recorded.</p>}</div></div>
        <div><h3 className="font-bold">Promotions</h3><div className="mt-2 space-y-2">{history.promotions.map((promotion) => <div key={promotion.id} className="rounded-xl bg-[#faf6f4] px-4 py-3 text-sm"><div className="flex justify-between gap-3"><strong>{promotion.name}</strong><span className={promotion.is_active ? "text-emerald-700" : "text-[#817679]"}>{promotion.is_active ? "Active" : "Inactive"}</span></div><p className="mt-1 text-xs text-[#817679]">{promotion.code} - {promotion.usage_count} use{promotion.usage_count === 1 ? "" : "s"}</p></div>)}{!history.promotions.length && <p className="text-sm text-[#817679]">No promotions recorded.</p>}</div></div>
        <div className="lg:col-span-2"><h3 className="font-bold">Financial ledger</h3><div className="mt-2 max-h-80 space-y-2 overflow-y-auto">{history.ledger.map((entry) => <div key={entry.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#faf6f4] px-4 py-3 text-sm"><div><strong className="capitalize">{entry.entry_type.replaceAll("_", " ")}</strong><p className="mt-1 text-xs text-[#817679]">{entry.description} - {new Date(entry.created_at).toLocaleString()}</p></div><span className={`font-semibold ${Number(entry.amount_cents) < 0 ? "text-rose-700" : "text-emerald-700"}`}>{Number(entry.amount_cents) < 0 ? "-" : "+"}BZ${(Math.abs(Number(entry.amount_cents)) / 100).toFixed(2)}</span></div>)}{!history.ledger.length && <p className="text-sm text-[#817679]">No ledger entries recorded.</p>}</div></div>
      </div>}
    </section>
  </div>;
}

function HistoryStat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-[#faf6f4] p-4"><p className="text-xs text-[#817679]">{label}</p><p className="mt-1 font-serif text-2xl font-semibold">{value}</p></div>;
}

function SellerRows({ rows, busyId, protectedOwnerId, onReview, onStatus, onHistory }: { rows: SellerRow[]; busyId: string; protectedOwnerId: string; onReview: (id: string, approve: boolean) => void; onStatus: (seller: SellerRow, status: "approved" | "suspended") => void; onHistory: (seller: SellerRow) => void }) {
  if (!rows.length) return <p className="mt-5 rounded-xl bg-[#faf6f4] p-5 text-sm text-[#756a6d]">No seller applications to review.</p>;
  return <div className="mt-4 divide-y divide-[#eee5e1]">{rows.map((seller) => {
    const isProtected = Boolean(protectedOwnerId) && seller.owner_id === protectedOwnerId;
    return <article key={seller.id} className="flex flex-wrap items-center gap-3 py-4"><div className="min-w-0 flex-1"><p className="font-semibold">{seller.name}</p><p className="mt-1 text-xs text-[#817679]">{seller.slug} · {seller.status} · {new Date(seller.created_at).toLocaleDateString()}</p>{seller.rejection_reason && <p className="mt-1 text-xs text-rose-700">{seller.rejection_reason}</p>}{isProtected && <p className="mt-1 text-xs font-semibold text-[#9b5754]">Your protected administrator store</p>}</div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => onHistory(seller)} className="rounded-lg border border-[#d8cecb] px-3 py-2 text-xs font-bold text-[#62595c]">View history</button>{seller.status === "pending" ? <><button disabled={Boolean(busyId)} onClick={() => onReview(seller.id, false)} className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-bold text-rose-700 disabled:opacity-50"><X size={14} className="mr-1 inline" />Reject</button><button disabled={Boolean(busyId)} onClick={() => onReview(seller.id, true)} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"><Check size={14} className="mr-1 inline" />Approve</button></> : !isProtected && <button disabled={Boolean(busyId)} onClick={() => onStatus(seller, seller.status === "approved" ? "suspended" : "approved")} className="rounded-lg border border-[#d9b9b4] px-3 py-2 text-xs font-bold text-[#9b514f] disabled:opacity-50">{seller.status === "approved" ? "Suspend" : "Reactivate"}</button>}</div></article>;
  })}</div>;
}

function ProductRows({ rows, stores, images, busyId, onReview }: { rows: ProductRow[]; stores: Map<string, string>; images: Map<string, string>; busyId: string; onReview: (id: string, approve: boolean) => void }) {
  if (!rows.length) return <p className="mt-5 rounded-xl bg-[#faf6f4] p-5 text-sm text-[#756a6d]">No products are awaiting review.</p>;
  return <div className="mt-4 divide-y divide-[#eee5e1]">{rows.map((product) => <article key={product.id} className="flex flex-wrap items-center gap-3 py-4">{images.get(product.id) && <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-[#faf6f4]"><Image src={images.get(product.id)!} alt={product.name} fill sizes="80px" className="object-cover" unoptimized /></div>}<div className="min-w-0 flex-1"><p className="font-semibold">{product.name}</p><p className="mt-1 text-xs text-[#817679]">{stores.get(product.seller_store_id) ?? "Seller store"} · BZ${(product.base_price_cents / 100).toFixed(2)} · {product.submitted_at ? new Date(product.submitted_at).toLocaleDateString() : "Submitted"}</p><p className="mt-2 text-xs leading-5 text-[#62595c]">{product.description || product.short_description || "No product description supplied."}</p>{product.ingredients && <p className="mt-1 text-[11px] text-[#817679]"><strong>Ingredients:</strong> {product.ingredients}</p>}{product.usage_instructions && <p className="mt-1 text-[11px] text-[#817679]"><strong>How to use:</strong> {product.usage_instructions}</p>}</div><div className="flex gap-2"><button disabled={Boolean(busyId)} onClick={() => onReview(product.id, false)} className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-bold text-rose-700 disabled:opacity-50">Request changes</button><button disabled={Boolean(busyId)} onClick={() => onReview(product.id, true)} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Approve</button></div></article>)}</div>;
}

function Metric({ icon, title, value }: { icon: React.ReactNode; title: string; value: string }) {
  return <article className="rounded-2xl border border-[#e9dfdc] bg-white p-5"><div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-[#f2dfdb] text-[#a75754]">{icon}</span><div><p className="text-xs text-[#756a6d]">{title}</p><p className="font-serif text-2xl font-bold">{value}</p></div></div></article>;
}
