"use client";

import { createBrowserClient } from "@supabase/ssr";

function buildClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}

let browserClient: ReturnType<typeof buildClient> | undefined;

export function createClient() {
  if (browserClient) return browserClient;
  browserClient = buildClient();
  return browserClient;
}
