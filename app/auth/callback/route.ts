import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const providerError = request.nextUrl.searchParams.get("error");
  const requestedNext = request.nextUrl.searchParams.get("next") ?? "/account";
  const next = requestedNext.startsWith("/") && !requestedNext.startsWith("//") ? requestedNext : "/account";

  if (providerError) {
    const errorCode = providerError === "access_denied" ? "provider_cancelled" : "oauth_failed";
    return NextResponse.redirect(new URL(`/?authError=${errorCode}`, request.url));
  }

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const profileResult = await supabase.from("profiles").select("account_status, suspended_until").eq("id", user.id).maybeSingle();
        const profile = profileResult.error?.message.includes("account_status") || profileResult.error?.message.includes("suspended_until")
          ? null
          : profileResult.data;
        const suspensionActive = profile?.account_status === "suspended"
          && (!profile.suspended_until || new Date(profile.suspended_until).getTime() > Date.now());
        if (profile?.account_status === "archived" || suspensionActive) {
          await supabase.auth.signOut({ scope: "local" });
          const reason = profile.account_status === "archived" ? "account_archived" : "account_suspended";
          return NextResponse.redirect(new URL(`/?authError=${reason}`, request.url));
        }
      }
      return NextResponse.redirect(new URL(next, request.url));
    }
  }

  return NextResponse.redirect(new URL("/?authError=oauth_failed", request.url));
}
