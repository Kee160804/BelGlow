"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { FormEvent, ReactNode, createContext, useContext, useEffect, useMemo, useState } from "react";
import { Check, Heart, Mail, Minus, ShieldCheck, ShoppingBag, Sparkles, Store, UserRound, X } from "lucide-react";
import { products } from "@/lib/catalog";

type AccountRole = "shopper" | "seller" | "admin";

type DemoUser = {
  name: string;
  email: string;
  role: AccountRole;
};

type StoreContextValue = {
  cart: number[];
  favoriteIds: number[];
  recommendations: ReadonlyArray<(typeof products)[number]>;
  userName: string | null;
  userRole: AccountRole | null;
  addToCart: (id: number) => void;
  toggleFavorite: (id: number) => void;
  openProduct: (id: number) => void;
  trackProduct: (id: number) => void;
  openCart: () => void;
  openWishlist: () => void;
  openAuth: () => void;
  signOut: () => void;
};

const StoreContext = createContext<StoreContextValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [cart, setCart] = useState<number[]>([1, 4]);
  const [favoriteIds, setFavoriteIds] = useState<number[]>([]);
  const [interest, setInterest] = useState<Record<number, number>>({});
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [wishlistOpen, setWishlistOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<DemoUser | null>(null);
  const [notice, setNotice] = useState("");
  const userName = currentUser?.name ?? null;
  const userRole = currentUser?.role ?? null;
  const blockingOverlay = selectedProductId !== null || cartOpen || wishlistOpen || authOpen;

  useEffect(() => {
    const savedUser = window.localStorage.getItem("belglow-demo-user");
    if (!savedUser) return;
    try {
      const parsedUser = JSON.parse(savedUser) as DemoUser;
      const restoreSession = window.setTimeout(() => setCurrentUser(parsedUser), 0);
      return () => window.clearTimeout(restoreSession);
    } catch {
      window.localStorage.removeItem("belglow-demo-user");
    }
  }, []);

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
      const product = products.find((item) => item.id === Number(id));
      if (product) categoryInterest.set(product.category, (categoryInterest.get(product.category) ?? 0) + score);
    });

    // Direct views, favorites, and related-category interest all influence ranking.
    return [...products].sort((a, b) => {
      const scoreA = (interest[a.id] ?? 0) * 4 + (categoryInterest.get(a.category) ?? 0) * 2 + (favoriteIds.includes(a.id) ? 12 : 0);
      const scoreB = (interest[b.id] ?? 0) * 4 + (categoryInterest.get(b.category) ?? 0) * 2 + (favoriteIds.includes(b.id) ? 12 : 0);
      return scoreB - scoreA || a.id - b.id;
    });
  }, [favoriteIds, interest]);

  function showNotice(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2200);
  }

  function trackProduct(id: number) {
    setInterest((current) => ({ ...current, [id]: (current[id] ?? 0) + 1 }));
  }

  function openProduct(id: number) {
    trackProduct(id);
    setSelectedProductId(id);
  }

  function toggleFavorite(id: number) {
    setFavoriteIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
    trackProduct(id);
  }

  function addToCart(id: number) {
    setCart((current) => [...current, id]);
    trackProduct(id);
    showNotice("Added to your glow bag");
  }

  function completeAuth(user: DemoUser) {
    setCurrentUser(user);
    window.localStorage.setItem("belglow-demo-user", JSON.stringify(user));
    setAuthOpen(false);
    showNotice(`Welcome to BelGlow, ${user.name}`);
    if (user.role === "admin") router.push("/admin");
    else if (user.role === "seller") router.push("/dashboard");
    else router.push("/account");
  }

  function signOut() {
    setCurrentUser(null);
    window.localStorage.removeItem("belglow-demo-user");
    setAuthOpen(false);
    setCartOpen(false);
    setWishlistOpen(false);
    setSelectedProductId(null);
    router.replace("/");
  }

  const value: StoreContextValue = {
    cart, favoriteIds, recommendations, userName, userRole, addToCart, toggleFavorite,
    openProduct, trackProduct,
    openCart: () => { setWishlistOpen(false); setCartOpen(true); },
    openWishlist: () => { setCartOpen(false); setWishlistOpen(true); },
    openAuth: () => setAuthOpen(true),
    signOut,
  };

  return <StoreContext.Provider value={value}>
    <div inert={blockingOverlay ? true : undefined} aria-hidden={blockingOverlay || undefined}>{children}</div>
    {selectedProductId !== null && <ProductPreview productId={selectedProductId} onClose={() => setSelectedProductId(null)} onAdd={addToCart} onFavorite={toggleFavorite} favorite={favoriteIds.includes(selectedProductId)} />}
    {cartOpen && <CartDrawer cart={cart} onClose={() => setCartOpen(false)} onRemove={(id) => setCart((current) => { const index = current.lastIndexOf(id); return current.filter((_, itemIndex) => itemIndex !== index); })} />}
    {wishlistOpen && <SavedProductsPanel favoriteIds={favoriteIds} onClose={() => setWishlistOpen(false)} onRemove={toggleFavorite} onOpen={(id) => { setWishlistOpen(false); openProduct(id); }} />}
    {authOpen && <AuthModal onClose={() => setAuthOpen(false)} onComplete={completeAuth} />}
    {notice && <div role="status" className="toast-in fixed bottom-6 left-1/2 z-[100] -translate-x-1/2 rounded-full bg-[#241a1e] px-5 py-3 text-sm font-semibold text-white shadow-xl">{notice}</div>}
  </StoreContext.Provider>;
}

export function useStore() {
  const context = useContext(StoreContext);
  if (!context) throw new Error("useStore must be used inside StoreProvider");
  return context;
}

function ProductPreview({ productId, onClose, onAdd, onFavorite, favorite }: { productId: number; onClose: () => void; onAdd: (id: number) => void; onFavorite: (id: number) => void; favorite: boolean }) {
  const product = products.find((item) => item.id === productId)!;
  return <ModalShell label={`${product.name} details`} onClose={onClose}>
    <div className="grid overflow-hidden rounded-[28px] bg-white sm:grid-cols-[.9fr_1fr]">
      <div className="relative min-h-[300px] bg-[#fff0f4] sm:min-h-[460px]"><Image src="/images/belglow-hero-products.png" alt={product.name} fill sizes="(max-width: 640px) 100vw, 45vw" className="scale-[1.7] object-cover" style={{ objectPosition: product.position }} /></div>
      <div className="flex flex-col p-7 sm:p-9"><div className="flex justify-between gap-4"><p className="text-xs font-bold uppercase tracking-[.18em] text-[#ed4773]">{product.category}</p><button onClick={onClose} aria-label="Close product details"><X /></button></div><h2 className="mt-4 text-3xl font-black tracking-[-.04em]">{product.name}</h2><p className="mt-3 text-sm text-[#74696d]">★ {product.rating}</p><p className="mt-5 leading-7 text-[#65595e]">A nurturing BelGlow essential selected to make your daily beauty and self-care routine feel simple, joyful, and radiant.</p><p className="mt-6 text-2xl font-black">BZ${product.price.toFixed(2)}</p><div className="mt-auto grid grid-cols-[auto_1fr] gap-3 pt-8"><button onClick={() => onFavorite(product.id)} aria-label={favorite ? "Remove from wishlist" : "Save to wishlist"} className="grid h-13 w-13 place-items-center rounded-full border border-[#eacfd7] text-[#ed4773]"><Heart fill={favorite ? "#ed4773" : "none"} /></button><button onClick={() => onAdd(product.id)} className="flex items-center justify-center gap-2 rounded-full bg-[#ef4b74] px-6 font-bold text-white"><ShoppingBag size={19} /> Add to cart</button></div></div>
    </div>
  </ModalShell>;
}

function CartDrawer({ cart, onClose, onRemove }: { cart: number[]; onClose: () => void; onRemove: (id: number) => void }) {
  const total = cart.reduce((sum, id) => sum + (products.find((product) => product.id === id)?.price ?? 0), 0);
  return <FramePanel label="Shopping bag">
    <div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[.2em] text-[#ed4773]">Your glow bag</p><h2 className="mt-1 text-2xl font-black">{cart.length} {cart.length === 1 ? "item" : "items"}</h2></div><button onClick={onClose} aria-label="Close shopping bag" className="rounded-full bg-[#fff1f5] p-2"><X /></button></div>
    <div className="mt-5 flex-1 space-y-3 overflow-auto pr-1">{cart.length === 0 && <EmptyPanel icon={<ShoppingBag />} title="Your bag is ready" text="Add a little glow whenever you're ready." />}{cart.map((id, index) => { const product = products.find((item) => item.id === id)!; return <PanelProduct key={`${id}-${index}`} product={product} action={<button onClick={() => onRemove(id)} aria-label={`Remove ${product.name}`} className="rounded-full p-2 hover:bg-[#fff1f5]"><Minus size={17} /></button>} />; })}</div>
    <div className="mt-4 border-t border-[#eee2e5] pt-4"><div className="flex justify-between text-lg font-black"><span>Total</span><span>BZ${total.toFixed(2)}</span></div><button disabled={!cart.length} className="mt-4 w-full rounded-full bg-[#ef4b74] py-3.5 font-bold text-white disabled:opacity-40">Checkout</button></div>
  </FramePanel>;
}

function SavedProductsPanel({ favoriteIds, onClose, onRemove, onOpen }: { favoriteIds: number[]; onClose: () => void; onRemove: (id: number) => void; onOpen: (id: number) => void }) {
  const savedProducts = products.filter((product) => favoriteIds.includes(product.id));
  return <FramePanel label="Saved products">
    <div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[.2em] text-[#ed4773]">Your wishlist</p><h2 className="mt-1 text-2xl font-black">Saved products</h2></div><button onClick={onClose} aria-label="Close saved products" className="rounded-full bg-[#fff1f5] p-2"><X /></button></div>
    <div className="mt-5 flex-1 space-y-3 overflow-auto pr-1">{savedProducts.length === 0 && <EmptyPanel icon={<Heart />} title="Nothing saved yet" text="Tap a heart on any product to keep it here." />}{savedProducts.map((product) => <PanelProduct key={product.id} product={product} onOpen={() => onOpen(product.id)} action={<button onClick={() => onRemove(product.id)} aria-label={`Remove ${product.name} from saved products`} className="rounded-full p-2 text-[#ed4773] hover:bg-[#fff1f5]"><Heart size={18} fill="#ed4773" /></button>} />)}</div>
  </FramePanel>;
}

function FramePanel({ children, label }: { children: ReactNode; label: string }) {
  return <div className="fixed inset-0 z-[90] bg-[#211a1d]/20 backdrop-blur-[1px]"><aside role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} autoFocus className="frame-panel absolute flex flex-col rounded-[24px] border border-[#f0dfe4] bg-white p-5 shadow-[0_24px_70px_rgba(71,31,43,.22)] sm:p-6">{children}</aside></div>;
}

function PanelProduct({ product, action, onOpen }: { product: (typeof products)[number]; action: ReactNode; onOpen?: () => void }) {
  return <div className="flex items-center gap-3 rounded-2xl border border-[#eee2e5] p-3"><button onClick={onOpen} disabled={!onOpen} className="relative h-18 w-18 shrink-0 overflow-hidden rounded-xl bg-[#fff0f4] disabled:cursor-default"><Image src="/images/belglow-hero-products.png" alt="" fill sizes="72px" className="scale-[2] object-cover" style={{ objectPosition: product.position }} /></button><button onClick={onOpen} disabled={!onOpen} className="min-w-0 flex-1 text-left disabled:cursor-default"><p className="truncate text-sm font-bold">{product.name}</p><p className="mt-1 text-sm text-[#786d71]">BZ${product.price.toFixed(2)}</p></button>{action}</div>;
}

function EmptyPanel({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return <div className="grid min-h-52 place-items-center rounded-2xl bg-[#fff6f8] p-7 text-center text-[#74696d]"><div><span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-white text-[#ed4773]">{icon}</span><p className="mt-4 font-bold text-[#35292e]">{title}</p><p className="mt-1 text-sm">{text}</p></div></div>;
}

function AuthModal({ onClose, onComplete }: { onClose: () => void; onComplete: (user: DemoUser) => void }) {
  const [mode, setMode] = useState<"signup" | "signin">("signin");
  const [role, setRole] = useState<Exclude<AccountRole, "admin">>("shopper");
  const [complete, setComplete] = useState(false);
  function submitEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const email = String(data.get("email") || "shopper@belglow.demo");
    const name = String(data.get("name") || email.split("@")[0] || "Glow member");
    const normalizedEmail = email.toLowerCase();
    const selectedRole: AccountRole = normalizedEmail === "admin@belglow.demo" ? "admin" : normalizedEmail === "seller@belglow.demo" ? "seller" : role;
    onComplete({ name, email, role: selectedRole });
  }

  return <ModalShell label="BelGlow account" onClose={onClose}>
    <div className="relative mx-auto w-full max-w-[520px] rounded-[28px] bg-white p-7 shadow-2xl sm:p-9">
      <button onClick={onClose} aria-label="Close account dialog" className="absolute right-5 top-5 rounded-full bg-[#fff1f5] p-2"><X size={20} /></button>
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#fff0f4] text-[#ed4773]"><Sparkles /></div>
      <h2 className="mt-5 text-3xl font-black tracking-[-.04em]">{mode === "signup" ? "Join BelGlow" : "Welcome back"}</h2>
      <p className="mt-2 text-sm leading-6 text-[#75696e]">Shop beautiful essentials or grow your own beauty business in the BelGlow marketplace.</p>
      {complete ? <div className="mt-8 rounded-2xl bg-[#effbf4] p-6 text-center text-[#23643c]"><Check className="mx-auto" /><p className="mt-3 font-bold">Google sign-in selected</p><button onClick={() => onComplete({ name: "Glow member", email: "member@belglow.demo", role })} className="mt-4 rounded-full bg-[#23643c] px-5 py-2 text-sm font-bold text-white">Continue to BelGlow</button></div> : <>
        <div className="mt-7 grid gap-2 sm:grid-cols-2">
          <button onClick={() => onComplete({ name: "BelGlow Admin", email: "admin@belglow.demo", role: "admin" })} className="flex items-center justify-center gap-2 rounded-2xl bg-[#251b1f] px-4 py-3.5 text-sm font-bold text-white transition hover:bg-[#3b2b31]"><ShieldCheck size={18} /> Admin demo</button>
          <button onClick={() => onComplete({ name: "Glow Essentials", email: "seller@belglow.demo", role: "seller" })} className="flex items-center justify-center gap-2 rounded-2xl bg-[#b85f5d] px-4 py-3.5 text-sm font-bold text-white transition hover:bg-[#a4514f]"><Store size={18} /> Seller demo</button>
        </div>
        <p className="mt-2 text-center text-xs leading-5 text-[#94878c]">admin@belglow.demo or seller@belglow.demo<br />Password: demo123</p>
        <button onClick={() => onComplete({ name: "Glow Shopper", email: "shopper@belglow.demo", role: "shopper" })} className="mt-3 w-full text-center text-xs font-bold text-[#df3765] underline underline-offset-4">Continue as shopper demo</button>
        <div className="my-5 flex items-center gap-3 text-xs text-[#9a8f93]"><span className="h-px flex-1 bg-[#eadfe2]" />or continue with<span className="h-px flex-1 bg-[#eadfe2]" /></div>
        <button onClick={() => setComplete(true)} className="flex w-full items-center justify-center gap-3 rounded-full border border-[#ddd2d6] py-3.5 font-bold transition hover:bg-[#fff8fa]"><span className="text-lg font-black text-[#4285f4]">G</span> Google</button>
        <form onSubmit={submitEmail} className="mt-4 space-y-3">
          {mode === "signup" && <><div className="grid grid-cols-2 gap-2 rounded-2xl bg-[#fff5f7] p-1.5" aria-label="Choose account type"><button type="button" onClick={() => setRole("shopper")} aria-pressed={role === "shopper"} className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-bold ${role === "shopper" ? "bg-white text-[#df3765] shadow-sm" : "text-[#776a6f]"}`}><UserRound size={16} /> I want to shop</button><button type="button" onClick={() => setRole("seller")} aria-pressed={role === "seller"} className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-bold ${role === "seller" ? "bg-white text-[#df3765] shadow-sm" : "text-[#776a6f]"}`}><Store size={16} /> I want to sell</button></div><label className="block text-xs font-bold text-[#5f5358]">Full name<input name="name" required placeholder="Your name or business" className="mt-1.5 h-12 w-full rounded-xl border border-[#e7dade] px-4 font-normal outline-none focus:border-[#ef4b74]" /></label></>}
          <label className="block text-xs font-bold text-[#5f5358]">Email address<div className="relative mt-1.5"><Mail className="absolute left-4 top-3.5 text-[#a79ba0]" size={18} /><input name="email" type="email" required placeholder="you@example.com" className="h-12 w-full rounded-xl border border-[#e7dade] pl-11 pr-4 font-normal outline-none focus:border-[#ef4b74]" /></div></label>
          <label className="block text-xs font-bold text-[#5f5358]">Password<input name="password" type="password" required minLength={6} defaultValue={mode === "signin" ? "demo123" : ""} placeholder="At least 6 characters" className="mt-1.5 h-12 w-full rounded-xl border border-[#e7dade] px-4 font-normal outline-none focus:border-[#ef4b74]" /></label>
          <button className="mt-2 w-full rounded-full bg-[#ef4b74] py-3.5 font-bold text-white hover:bg-[#dc3764]">{mode === "signup" ? "Create account" : "Sign in"}</button>
        </form>
        <p className="mt-5 text-center text-sm text-[#75696e]">{mode === "signup" ? "Already have an account?" : "New to BelGlow?"} <button onClick={() => setMode(mode === "signup" ? "signin" : "signup")} className="font-bold text-[#df3765]">{mode === "signup" ? "Sign in" : "Create one"}</button></p>
      </>}
    </div>
  </ModalShell>;
}

function ModalShell({ children, label, onClose }: { children: ReactNode; label: string; onClose: () => void }) {
  return <div className="fixed inset-0 z-[90] grid place-items-center overflow-y-auto bg-[#211a1d]/45 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={label} onMouseDown={onClose}><div className="flex w-full max-w-4xl justify-center" onMouseDown={(event) => event.stopPropagation()}>{children}</div></div>;
}
