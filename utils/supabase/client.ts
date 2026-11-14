"use client";

import { createBrowserClient } from "@supabase/ssr";

function buildClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}

let browserClient: ReturnType<typeof buildClient> | undefined;

export function hasSupabaseConfig() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}

export function createClient() {
  if (!hasSupabaseConfig()) {
    throw new Error(
      "Supabase is not configured. Copy .env.example to .env.local, add your project URL and publishable key, then restart the dev server.",
    );
  }
  if (browserClient) return browserClient;
  browserClient = buildClient();
  return browserClient;
}
