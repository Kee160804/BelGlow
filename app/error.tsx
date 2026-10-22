"use client";

import { useEffect } from "react";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return <main className="grid min-h-screen place-items-center bg-[#fffaf8] px-5"><section className="max-w-xl text-center"><p className="text-xs font-bold uppercase tracking-[.2em] text-[#d8446e]">Something went wrong</p><h1 className="mt-3 font-serif text-4xl font-semibold">BelGlow hit an unexpected problem</h1><p className="mt-4 text-sm leading-6 text-[#75696e]">Your information is still safe. Try loading this section again, or contact support if the problem continues.</p><div className="mt-7 flex justify-center gap-3"><button onClick={reset} className="rounded-full bg-[#ef4b74] px-6 py-3 font-bold text-white">Try again</button><a href="/contact" className="rounded-full border border-[#d9c7c3] bg-white px-6 py-3 font-bold">Contact support</a></div></section></main>;
}
