import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/safe-next-path";

// Handles links from Supabase auth emails that use the token-hash flow, e.g.
// {{ .SiteURL }}/api/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password
// Unlike the PKCE `code` flow, this works when the link is opened in a
// different browser or device from the one that requested it.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = safeNextPath(searchParams.get("next"));

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  if (type === "recovery") {
    return NextResponse.redirect(`${origin}/forgot-password?error=link_expired`);
  }
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
