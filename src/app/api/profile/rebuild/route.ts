import { createClient } from "@/lib/supabase/server";
import { getRebuildStatus, requestRebuild, runRebuilds } from "@/lib/profile/auto-rebuild";
import { NextResponse } from "next/server";

// Each changed document is one model call; several run in parallel.
export const maxDuration = 300;

/**
 * Rebuilds the user's Career Story from their documents and returns it. If
 * a rebuild is already running, returns 202 with `rebuild.running`: that run
 * picks up this request when it finishes.
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await requestRebuild(supabase, user.id);
    const result = await runRebuilds(supabase, user.id);
    if (!result) {
      return NextResponse.json({ rebuild: await getRebuildStatus(supabase, user.id) }, { status: 202 });
    }
    return NextResponse.json({ ...result, rebuild: { running: false, error: null } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Couldn't build your Career Story: ${message}` },
      { status: 500 },
    );
  }
}
