import { createClient } from "@/lib/supabase/server";
import { loadProfile } from "@/lib/profile/rebuild";
import { NextResponse } from "next/server";

/** Returns the user's Career Story, or `{ profile: null }` if it hasn't been built yet. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const profile = await loadProfile(supabase, user.id);
    return NextResponse.json({ profile });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
