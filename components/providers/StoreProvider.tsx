"use client";

import Image from "next/image";
import Link from "next/link";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { FormEvent, ReactNode, createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Heart, Mail, Minus, ShoppingBag, Sparkles, Store, UserRound, X } from "lucide-react";
import { type StoreProduct } from "@/lib/catalog";
import { createClient } from "@/utils/supabase/client";

const ProductPreviewModal = dynamic(() => import("@/components/products/ProductPreviewModal"));

type AccountRole = "shopper" | "seller" | "admin";
type SocialProvider = "google" | "apple" | "facebook";
type ProductInteraction = "view" | "favorite" | "unfavorite" | "add_to_cart";

const socialProviders: Array<{ id: SocialProvider; label: string; enabled: boolean }> = [
  { id: "google", label: "Google", enabled: process.env.NEXT_PUBLIC_ENABLE_GOOGLE_AUTH !== "false" },
  { id: "apple", label: "Apple", enabled: process.env.NEXT_PUBLIC_ENABLE_APPLE_AUTH === "true" },
  { id: "facebook", label: "Facebook", enabled: process.env.NEXT_PUBLIC_ENABLE_FACEBOOK_AUTH === "true" },
];

type StoreUser = {
  id: string;
  name: string;
  email: string;
  role: AccountRole;
};

type CatalogPayload = {
  id: string; sellerStoreId: string | null; slug: string; name: string; shortDescription: string | null;
  description: string | null; ingredients: string | null; usageInstructions: string | null;
  attributes: Record<string, unknown> | null; basePriceCents: number; compareAtPriceCents: number | null;
  sellerName: string | null; sellerSlug: string | null; category: string; images: string[];
  variants: Array<{ id: string; name: string; priceCents: number; stock: number }>;
  ratingAverage: number | null; ratingCount: number;
};

export type StoreCartItem = { productId: string; variantId?: string; optionName?: string; price?: number };

type StoreContextValue = {
  cart: StoreCartItem[];
  favoriteIds: string[];
  savedStoreIds: string[];
  products: ReadonlyArray<StoreProduct>;
  recommendations: ReadonlyArray<StoreProduct>;
  userName: string | null;
  userRole: AccountRole | null;
  addToCart: (id: string, variantId?: string) => void;
  toggleFavorite: (id: string) => void;
  toggleSavedStore: (id: string) => void;
  openProduct: (id: string) => void;
  trackProduct: (id: string) => void;
  openCart: () => void;
  openWishlist: () => void;
  openAuth: () => void;
  completeCheckout: () => void;
  signOut: () => void;
};

const StoreContext = createContext<StoreContextValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const shouldLoadShoppingData = pathname === "/" || ["/shop", "/categories", "/product/", "/store/", "/checkout", "/account"].some((route) => pathname === route || pathname.startsWith(route));
  const [cart, setCart] = useState<StoreCartItem[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [savedStoreIds, setSavedStoreIds] = useState<string[]>([]);
  const [wishlistId, setWishlistId] = useState<string | null>(null);
  const guestCartRef = useRef<StoreCartItem[]>([]);
  const guestFavoritesRef = useRef<string[]>([]);
  const [catalogProducts, setCatalogProducts] = useState<StoreProduct[]>([]);
  const [interest, setInterest] = useState<Record<string, number>>({});
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [wishlistOpen, setWishlistOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authError, setAuthError] = useState("");
  const [currentUser, setCurrentUser] = useState<StoreUser | null>(null);
  const [notice, setNotice] = useState("");
  const userName = currentUser?.name ?? null;
  const userRole = currentUser?.role ?? null;
  const blockingOverlay = selectedProductId !== null || cartOpen || wishlistOpen || authOpen;

  function clearPrivateShoppingState() {
    guestCartRef.current = [];
    guestFavoritesRef.current = [];
    setCart([]);
    setFavoriteIds([]);
    setSavedStoreIds([]);
    setWishlistId(null);
  }

  useEffect(() => {
    // Guest shopping data is intentionally session-only. Remove values left by
    // older builds that persisted guest carts and favorites in localStorage.
    window.localStorage.removeItem("belglow-cart");
    window.localStorage.removeItem("belglow-favorites");
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    const oauthError = url.searchParams.get("authError");
    if (!oauthError) return;
    url.searchParams.delete("authError");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    const timer = window.setTimeout(() => {
      setAuthError(oauthError === "provider_cancelled"
        ? "Social sign-in was cancelled. You can try again or use email and password."
        : oauthError === "account_archived"
          ? "This account is archived. Contact BelGlow support or ask an administrator to restore it."
          : oauthError === "account_suspended"
            ? "This account is currently suspended. Contact BelGlow support if you need assistance."
            : "We could not complete social sign-in. Please try again or use email and password.");
      setAuthOpen(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    async function loadProfile(userId: string, email: string, metadata: Record<string, unknown>) {
      const [profileResult, adminResult] = await Promise.all([
        supabase.from("profiles").select("role, full_name, account_status, suspended_until").eq("id", userId).maybeSingle(),
        supabase.rpc("is_admin"),
      ]);
      let data = profileResult.data as { role: string; full_name: string | null; account_status?: string; suspended_until?: string | null } | null;
      if (profileResult.error?.message.includes("account_status") || profileResult.error?.message.includes("suspended_until")) {
        const legacyResult = await supabase.from("profiles").select("role, full_name").eq("id", userId).maybeSingle();
        data = legacyResult.data;
      }
      if (!active) return;
      const suspensionActive = data?.account_status === "suspended"
        && (!data.suspended_until || new Date(data.suspended_until).getTime() > Date.now());
      if (data?.account_status === "archived" || suspensionActive) {
        await supabase.auth.signOut({ scope: "local" });
        if (!active) return;
        setCurrentUser(null);
        clearPrivateShoppingState();
        setAuthError(data?.account_status === "archived"
          ? "This account is archived. Contact BelGlow support or ask an administrator to restore it."
          : "This account is currently suspended. Contact BelGlow support if you need assistance.");
        setAuthOpen(true);
        return;
      }
      const role = adminResult.data || data?.role === "admin" || data?.role === "staff" ? "admin" : data?.role === "seller" ? "seller" : "shopper";
      const metadataName = typeof metadata.full_name === "string" ? metadata.full_name : typeof metadata.name === "string" ? metadata.name : "";
      setCurrentUser({ id: userId, name: data?.full_name || metadataName || email.split("@")[0], email, role });
    }

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        if (active) {
          setCurrentUser(null);
          clearPrivateShoppingState();
        }
        return;
      }
      void loadProfile(user.id, user.email ?? "", user.user_metadata ?? {});
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        setCurrentUser(null);
        clearPrivateShoppingState();
        return;
      }
      // Defer Supabase queries outside the auth callback to avoid blocking its lock.
      window.setTimeout(() => void loadProfile(session.user.id, session.user.email ?? "", session.user.user_metadata ?? {}), 0);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!shouldLoadShoppingData) return;
    const supabase = createClient();
    let active = true;

    async function loadCatalog() {
      const { data: fastCatalog } = await supabase.rpc("get_public_catalog");
      if (active && Array.isArray(fastCatalog)) {
        const optimizedProducts = (fastCatalog as CatalogPayload[]).map((product) => {
          const variants = product.variants.map((variant) => ({ id: variant.id, name: variant.name, price: Number(variant.priceCents) / 100, stock: Number(variant.stock) }));
          const imageUrls = product.images.map((path) => supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl);
          const firstVariant = variants[0];
          return {
            id: product.id, slug: product.slug, name: product.name, category: product.category,
            rating: product.ratingAverage === null ? "New" : `${Number(product.ratingAverage).toFixed(1)} (${product.ratingCount})`,
            price: firstVariant?.price ?? Number(product.basePriceCents) / 100, position: "center",
            description: product.description ?? product.shortDescription ?? undefined,
            imageUrl: imageUrls[0], imageUrls, variantId: firstVariant?.id,
            subtitle: typeof product.attributes?.subtitle === "string" ? product.attributes.subtitle : product.shortDescription ?? undefined,
            ingredients: product.ingredients ?? undefined, usageInstructions: product.usageInstructions ?? undefined,
            shippingInfo: typeof product.attributes?.shipping_info === "string" ? product.attributes.shipping_info : undefined,
            sellerName: product.sellerName ?? "BelGlow", sellerStoreId: product.sellerStoreId ?? undefined,
            sellerSlug: product.sellerSlug ?? undefined,
            compareAtPrice: product.compareAtPriceCents ? Number(product.compareAtPriceCents) / 100 : undefined,
            stock: variants.reduce((total, option) => total + option.stock, 0), variants,
          } satisfies StoreProduct;
        });
        setCatalogProducts(optimizedProducts);
        return;
      }

      // Compatibility path for deployments where the catalog RPC migration
      // has not been applied yet.
      const { data: rows, error } = await supabase.from("products")
        .select("id, seller_store_id, slug, name, short_description, description, ingredients, usage_instructions, attributes, base_price_cents, compare_at_price_cents")
        .eq("status", "active")
        .order("created_at", { ascending: false });
      if (error || !active) return;
      if (!rows?.length) {
        setCatalogProducts([]);
        return;
      }

      const ids = rows.map((row) => row.id);
      const storeIds = [...new Set(rows.map((row) => row.seller_store_id).filter((id): id is string => Boolean(id)))];
      const [categoriesResult, linksResult, variantsResult, imagesResult, reviewsResult, storesResult] = await Promise.all([
        supabase.from("categories").select("id, name").eq("is_active", true),
        supabase.from("product_categories").select("product_id, category_id").in("product_id", ids).eq("is_primary", true),
        supabase.from("product_variants").select("id, product_id, name, price_cents").in("product_id", ids).eq("is_active", true).order("sort_order"),
        supabase.from("product_images").select("product_id, storage_path, is_primary, sort_order").in("product_id", ids).order("sort_order"),
        supabase.from("reviews").select("product_id, rating").in("product_id", ids).eq("is_approved", true),
        storeIds.length ? supabase.from("seller_stores").select("id, name, slug").in("id", storeIds) : Promise.resolve({ data: [] }),
      ]);
      if (!active) return;

      const categoryNames = new Map((categoriesResult.data ?? []).map((row) => [row.id, row.name]));
      const categoryByProduct = new Map((linksResult.data ?? []).map((row) => [row.product_id, categoryNames.get(row.category_id) ?? "Beauty"]));
      const variantRows = variantsResult.data ?? [];
      const variantIds = variantRows.map((variant) => variant.id);
      const { data: inventoryRows } = variantIds.length ? await supabase.from("inventory_levels").select("variant_id, quantity_on_hand, quantity_reserved").in("variant_id", variantIds) : { data: [] };
      const stockByVariant = new Map<string, number>();
      for (const level of inventoryRows ?? []) stockByVariant.set(level.variant_id, (stockByVariant.get(level.variant_id) ?? 0) + Math.max(0, level.quantity_on_hand - level.quantity_reserved));
      const variantsByProduct = new Map<string, Array<{ id: string; name: string; price: number; stock: number }>>();
      for (const variant of variantRows) variantsByProduct.set(variant.product_id, [...(variantsByProduct.get(variant.product_id) ?? []), { id: variant.id, name: variant.name, price: Number(variant.price_cents ?? 0) / 100, stock: stockByVariant.get(variant.id) ?? 0 }]);
      const imagesByProduct = new Map<string, Array<{ storage_path: string; is_primary: boolean }>>();
      for (const image of imagesResult.data ?? []) imagesByProduct.set(image.product_id, [...(imagesByProduct.get(image.product_id) ?? []), image]);
      const ratings = new Map<string, number[]>();
      for (const review of reviewsResult.data ?? []) ratings.set(review.product_id, [...(ratings.get(review.product_id) ?? []), review.rating]);
      const storeNames = new Map((storesResult.data ?? []).map((store) => [store.id, store.name]));
      const storeSlugs = new Map((storesResult.data ?? []).map((store) => [store.id, store.slug]));

      const liveProducts = rows.map((row) => {
        const productVariants = variantsByProduct.get(row.id) ?? [];
        const variant = productVariants[0];
        const reviewScores = ratings.get(row.id) ?? [];
        const averageRating = reviewScores.length ? reviewScores.reduce((total, rating) => total + rating, 0) / reviewScores.length : null;
        const productImages = [...(imagesByProduct.get(row.id) ?? [])].sort((a, b) => Number(b.is_primary) - Number(a.is_primary));
        const imageUrls = productImages.map((image) => supabase.storage.from("product-images").getPublicUrl(image.storage_path).data.publicUrl);
        const imageUrl = imageUrls[0];
        return {
          id: row.id,
          slug: row.slug,
          name: row.name,
          category: categoryByProduct.get(row.id) ?? "Beauty",
          rating: averageRating === null ? "New" : `${averageRating.toFixed(1)} (${reviewScores.length})`,
          price: variant?.price ?? Number(row.base_price_cents) / 100,
          position: "center",
          description: row.description ?? row.short_description ?? undefined,
          imageUrl,
          imageUrls,
          variantId: variant?.id,
          subtitle: typeof row.attributes?.subtitle === "string" ? row.attributes.subtitle : row.short_description ?? undefined,
          ingredients: row.ingredients ?? undefined,
          usageInstructions: row.usage_instructions ?? undefined,
          shippingInfo: typeof row.attributes?.shipping_info === "string" ? row.attributes.shipping_info : undefined,
          sellerName: row.seller_store_id ? storeNames.get(row.seller_store_id) : "BelGlow",
          sellerStoreId: row.seller_store_id ?? undefined,
          sellerSlug: row.seller_store_id ? storeSlugs.get(row.seller_store_id) : undefined,
          compareAtPrice: row.compare_at_price_cents ? Number(row.compare_at_price_cents) / 100 : undefined,
          stock: productVariants.reduce((total, option) => total + option.stock, 0),
          variants: productVariants,
        } satisfies StoreProduct;
      });
      setCatalogProducts(liveProducts);
    }

    void loadCatalog();
    return () => { active = false; };
  }, [shouldLoadShoppingData]);

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    if (!currentUser || !shouldLoadShoppingData) {
      return () => { active = false; };
    } else {
      const currentUserId = currentUser.id;
      async function hydrateSignedInCart() {
        const savedGuestCart = guestCartRef.current;
        for (const item of savedGuestCart) {
          const product = catalogProducts.find((productItem) => productItem.id === item.productId);
          const targetVariantId = item.variantId ?? product?.variantId;
          if (targetVariantId) await supabase.rpc("add_cart_item", { target_variant_id: targetVariantId, quantity_delta: 1 });
        }
        guestCartRef.current = [];

        const { data: activeCart } = await supabase.from("carts").select("id").eq("user_id", currentUserId).eq("status", "active").maybeSingle();
        if (activeCart) {
          const { data: items } = await supabase.from("cart_items").select("variant_id, quantity").eq("cart_id", activeCart.id);
          const detailsByVariant = new Map(catalogProducts.flatMap((product) => (product.variants ?? []).map((variant) => [variant.id, { productId: product.id, variantId: variant.id, optionName: variant.name, price: variant.price }] as const)));
          const expanded: StoreCartItem[] = [];
          for (const item of items ?? []) {
            const details = detailsByVariant.get(item.variant_id);
            if (details) for (let index = 0; index < item.quantity; index += 1) expanded.push(details);
          }
          if (active) setCart(expanded);
        } else if (active) setCart([]);
      }
      void hydrateSignedInCart();
    }
    return () => { active = false; };
  }, [currentUser, catalogProducts, shouldLoadShoppingData]);

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    if (!currentUser || !shouldLoadShoppingData) {
      return () => { active = false; };
    }

    async function hydrateSignedInWishlist() {
      let { data: wishlist } = await supabase
        .from("wishlists")
        .select("id")
        .eq("user_id", currentUser!.id)
        .eq("is_default", true)
        .maybeSingle();

      if (!wishlist) {
        const result = await supabase.from("wishlists").insert({ user_id: currentUser!.id, name: "Saved products", is_default: true }).select("id").single();
        wishlist = result.data;
      }
      if (!wishlist || !active) return;

      const guestProductIds = guestFavoritesRef.current.filter(isDatabaseId);
      if (guestProductIds.length) {
        await supabase.from("wishlist_items").upsert(
          guestProductIds.map((productId) => ({ wishlist_id: wishlist.id, product_id: productId })),
          { onConflict: "wishlist_id,product_id", ignoreDuplicates: true },
        );
      }

      const { data: items } = await supabase.from("wishlist_items").select("product_id").eq("wishlist_id", wishlist.id);
      if (!active) return;
      guestFavoritesRef.current = [];
      setWishlistId(wishlist.id);
      setFavoriteIds((items ?? []).map((item) => item.product_id));
    }

    void hydrateSignedInWishlist();
    return () => { active = false; };
  }, [currentUser, shouldLoadShoppingData]);

  useEffect(() => {
    if (!currentUser || !shouldLoadShoppingData) return;
    let active = true;
    createClient().from("saved_seller_stores").select("seller_store_id").eq("user_id", currentUser.id).then(({ data }) => {
      if (active) setSavedStoreIds((data ?? []).map((row) => row.seller_store_id));
    });
    return () => { active = false; };
  }, [currentUser, shouldLoadShoppingData]);

  useEffect(() => {
    if (!currentUser || !shouldLoadShoppingData) {
      const resetTimer = window.setTimeout(() => setInterest({}), 0);
      return () => window.clearTimeout(resetTimer);
    }
    let active = true;
    createClient()
      .from("product_interactions")
      .select("product_id, weight")
      .eq("user_id", currentUser.id)
      .not("product_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(500)
      .then(({ data }) => {
        if (!active) return;
        const persistedInterest: Record<string, number> = {};
        for (const interaction of data ?? []) {
          if (!interaction.product_id) continue;
          persistedInterest[interaction.product_id] = (persistedInterest[interaction.product_id] ?? 0) + Number(interaction.weight);
        }
        setInterest(persistedInterest);
      });
    return () => { active = false; };
  }, [currentUser, shouldLoadShoppingData]);

  // Lock page scrolling while a modal or framed panel owns the interaction focus.
  useEffect(() => {
    if (!blockingOverlay) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [blockingOverlay]);

  const recommendations = useMemo(() => {
    const categoryInterest = new Map<string, number>();
    Object.entries(interest).forEach(([id, score]) => {
      const product = catalogProducts.find((item) => item.id === id);
      if (product) categoryInterest.set(product.category, (categoryInterest.get(product.category) ?? 0) + score);
    });

    // Direct views, favorites, and related-category interest all influence ranking.
    return [...catalogProducts].sort((a, b) => {
      const scoreA = (interest[a.id] ?? 0) * 4 + (categoryInterest.get(a.category) ?? 0) * 2 + (favoriteIds.includes(a.id) ? 12 : 0);
      const scoreB = (interest[b.id] ?? 0) * 4 + (categoryInterest.get(b.category) ?? 0) * 2 + (favoriteIds.includes(b.id) ? 12 : 0);
      return scoreB - scoreA || a.id.localeCompare(b.id);
    });
  }, [catalogProducts, favoriteIds, interest]);

  function showNotice(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2200);
  }

  function recordProductInteraction(id: string, interaction: ProductInteraction, weight: number) {
    setInterest((current) => ({ ...current, [id]: Math.max(0, (current[id] ?? 0) + weight) }));
    if (!currentUser || !isDatabaseId(id)) return;
    void createClient().from("product_interactions").insert({
      user_id: currentUser.id,
      product_id: id,
      interaction,
      weight,
      metadata: { source: pathname },
    });
  }

  function trackProduct(id: string) {
    recordProductInteraction(id, "view", 1);
  }

  function openProduct(id: string) {
    trackProduct(id);
    setSelectedProductId(id);
  }

  function toggleFavorite(id: string) {
    const shouldSave = !favoriteIds.includes(id);
    const nextFavorites = shouldSave ? [...favoriteIds, id] : favoriteIds.filter((item) => item !== id);
    setFavoriteIds(nextFavorites);
    if (!currentUser) {
      guestFavoritesRef.current = nextFavorites;
      if (shouldSave) showNotice("Saved for this visit. Sign in to keep it for later.");
    }
    else if (isDatabaseId(id)) void persistWishlistChange(id, shouldSave);
    recordProductInteraction(id, shouldSave ? "favorite" : "unfavorite", shouldSave ? 4 : -4);
  }

  function toggleSavedStore(id: string) {
    if (!currentUser) {
      setAuthOpen(true);
      showNotice("Sign in to save favorite businesses.");
      return;
    }
    const shouldSave = !savedStoreIds.includes(id);
    setSavedStoreIds((current) => shouldSave ? [...current, id] : current.filter((storeId) => storeId !== id));
    const supabase = createClient();
    const request = shouldSave
      ? supabase.from("saved_seller_stores").upsert({ user_id: currentUser.id, seller_store_id: id }, { onConflict: "user_id,seller_store_id" })
      : supabase.from("saved_seller_stores").delete().eq("user_id", currentUser.id).eq("seller_store_id", id);
    void request.then(({ error }) => { if (error) showNotice(error.message); });
  }

  async function persistWishlistChange(productId: string, shouldSave: boolean) {
    if (!currentUser) return;
    const supabase = createClient();
    let targetWishlistId = wishlistId;
    if (!targetWishlistId) {
      const { data } = await supabase.from("wishlists").select("id").eq("user_id", currentUser.id).eq("is_default", true).maybeSingle();
      targetWishlistId = data?.id ?? null;
      if (targetWishlistId) setWishlistId(targetWishlistId);
    }
    if (!targetWishlistId) {
      showNotice("Your saved-products list is still loading. Please try again.");
      return;
    }

    const result = shouldSave
      ? await supabase.from("wishlist_items").upsert({ wishlist_id: targetWishlistId, product_id: productId }, { onConflict: "wishlist_id,product_id", ignoreDuplicates: true })
      : await supabase.from("wishlist_items").delete().eq("wishlist_id", targetWishlistId).eq("product_id", productId);
    if (result.error) showNotice("We couldnâ€™t update your saved products. Please try again.");
  }

  function addToCart(id: string, variantId?: string) {
    const product = catalogProducts.find((item) => item.id === id);
    const option = product?.variants?.find((variant) => variant.id === variantId) ?? product?.variants?.[0];
    const cartItem: StoreCartItem = { productId: id, variantId: variantId ?? option?.id ?? product?.variantId, optionName: option?.name, price: option?.price ?? product?.price };
    setCart((current) => {
      const nextCart = [...current, cartItem];
      if (!currentUser) guestCartRef.current = nextCart;
      return nextCart;
    });
    if (currentUser && cartItem.variantId) {
      void createClient().rpc("add_cart_item", { target_variant_id: cartItem.variantId, quantity_delta: 1 }).then(({ error }) => {
        if (error) showNotice(error.message);
      });
    }
    recordProductInteraction(id, "add_to_cart", 3);
    showNotice("Added to your glow bag");
  }

  function removeFromCart(item: StoreCartItem) {
    setCart((current) => {
      const index = current.findLastIndex((entry) => entry.productId === item.productId && entry.variantId === item.variantId);
      const nextCart = current.filter((_, itemIndex) => itemIndex !== index);
      if (!currentUser) guestCartRef.current = nextCart;
      return nextCart;
    });
    if (currentUser && item.variantId) {
      void createClient().rpc("remove_cart_item", { target_variant_id: item.variantId }).then(({ error }) => {
        if (error) showNotice(error.message);
      });
    }
  }

  function completeAuth(destination: string) {
    setAuthOpen(false);
    showNotice("You’re signed in to BelGlow");
    router.replace(destination);
    router.refresh();
  }

  async function signOut() {
    await createClient().auth.signOut();
    clearPrivateShoppingState();
    setAuthOpen(false);
    setCartOpen(false);
    setWishlistOpen(false);
    setSelectedProductId(null);
    router.replace("/");
  }

  function completeCheckout() {
    guestCartRef.current = [];
    setCart([]);
    setCartOpen(false);
  }

  const value: StoreContextValue = {
    cart, favoriteIds, savedStoreIds, products: catalogProducts, recommendations, userName, userRole, addToCart, toggleFavorite, toggleSavedStore,
    openProduct, trackProduct,
    openCart: () => { if (!shouldLoadShoppingData) router.push("/shop"); setWishlistOpen(false); setCartOpen(true); },
    openWishlist: () => { if (!shouldLoadShoppingData) router.push("/shop"); setCartOpen(false); setWishlistOpen(true); },
    openAuth: () => { setAuthError(""); setAuthOpen(true); },
    completeCheckout,
    signOut,
  };

  return <StoreContext.Provider value={value}>
    <div inert={blockingOverlay ? true : undefined} aria-hidden={blockingOverlay || undefined}>{children}</div>
    {selectedProductId !== null && catalogProducts.find((product) => product.id === selectedProductId) && <ProductPreviewModal product={catalogProducts.find((product) => product.id === selectedProductId)!} onClose={() => setSelectedProductId(null)} onAdd={addToCart} onFavorite={toggleFavorite} favorite={favoriteIds.includes(selectedProductId)} />}
    {cartOpen && <CartDrawer cart={cart} products={catalogProducts} isGuest={!currentUser} onClose={() => setCartOpen(false)} onRemove={removeFromCart} />}
    {wishlistOpen && <SavedProductsPanel favoriteIds={favoriteIds} products={catalogProducts} onClose={() => setWishlistOpen(false)} onRemove={toggleFavorite} onOpen={(id) => { setWishlistOpen(false); openProduct(id); }} />}
    {authOpen && <AuthModal initialError={authError} onClose={() => setAuthOpen(false)} onSuccess={completeAuth} />}
    {notice && <div role="status" className="toast-in fixed bottom-6 left-1/2 z-[100] -translate-x-1/2 rounded-full bg-[#241a1e] px-5 py-3 text-sm font-semibold text-white shadow-xl">{notice}</div>}
  </StoreContext.Provider>;
}

function isDatabaseId(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function useStore() {
  const context = useContext(StoreContext);
  if (!context) throw new Error("useStore must be used inside StoreProvider");
  return context;
}

function CartDrawer({ cart, products, isGuest, onClose, onRemove }: { cart: StoreCartItem[]; products: ReadonlyArray<StoreProduct>; isGuest: boolean; onClose: () => void; onRemove: (item: StoreCartItem) => void }) {
  const total = cart.reduce((sum, item) => sum + (item.price ?? products.find((product) => product.id === item.productId)?.price ?? 0), 0);
  return <FramePanel label="Shopping bag">
    <div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[.2em] text-[#ed4773]">Your glow bag</p><h2 className="mt-1 text-2xl font-black">{cart.length} {cart.length === 1 ? "item" : "items"}</h2></div><button onClick={onClose} aria-label="Close shopping bag" className="rounded-full bg-[#fff1f5] p-2"><X /></button></div>
    <div className="mt-5 flex-1 space-y-3 overflow-auto pr-1">{cart.length === 0 && <EmptyPanel icon={<ShoppingBag />} title="Your bag is ready" text="Add a little glow whenever you're ready." />}{cart.map((item, index) => { const product = products.find((productItem) => productItem.id === item.productId); if (!product) return null; return <PanelProduct key={`${item.productId}-${item.variantId}-${index}`} product={product} detail={item.optionName && item.optionName !== "Default" ? item.optionName : undefined} price={item.price} action={<button onClick={() => onRemove(item)} aria-label={`Remove ${product.name}`} className="rounded-full p-2 hover:bg-[#fff1f5]"><Minus size={17} /></button>} />; })}</div>
    <div className="mt-4 border-t border-[#eee2e5] pt-4">{isGuest && cart.length > 0 && <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900"><strong>Temporary guest cart:</strong> refreshing or closing this tab clears these items and abandons an unfinished checkout.</p>}<div className="flex justify-between text-lg font-black"><span>Total</span><span>BZ${total.toFixed(2)}</span></div>{cart.length > 0 && <Link href="/checkout" onClick={onClose} className="mt-4 block w-full rounded-full bg-[#ef4b74] py-3.5 text-center font-bold text-white">Continue to checkout</Link>}</div>
  </FramePanel>;
}

function SavedProductsPanel({ favoriteIds, products, onClose, onRemove, onOpen }: { favoriteIds: string[]; products: ReadonlyArray<StoreProduct>; onClose: () => void; onRemove: (id: string) => void; onOpen: (id: string) => void }) {
  const savedProducts = products.filter((product) => favoriteIds.includes(product.id));
  return <FramePanel label="Saved products">
    <div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[.2em] text-[#ed4773]">Your wishlist</p><h2 className="mt-1 text-2xl font-black">Saved products</h2></div><button onClick={onClose} aria-label="Close saved products" className="rounded-full bg-[#fff1f5] p-2"><X /></button></div>
    <div className="mt-5 flex-1 space-y-3 overflow-auto pr-1">{savedProducts.length === 0 && <EmptyPanel icon={<Heart />} title="Nothing saved yet" text="Tap a heart on any product to keep it here." />}{savedProducts.map((product) => <PanelProduct key={product.id} product={product} onOpen={() => onOpen(product.id)} action={<button onClick={() => onRemove(product.id)} aria-label={`Remove ${product.name} from saved products`} className="rounded-full p-2 text-[#ed4773] hover:bg-[#fff1f5]"><Heart size={18} fill="#ed4773" /></button>} />)}</div>
  </FramePanel>;
}

function FramePanel({ children, label }: { children: ReactNode; label: string }) {
  return <div className="fixed inset-0 z-[90] bg-[#211a1d]/20 backdrop-blur-[1px]"><aside role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} autoFocus className="frame-panel absolute flex flex-col rounded-[24px] border border-[#f0dfe4] bg-white p-5 shadow-[0_24px_70px_rgba(71,31,43,.22)] sm:p-6">{children}</aside></div>;
}

function PanelProduct({ product, action, onOpen, detail, price }: { product: StoreProduct; action: ReactNode; onOpen?: () => void; detail?: string; price?: number }) {
  return <div className="flex items-center gap-3 rounded-2xl border border-[#eee2e5] p-3"><button onClick={onOpen} disabled={!onOpen} className="relative h-18 w-18 shrink-0 overflow-hidden rounded-xl bg-[#fff0f4] disabled:cursor-default"><Image src={product.imageUrl ?? "/images/belglow-hero-products.png"} alt="" fill sizes="72px" className="scale-[2] object-cover" style={{ objectPosition: product.position }} /></button><button onClick={onOpen} disabled={!onOpen} className="min-w-0 flex-1 text-left disabled:cursor-default"><p className="truncate text-sm font-bold">{product.name}</p>{detail && <p className="mt-0.5 text-xs text-[#8b7d82]">{detail}</p>}<p className="mt-1 text-sm text-[#786d71]">BZ${(price ?? product.price).toFixed(2)}</p></button>{action}</div>;
}

function EmptyPanel({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return <div className="grid min-h-52 place-items-center rounded-2xl bg-[#fff6f8] p-7 text-center text-[#74696d]"><div><span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-white text-[#ed4773]">{icon}</span><p className="mt-4 font-bold text-[#35292e]">{title}</p><p className="mt-1 text-sm">{text}</p></div></div>;
}

function AuthModal({ initialError, onClose, onSuccess }: { initialError: string; onClose: () => void; onSuccess: (destination: string) => void }) {
  const [mode, setMode] = useState<"signup" | "signin" | "recovery">("signin");
  const [role, setRole] = useState<Exclude<AccountRole, "admin">>("shopper");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialError);
  const [sent, setSent] = useState(false);
  const [availableProviders, setAvailableProviders] = useState<typeof socialProviders>([]);

  useEffect(() => {
    let active = true;
    async function loadProviders() {
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings`, {
          headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY! },
        });
        if (!response.ok) return;
        const settings = await response.json() as { external?: Partial<Record<SocialProvider, boolean>> };
        if (active) setAvailableProviders(socialProviders.filter((provider) => provider.enabled && settings.external?.[provider.id] === true));
      } catch {
        // Email/password remains available when provider discovery is offline.
      }
    }
    void loadProviders();
    return () => { active = false; };
  }, []);

  function destination() {
    return mode === "signup" && role === "seller" ? "/seller-application" : "/account";
  }

  async function submitEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const email = String(data.get("email") ?? "").trim();
    const password = String(data.get("password") ?? "");
    const supabase = createClient();
    setBusy(true);
    setError("");

    try {
      if (mode === "signup") {
        const fullName = String(data.get("name") ?? "").trim();
        const { data: result, error: authError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName, intended_role: role },
            emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(destination())}`,
          },
        });
        if (authError) throw authError;
        if (result.session) onSuccess(destination());
        else setSent(true);
      } else {
        const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
        if (authError) throw authError;
        // Let the server resolve the newly authenticated account to its
        // authorized destination (admin, approved seller, or shopper).
        onSuccess("/account");
      }
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : "Unable to authenticate. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function signInWithProvider(provider: SocialProvider) {
    setBusy(true);
    setError("");
    const { error: authError } = await createClient().auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(destination())}` },
    });
    if (authError) {
      setError(authError.message);
      setBusy(false);
    }
  }

  async function sendRecoveryEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const email = String(data.get("email") ?? "").trim();
    setBusy(true);
    setError("");
    const { error: authError } = await createClient().auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/update-password`,
    });
    if (authError) setError(authError.message);
    else setSent(true);
    setBusy(false);
  }

  return <ModalShell label="BelGlow account" onClose={onClose}>
    <div className="relative mx-auto w-full max-w-[520px] rounded-[28px] bg-white p-7 shadow-2xl sm:p-9">
      <button onClick={onClose} aria-label="Close account dialog" className="absolute right-5 top-5 rounded-full bg-[#fff1f5] p-2"><X size={20} /></button>
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#fff0f4] text-[#ed4773]"><Sparkles /></div>
      <h2 className="mt-5 text-3xl font-black tracking-[-.04em]">{mode === "signup" ? "Join BelGlow" : mode === "recovery" ? "Reset your password" : "Welcome back"}</h2>
      <p className="mt-2 text-sm leading-6 text-[#75696e]">Shop beautiful essentials or grow your own beauty business in the BelGlow marketplace.</p>
      {sent ? <div className="mt-7 rounded-2xl bg-[#effbf4] p-5 text-sm leading-6 text-[#23643c]" role="status">Check your email for the next step. If you already have an account, you can sign in instead.</div> : <>
        {mode === "signup" && <div className="mt-5 grid grid-cols-2 gap-2 rounded-2xl bg-[#fff5f7] p-1.5" aria-label="Choose account type"><button type="button" onClick={() => setRole("shopper")} aria-pressed={role === "shopper"} className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-bold ${role === "shopper" ? "bg-white text-[#df3765] shadow-sm" : "text-[#776a6f]"}`}><UserRound size={16} /> I want to shop</button><button type="button" onClick={() => setRole("seller")} aria-pressed={role === "seller"} className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-bold ${role === "seller" ? "bg-white text-[#df3765] shadow-sm" : "text-[#776a6f]"}`}><Store size={16} /> I want to sell</button></div>}
        {mode !== "recovery" && availableProviders.length > 0 && <div className="mt-5 space-y-2">{availableProviders.map((provider) => <button key={provider.id} type="button" disabled={busy} onClick={() => void signInWithProvider(provider.id)} className="flex w-full items-center justify-center gap-3 rounded-full border border-[#ddd2d6] py-3.5 font-bold transition hover:bg-[#fff8fa] disabled:opacity-50"><SocialProviderIcon provider={provider.id} /> Continue with {provider.label}</button>)}</div>}
        {mode !== "recovery" && availableProviders.length > 0 && <div className="my-5 flex items-center gap-3 text-xs text-[#9a8f93]"><span className="h-px flex-1 bg-[#eadfe2]" />or use email<span className="h-px flex-1 bg-[#eadfe2]" /></div>}
        <form onSubmit={mode === "recovery" ? sendRecoveryEmail : submitEmail} className="mt-4 space-y-3">
          {mode === "signup" && <label className="block text-xs font-bold text-[#5f5358]">Full name<input name="name" required placeholder="Your name or business" className="mt-1.5 h-12 w-full rounded-xl border border-[#e7dade] px-4 font-normal outline-none focus:border-[#ef4b74]" /></label>}
          <label className="block text-xs font-bold text-[#5f5358]">Email address<div className="relative mt-1.5"><Mail className="absolute left-4 top-3.5 text-[#a79ba0]" size={18} /><input name="email" type="email" required placeholder="you@example.com" className="h-12 w-full rounded-xl border border-[#e7dade] pl-11 pr-4 font-normal outline-none focus:border-[#ef4b74]" /></div></label>
          {mode !== "recovery" && <label className="block text-xs font-bold text-[#5f5358]">Password<input name="password" type="password" required minLength={8} autoComplete={mode === "signup" ? "new-password" : "current-password"} placeholder="At least 8 characters" className="mt-1.5 h-12 w-full rounded-xl border border-[#e7dade] px-4 font-normal outline-none focus:border-[#ef4b74]" /></label>}
          {error && <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
          <button disabled={busy} className="mt-2 w-full rounded-full bg-[#ef4b74] py-3.5 font-bold text-white hover:bg-[#dc3764] disabled:opacity-50">{busy ? "Please wait…" : mode === "signup" ? "Create account" : mode === "recovery" ? "Send recovery email" : "Sign in"}</button>
        </form>
        {mode === "signin" && <button onClick={() => { setMode("recovery"); setError(""); }} className="mt-4 w-full text-center text-xs font-bold text-[#df3765] underline">Forgot password?</button>}
        <p className="mt-5 text-center text-sm text-[#75696e]">{mode === "signup" ? "Already have an account?" : mode === "recovery" ? "Remember your password?" : "New to BelGlow?"} <button onClick={() => { setMode(mode === "signup" ? "signin" : "signup"); setSent(false); setError(""); }} className="font-bold text-[#df3765]">{mode === "signup" || mode === "recovery" ? "Sign in" : "Create one"}</button></p>
      </>}
    </div>
  </ModalShell>;
}

function SocialProviderIcon({ provider }: { provider: SocialProvider }) {
  if (provider === "google") return <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5"><path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.06H12v3.9h5.38a4.6 4.6 0 0 1-2 3.02v2.53h3.24c1.9-1.75 2.98-4.33 2.98-7.39Z"/><path fill="#34A853" d="M12 22c2.7 0 4.97-.9 6.63-2.38l-3.24-2.53c-.9.6-2.05.96-3.39.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.61A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.39 13.92A6.01 6.01 0 0 1 6.07 12c0-.67.12-1.32.32-1.92V7.47H3.04A10 10 0 0 0 2 12c0 1.61.39 3.14 1.04 4.53l3.35-2.61Z"/><path fill="#EA4335" d="M12 5.95c1.47 0 2.79.5 3.83 1.5l2.87-2.87A9.62 9.62 0 0 0 12 2a10 10 0 0 0-8.96 5.47l3.35 2.61C7.18 7.71 9.39 5.95 12 5.95Z"/></svg>;
  if (provider === "apple") return <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5 fill-current"><path d="M16.7 12.9c0-2.4 2-3.6 2.1-3.7a4.5 4.5 0 0 0-3.5-1.9c-1.5-.2-2.9.9-3.7.9-.8 0-2-.9-3.3-.9a4.9 4.9 0 0 0-4.1 2.5c-1.8 3-.5 7.6 1.2 10.1.9 1.2 1.9 2.6 3.2 2.5 1.3-.1 1.8-.8 3.4-.8 1.5 0 2 .8 3.4.8s2.3-1.2 3.1-2.5a11 11 0 0 0 1.4-2.8 4.2 4.2 0 0 1-3.2-4.2ZM14.3 5.8A4.4 4.4 0 0 0 15.4 2a4.5 4.5 0 0 0-3 1.5 4.1 4.1 0 0 0-1.1 3.7 3.7 3.7 0 0 0 3-1.4Z"/></svg>;
  return <span aria-hidden className="grid h-5 w-5 place-items-center rounded-full bg-[#1877f2] text-sm font-black text-white">f</span>;
}

function ModalShell({ children, label, onClose, wide = false }: { children: ReactNode; label: string; onClose: () => void; wide?: boolean }) {
  return <div className="fixed inset-0 z-[90] grid place-items-center overflow-y-auto bg-[#211a1d]/45 p-2 backdrop-blur-sm sm:p-4" role="dialog" aria-modal="true" aria-label={label} onMouseDown={onClose}><div className={`flex w-full justify-center ${wide ? "max-w-7xl" : "max-w-4xl"}`} onMouseDown={(event) => event.stopPropagation()}>{children}</div></div>;
}
