import { createClient } from "@/lib/supabase/server";
import { listReviews } from "@/lib/resume-review/store";
import { NextResponse } from "next/server";

/**
 * The user's resume reviews for the Generated Documents list, newest first.
 * Includes reviews of deleted resumes, marked resumeDeleted, so the UI can
 * offer to delete them.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    return NextResponse.json(await listReviews(supabase, user.id));
  } catch (err) {
    console.error("Couldn't list resume reviews", err);
    return NextResponse.json({ error: "Couldn't load reviews" }, { status: 500 });
  }
}
