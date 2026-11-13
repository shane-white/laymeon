import { createClient } from "@/lib/supabase/server";
import { getRebuildStatus } from "@/lib/profile/auto-rebuild";
import { loadProfile } from "@/lib/profile/rebuild";
import { NextResponse } from "next/server";

/**
 * Returns the user's Career Story (null if it hasn't been built yet) and
 * whether it's being rebuilt.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [profile, rebuild] = await Promise.all([
      loadProfile(supabase, user.id),
      getRebuildStatus(supabase, user.id),
    ]);
    return NextResponse.json({ profile, rebuild });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
