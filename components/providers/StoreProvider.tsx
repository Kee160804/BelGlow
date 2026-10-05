"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, ReactNode, createContext, useContext, useEffect, useMemo, useState } from "react";
import { Heart, Mail, Minus, ShoppingBag, Sparkles, Store, UserRound, X } from "lucide-react";
import { products, type StoreProduct } from "@/lib/catalog";
import { createClient } from "@/utils/supabase/client";

type AccountRole = "shopper" | "seller" | "admin";

type StoreUser = {
  id: string;
  name: string;
  email: string;
  role: AccountRole;
};

type StoreContextValue = {
  cart: string[];
  favoriteIds: string[];
  products: ReadonlyArray<StoreProduct>;
  recommendations: ReadonlyArray<StoreProduct>;
  userName: string | null;
  userRole: AccountRole | null;
  addToCart: (id: string) => void;
  toggleFavorite: (id: string) => void;
  openProduct: (id: string) => void;
  trackProduct: (id: string) => void;
  openCart: () => void;
  openWishlist: () => void;
  openAuth: () => void;
  signOut: () => void;
};

const StoreContext = createContext<StoreContextValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [cart, setCart] = useState<string[]>([]);
  const [cartLoaded, setCartLoaded] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [favoritesLoaded, setFavoritesLoaded] = useState(false);
  const [catalogProducts, setCatalogProducts] = useState<StoreProduct[]>(products);
  const [interest, setInterest] = useState<Record<string, number>>({});
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [wishlistOpen, setWishlistOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<StoreUser | null>(null);
  const [notice, setNotice] = useState("");
  const userName = currentUser?.name ?? null;
  const userRole = currentUser?.role ?? null;
  const blockingOverlay = selectedProductId !== null || cartOpen || wishlistOpen || authOpen;

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    async function loadProfile(userId: string, email: string, metadata: Record<string, unknown>) {
      const [{ data }, { data: hasAdminAccess }] = await Promise.all([
        supabase.from("profiles").select("role, full_name").eq("id", userId).maybeSingle(),
        supabase.rpc("is_admin"),
      ]);
      if (!active) return;
      const role = hasAdminAccess || data?.role === "admin" || data?.role === "staff" ? "admin" : data?.role === "seller" ? "seller" : "shopper";
      const metadataName = typeof metadata.full_name === "string" ? metadata.full_name : typeof metadata.name === "string" ? metadata.name : "";
      setCurrentUser({ id: userId, name: data?.full_name || metadataName || email.split("@")[0], email, role });
    }

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        if (active) setCurrentUser(null);
        return;
      }
      void loadProfile(user.id, user.email ?? "", user.user_metadata ?? {});
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        setCurrentUser(null);
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
    const supabase = createClient();
    let active = true;

    async function loadCatalog() {
      const { data: rows, error } = await supabase.from("products")
        .select("id, slug, name, short_description, base_price_cents")
        .eq("status", "active")
        .order("created_at", { ascending: false });
      if (error || !rows?.length || !active) return;

      const ids = rows.map((row) => row.id);
      const [categoriesResult, linksResult, variantsResult, imagesResult, reviewsResult] = await Promise.all([
        supabase.from("categories").select("id, name").eq("is_active", true),
        supabase.from("product_categories").select("product_id, category_id").in("product_id", ids).eq("is_primary", true),
        supabase.from("product_variants").select("id, product_id, price_cents").in("product_id", ids).eq("is_active", true).order("sort_order"),
        supabase.from("product_images").select("product_id, storage_path").in("product_id", ids).eq("is_primary", true),
        supabase.from("reviews").select("product_id, rating").in("product_id", ids).eq("is_approved", true),
      ]);
      if (!active) return;

      const categoryNames = new Map((categoriesResult.data ?? []).map((row) => [row.id, row.name]));
      const categoryByProduct = new Map((linksResult.data ?? []).map((row) => [row.product_id, categoryNames.get(row.category_id) ?? "Beauty"]));
      const variantByProduct = new Map<string, { id: string; price_cents: number | null }>();
      for (const variant of variantsResult.data ?? []) if (!variantByProduct.has(variant.product_id)) variantByProduct.set(variant.product_id, variant);
      const imageByProduct = new Map((imagesResult.data ?? []).map((row) => [row.product_id, row.storage_path]));
      const ratings = new Map<string, number[]>();
      for (const review of reviewsResult.data ?? []) ratings.set(review.product_id, [...(ratings.get(review.product_id) ?? []), review.rating]);

      const liveProducts = rows.map((row) => {
        const variant = variantByProduct.get(row.id);
        const reviewScores = ratings.get(row.id) ?? [];
        const averageRating = reviewScores.length ? reviewScores.reduce((total, rating) => total + rating, 0) / reviewScores.length : null;
        const imagePath = imageByProduct.get(row.id);
        const imageUrl = imagePath ? supabase.storage.from("product-images").getPublicUrl(imagePath).data.publicUrl : undefined;
        return {
          id: row.id,
          slug: row.slug,
          name: row.name,
          category: categoryByProduct.get(row.id) ?? "Beauty",
          rating: averageRating === null ? "New" : `${averageRating.toFixed(1)} (${reviewScores.length})`,
          price: Number(variant?.price_cents ?? row.base_price_cents) / 100,
          position: "center",
          description: row.short_description ?? undefined,
          imageUrl,
          variantId: variant?.id,
        } satisfies StoreProduct;
      });
      setCatalogProducts(liveProducts);
    }

    void loadCatalog();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const supabase = createClient();
    let active = true;
    let timer: number | undefined;

    if (!currentUser) {
      timer = window.setTimeout(() => {
        try {
          const saved: unknown = JSON.parse(window.localStorage.getItem("belglow-cart") ?? "[]");
          if (active && Array.isArray(saved)) setCart(saved.filter((id): id is string => typeof id === "string"));
        } catch {
          window.localStorage.removeItem("belglow-cart");
        }
        if (active) setCartLoaded(true);
      }, 0);
    } else {
      const currentUserId = currentUser.id;
      async function hydrateSignedInCart() {
        const savedGuestCart: string[] = (() => {
          try {
            const saved: unknown = JSON.parse(window.localStorage.getItem("belglow-cart") ?? "[]");
            return Array.isArray(saved) ? saved.filter((id): id is string => typeof id === "string") : [];
          } catch { return []; }
        })();
        for (const id of savedGuestCart) {
          const product = catalogProducts.find((item) => item.id === id);
          if (product?.variantId) await supabase.rpc("add_cart_item", { target_variant_id: product.variantId, quantity_delta: 1 });
        }
        window.localStorage.removeItem("belglow-cart");

        const { data: activeCart } = await supabase.from("carts").select("id").eq("user_id", currentUserId).eq("status", "active").maybeSingle();
        if (activeCart) {
          const { data: items } = await supabase.from("cart_items").select("variant_id, quantity").eq("cart_id", activeCart.id);
          const idByVariant = new Map(catalogProducts.filter((product) => product.variantId).map((product) => [product.variantId!, product.id]));
          const expanded = (items ?? []).flatMap((item) => Array.from({ length: item.quantity }, () => idByVariant.get(item.variant_id)).filter((id): id is string => Boolean(id)));
          if (active) setCart(expanded);
        } else if (active) setCart([]);
        if (active) setCartLoaded(true);
      }
      void hydrateSignedInCart();
    }
    return () => {
      active = false;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [currentUser, catalogProducts]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved: unknown = JSON.parse(window.localStorage.getItem("belglow-favorites") ?? "[]");
        if (Array.isArray(saved)) setFavoriteIds(saved.filter((id): id is string => typeof id === "string"));
      }
      catch { window.localStorage.removeItem("belglow-favorites"); }
      setFavoritesLoaded(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!cartLoaded) return;
    if (!currentUser) window.localStorage.setItem("belglow-cart", JSON.stringify(cart));
  }, [cart, cartLoaded, currentUser]);

  useEffect(() => { if (favoritesLoaded) window.localStorage.setItem("belglow-favorites", JSON.stringify(favoriteIds)); }, [favoriteIds, favoritesLoaded]);

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

  function trackProduct(id: string) {
    setInterest((current) => ({ ...current, [id]: (current[id] ?? 0) + 1 }));
  }

  function openProduct(id: string) {
    trackProduct(id);
    setSelectedProductId(id);
  }

  function toggleFavorite(id: string) {
    setFavoriteIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
    trackProduct(id);
  }

  function addToCart(id: string) {
    setCart((current) => [...current, id]);
    const product = catalogProducts.find((item) => item.id === id);
    if (currentUser && product?.variantId) {
      void createClient().rpc("add_cart_item", { target_variant_id: product.variantId, quantity_delta: 1 }).then(({ error }) => {
        if (error) showNotice(error.message);
      });
    }
    trackProduct(id);
    showNotice("Added to your glow bag");
  }

  function removeFromCart(id: string) {
    const product = catalogProducts.find((item) => item.id === id);
    setCart((current) => {
      const index = current.lastIndexOf(id);
      return current.filter((_, itemIndex) => itemIndex !== index);
    });
    if (currentUser && product?.variantId) {
      void createClient().rpc("remove_cart_item", { target_variant_id: product.variantId }).then(({ error }) => {
        if (error) showNotice(error.message);
      });
    }
  }

  function completeAuth(destination: string) {
    setAuthOpen(false);
    showNotice("You’re signed in to BelGlow");
    router.push(destination);
  }

  async function signOut() {
    await createClient().auth.signOut();
    setAuthOpen(false);
    setCartOpen(false);
    setWishlistOpen(false);
    setSelectedProductId(null);
    router.replace("/");
  }

  const value: StoreContextValue = {
    cart, favoriteIds, products: catalogProducts, recommendations, userName, userRole, addToCart, toggleFavorite,
    openProduct, trackProduct,
    openCart: () => { setWishlistOpen(false); setCartOpen(true); },
    openWishlist: () => { setCartOpen(false); setWishlistOpen(true); },
    openAuth: () => setAuthOpen(true),
    signOut,
  };

  return <StoreContext.Provider value={value}>
    <div inert={blockingOverlay ? true : undefined} aria-hidden={blockingOverlay || undefined}>{children}</div>
    {selectedProductId !== null && <ProductPreview productId={selectedProductId} onClose={() => setSelectedProductId(null)} onAdd={addToCart} onFavorite={toggleFavorite} favorite={favoriteIds.includes(selectedProductId)} />}
    {cartOpen && <CartDrawer cart={cart} products={catalogProducts} onClose={() => setCartOpen(false)} onRemove={removeFromCart} />}
    {wishlistOpen && <SavedProductsPanel favoriteIds={favoriteIds} products={catalogProducts} onClose={() => setWishlistOpen(false)} onRemove={toggleFavorite} onOpen={(id) => { setWishlistOpen(false); openProduct(id); }} />}
    {authOpen && <AuthModal onClose={() => setAuthOpen(false)} onSuccess={completeAuth} />}
    {notice && <div role="status" className="toast-in fixed bottom-6 left-1/2 z-[100] -translate-x-1/2 rounded-full bg-[#241a1e] px-5 py-3 text-sm font-semibold text-white shadow-xl">{notice}</div>}
  </StoreContext.Provider>;
}

export function useStore() {
  const context = useContext(StoreContext);
  if (!context) throw new Error("useStore must be used inside StoreProvider");
  return context;
}

function ProductPreview({ productId, onClose, onAdd, onFavorite, favorite }: { productId: string; onClose: () => void; onAdd: (id: string) => void; onFavorite: (id: string) => void; favorite: boolean }) {
  const product = products.find((item) => item.id === productId);
  if (!product) return null;
  return <ModalShell label={`${product.name} details`} onClose={onClose}>
    <div className="grid overflow-hidden rounded-[28px] bg-white sm:grid-cols-[.9fr_1fr]">
      <div className="relative min-h-[300px] bg-[#fff0f4] sm:min-h-[460px]"><Image src={product.imageUrl ?? "/images/belglow-hero-products.png"} unoptimized={Boolean(product.imageUrl)} alt={product.name} fill sizes="(max-width: 640px) 100vw, 45vw" className="scale-[1.7] object-cover" style={{ objectPosition: product.position }} /></div>
      <div className="flex flex-col p-7 sm:p-9"><div className="flex justify-between gap-4"><p className="text-xs font-bold uppercase tracking-[.18em] text-[#ed4773]">{product.category}</p><button onClick={onClose} aria-label="Close product details"><X /></button></div><h2 className="mt-4 text-3xl font-black tracking-[-.04em]">{product.name}</h2><p className="mt-3 text-sm text-[#74696d]">★ {product.rating}</p><p className="mt-5 leading-7 text-[#65595e]">{product.description || "A nurturing BelGlow essential selected to make your daily beauty and self-care routine feel simple, joyful, and radiant."}</p><p className="mt-6 text-2xl font-black">BZ${product.price.toFixed(2)}</p><div className="mt-auto grid grid-cols-[auto_1fr] gap-3 pt-8"><button onClick={() => onFavorite(product.id)} aria-label={favorite ? "Remove from wishlist" : "Save to wishlist"} className="grid h-13 w-13 place-items-center rounded-full border border-[#eacfd7] text-[#ed4773]"><Heart fill={favorite ? "#ed4773" : "none"} /></button><button onClick={() => onAdd(product.id)} className="flex items-center justify-center gap-2 rounded-full bg-[#ef4b74] px-6 font-bold text-white"><ShoppingBag size={19} /> Add to cart</button></div></div>
    </div>
  </ModalShell>;
}

function CartDrawer({ cart, products, onClose, onRemove }: { cart: string[]; products: ReadonlyArray<StoreProduct>; onClose: () => void; onRemove: (id: string) => void }) {
  const total = cart.reduce((sum, id) => sum + (products.find((product) => product.id === id)?.price ?? 0), 0);
  return <FramePanel label="Shopping bag">
    <div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[.2em] text-[#ed4773]">Your glow bag</p><h2 className="mt-1 text-2xl font-black">{cart.length} {cart.length === 1 ? "item" : "items"}</h2></div><button onClick={onClose} aria-label="Close shopping bag" className="rounded-full bg-[#fff1f5] p-2"><X /></button></div>
    <div className="mt-5 flex-1 space-y-3 overflow-auto pr-1">{cart.length === 0 && <EmptyPanel icon={<ShoppingBag />} title="Your bag is ready" text="Add a little glow whenever you're ready." />}{cart.map((id, index) => { const product = products.find((item) => item.id === id); if (!product) return null; return <PanelProduct key={`${id}-${index}`} product={product} action={<button onClick={() => onRemove(id)} aria-label={`Remove ${product.name}`} className="rounded-full p-2 hover:bg-[#fff1f5]"><Minus size={17} /></button>} />; })}</div>
    <div className="mt-4 border-t border-[#eee2e5] pt-4"><div className="flex justify-between text-lg font-black"><span>Total</span><span>BZ${total.toFixed(2)}</span></div>{cart.length > 0 && <Link href="/checkout" onClick={onClose} className="mt-4 block w-full rounded-full bg-[#ef4b74] py-3.5 text-center font-bold text-white">Continue to checkout</Link>}</div>
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

function PanelProduct({ product, action, onOpen }: { product: StoreProduct; action: ReactNode; onOpen?: () => void }) {
  return <div className="flex items-center gap-3 rounded-2xl border border-[#eee2e5] p-3"><button onClick={onOpen} disabled={!onOpen} className="relative h-18 w-18 shrink-0 overflow-hidden rounded-xl bg-[#fff0f4] disabled:cursor-default"><Image src={product.imageUrl ?? "/images/belglow-hero-products.png"} unoptimized={Boolean(product.imageUrl)} alt="" fill sizes="72px" className="scale-[2] object-cover" style={{ objectPosition: product.position }} /></button><button onClick={onOpen} disabled={!onOpen} className="min-w-0 flex-1 text-left disabled:cursor-default"><p className="truncate text-sm font-bold">{product.name}</p><p className="mt-1 text-sm text-[#786d71]">BZ${product.price.toFixed(2)}</p></button>{action}</div>;
}

function EmptyPanel({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return <div className="grid min-h-52 place-items-center rounded-2xl bg-[#fff6f8] p-7 text-center text-[#74696d]"><div><span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-white text-[#ed4773]">{icon}</span><p className="mt-4 font-bold text-[#35292e]">{title}</p><p className="mt-1 text-sm">{text}</p></div></div>;
}

function AuthModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: (destination: string) => void }) {
  const [mode, setMode] = useState<"signup" | "signin" | "recovery">("signin");
  const [role, setRole] = useState<Exclude<AccountRole, "admin">>("shopper");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  function destination() {
    return mode === "signup" && role === "seller" ? "/seller-application" : "/shop";
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
        onSuccess("/shop");
      }
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : "Unable to authenticate. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function signInWithGoogle() {
    setBusy(true);
    setError("");
    const { error: authError } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent("/shop")}` },
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
        <div className="my-5 flex items-center gap-3 text-xs text-[#9a8f93]"><span className="h-px flex-1 bg-[#eadfe2]" />or continue with<span className="h-px flex-1 bg-[#eadfe2]" /></div>
        <button type="button" disabled={busy} onClick={signInWithGoogle} className="flex w-full items-center justify-center gap-3 rounded-full border border-[#ddd2d6] py-3.5 font-bold transition hover:bg-[#fff8fa] disabled:opacity-50"><span className="text-lg font-black text-[#4285f4]">G</span> Continue with Google</button>
        <form onSubmit={mode === "recovery" ? sendRecoveryEmail : submitEmail} className="mt-4 space-y-3">
          {mode === "signup" && <><div className="grid grid-cols-2 gap-2 rounded-2xl bg-[#fff5f7] p-1.5" aria-label="Choose account type"><button type="button" onClick={() => setRole("shopper")} aria-pressed={role === "shopper"} className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-bold ${role === "shopper" ? "bg-white text-[#df3765] shadow-sm" : "text-[#776a6f]"}`}><UserRound size={16} /> I want to shop</button><button type="button" onClick={() => setRole("seller")} aria-pressed={role === "seller"} className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-bold ${role === "seller" ? "bg-white text-[#df3765] shadow-sm" : "text-[#776a6f]"}`}><Store size={16} /> I want to sell</button></div><label className="block text-xs font-bold text-[#5f5358]">Full name<input name="name" required placeholder="Your name or business" className="mt-1.5 h-12 w-full rounded-xl border border-[#e7dade] px-4 font-normal outline-none focus:border-[#ef4b74]" /></label></>}
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

function ModalShell({ children, label, onClose }: { children: ReactNode; label: string; onClose: () => void }) {
  return <div className="fixed inset-0 z-[90] grid place-items-center overflow-y-auto bg-[#211a1d]/45 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={label} onMouseDown={onClose}><div className="flex w-full max-w-4xl justify-center" onMouseDown={(event) => event.stopPropagation()}>{children}</div></div>;
}
