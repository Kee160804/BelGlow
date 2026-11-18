"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Star } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { useStore } from "@/components/providers/StoreProvider";

type Review = {
  id: string;
  rating: number;
  title: string | null;
  body: string | null;
  is_verified_purchase: boolean;
  is_approved: boolean;
  created_at: string;
};

export default function ProductReviews({ productId }: { productId: string }) {
  const { openAuth } = useStore();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [myReview, setMyReview] = useState<Review | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [rating, setRating] = useState(0);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadReviews = useCallback(async () => {
    const supabase = createClient();
    const [{ data: { user } }, { data: approvedReviews }] = await Promise.all([
      supabase.auth.getUser(),
      supabase.from("reviews").select("id, rating, title, body, is_verified_purchase, is_approved, created_at")
        .eq("product_id", productId).eq("is_approved", true).order("created_at", { ascending: false }).limit(50),
    ]);
    setUserId(user?.id ?? null);
    setReviews((approvedReviews ?? []) as Review[]);
    if (user) {
      const { data: ownReview } = await supabase.from("reviews")
        .select("id, rating, title, body, is_verified_purchase, is_approved, created_at")
        .eq("product_id", productId).eq("user_id", user.id).maybeSingle();
      setMyReview(ownReview as Review | null);
    } else {
      setMyReview(null);
    }
    setLoading(false);
  }, [productId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadReviews(), 0);
    return () => window.clearTimeout(timer);
  }, [loadReviews]);

  async function submitReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    if (!userId) { openAuth(); return; }
    if (rating < 1 || rating > 5) { setError("Choose a star rating before submitting."); return; }
    setSaving(true);
    const { error: submitError } = await createClient().rpc("submit_product_review", {
      target_product_id: productId,
      review_rating: rating,
      review_title: title.trim() || null,
      review_body: body.trim(),
    });
    setSaving(false);
    if (submitError) {
      setError(submitError.message.includes("verified purchase")
        ? "Reviews are available after your order is delivered. Sign in with the account used for checkout."
        : submitError.message.includes("already reviewed")
          ? "You have already reviewed this product."
          : "Your review could not be submitted. Please try again.");
      return;
    }
    setTitle("");
    setBody("");
    setRating(0);
    setNotice("Thanks! Your review was sent for approval before it appears publicly.");
    await loadReviews();
  }

  return <section className="pt-4" aria-label="Product reviews">
    <div className="flex items-center justify-between gap-3"><h3 className="font-bold">Customer reviews</h3><span className="text-xs text-[#817679]">{reviews.length} approved</span></div>
    {loading ? <p className="py-5 text-sm text-[#817679]">Loading reviews…</p> : reviews.length ? <div className="mt-3 max-h-64 space-y-3 overflow-y-auto pr-1">{reviews.map((review) => <article key={review.id} className="rounded-xl bg-[#fff8fa] p-3"><div className="flex items-start justify-between gap-3"><div><div className="flex gap-0.5" aria-label={`${review.rating} out of 5 stars`}>{Array.from({ length: 5 }, (_, index) => <Star key={index} size={14} fill={index < review.rating ? "currentColor" : "none"} className={index < review.rating ? "text-amber-500" : "text-[#d6c9ce]"} />)}</div>{review.title && <h4 className="mt-1 text-sm font-bold">{review.title}</h4>}</div>{review.is_verified_purchase && <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-800">Verified buyer</span>}</div><p className="mt-2 whitespace-pre-wrap text-sm leading-5 text-[#655b60]">{review.body}</p><p className="mt-2 text-[10px] text-[#817679]">{new Date(review.created_at).toLocaleDateString()}</p></article>)}</div> : <p className="mt-3 rounded-xl bg-[#fff8fa] p-3 text-sm text-[#75696e]">No approved reviews yet. Be the first verified buyer to share feedback.</p>}

    {myReview ? <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{myReview.is_approved ? "You have reviewed this product." : "Your review is awaiting approval."}</p> : <form onSubmit={(event) => void submitReview(event)} className="mt-4 border-t border-[#eee4e7] pt-4">
      <h4 className="text-sm font-bold">Leave a review</h4>
      <p className="mt-1 text-xs leading-5 text-[#817679]">Sign in with the account used to order. Reviews are open after delivery and are checked before publishing.</p>
      <div className="mt-3 flex items-center gap-1" role="group" aria-label="Select a star rating">{Array.from({ length: 5 }, (_, index) => { const value = index + 1; return <button key={value} type="button" onClick={() => setRating(value)} aria-label={`${value} star${value === 1 ? "" : "s"}`} aria-pressed={rating === value} className="rounded p-1 text-amber-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#bf6d68]"><Star size={24} fill={value <= rating ? "currentColor" : "none"} /></button>; })}<span className="ml-2 text-xs text-[#817679]">{rating ? `${rating} of 5` : "Choose a rating"}</span></div>
      <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={100} placeholder="Review title (optional)" className="mt-3 h-10 w-full rounded-lg border border-[#e5dade] px-3 text-sm" />
      <textarea value={body} onChange={(event) => setBody(event.target.value)} required minLength={10} maxLength={2000} rows={3} placeholder="Share what you think about this product…" className="mt-2 w-full rounded-lg border border-[#e5dade] p-3 text-sm" />
      {error && <p role="alert" className="mt-2 text-xs text-rose-700">{error}</p>}{notice && <p role="status" className="mt-2 text-xs text-emerald-800">{notice}</p>}
      <button disabled={saving || Boolean(userId && (!body.trim() || !rating))} className="mt-3 rounded-full bg-[#ef4b74] px-4 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">{saving ? "Submitting…" : userId ? "Submit review" : "Sign in to review"}</button>
    </form>}
  </section>;
}
