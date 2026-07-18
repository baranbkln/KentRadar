import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const redirectUrl = new URL("/", request.url);

  if (!code) {
    redirectUrl.searchParams.set("auth_error", "oauth_callback");
    return NextResponse.redirect(redirectUrl);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    if (process.env.NODE_ENV === "development") {
      console.warn("Google OAuth callback error", error);
    }

    redirectUrl.searchParams.set("auth_error", "oauth_callback");
  }

  return NextResponse.redirect(redirectUrl);
}
