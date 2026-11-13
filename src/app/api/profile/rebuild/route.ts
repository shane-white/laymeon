import { createClient } from "@/lib/supabase/server";
import { rebuildProfile } from "@/lib/profile/rebuild";
import { NextResponse } from "next/server";

// Each changed document is one model call; several run in parallel.
export const maxDuration = 300;

/** Rebuilds the user's Career Story from their documents and returns it. */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await rebuildProfile(supabase, user.id);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Couldn't build your Career Story: ${message}` },
      { status: 500 },
    );
  }
}
