import { createClient } from "@/lib/supabase/server";
import { deleteReview, getReview, ReviewError, runReview } from "@/lib/resume-review/store";
import { NextResponse, type NextRequest } from "next/server";

// Reading the file and one Claude review (plus a retry if its output is invalid).
export const maxDuration = 180;

type Params = { params: Promise<{ id: string }> };

async function signedInUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

/** The resume's saved review, and whether it's out of date. 404 if it hasn't been reviewed. */
export async function GET(_request: NextRequest, { params }: Params) {
  const { supabase, user } = await signedInUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  try {
    const review = await getReview(supabase, user.id, id);
    if (!review) return NextResponse.json({ error: "This resume hasn't been reviewed yet" }, { status: 404 });
    return NextResponse.json(review);
  } catch (err) {
    console.error("Couldn't load resume review", err);
    return NextResponse.json({ error: "Couldn't load the review" }, { status: 500 });
  }
}

/** Reviews the resume and saves the result, replacing any earlier review. */
export async function POST(_request: NextRequest, { params }: Params) {
  const { supabase, user } = await signedInUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  try {
    return NextResponse.json(await runReview(supabase, user.id, id));
  } catch (err) {
    if (err instanceof ReviewError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("Resume review failed", err);
    return NextResponse.json({ error: "The review couldn't be completed. Please try again." }, { status: 502 });
  }
}

/** Deletes the resume's review. */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const { supabase, user } = await signedInUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  try {
    const deleted = await deleteReview(supabase, user.id, id);
    if (!deleted) return NextResponse.json({ error: "Review not found" }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Couldn't delete resume review", err);
    return NextResponse.json({ error: "Couldn't delete the review" }, { status: 500 });
  }
}
