import { interviewPrepDeps } from "@/lib/interview-prep/deps";
import { interviewPrepResponse } from "@/lib/interview-prep/http";
import { SECTION_KEYS, type SectionKey } from "@/lib/interview-prep/interview-prep";
import { prepareSection } from "@/lib/interview-prep/lifecycle";
import { signedInUser, unauthorized } from "@/lib/tailoring/http";
import { NextResponse, type NextRequest } from "next/server";

// A section's research (web searches and Claude calls) can take a few minutes.
// Each section is its own request, so Prepare runs all three at once and each
// shows as soon as it's ready.
export const maxDuration = 300;

type Params = { params: Promise<{ id: string; section: string }> };

/**
 * Researches one section of the Job's Interview Prep (`process`, `company` or
 * `practice`): Prepare and Refresh both send this. Responds with the whole
 * Interview Prep, as for GET.
 */
export async function POST(_request: NextRequest, { params }: Params) {
  const { supabase, user } = await signedInUser();
  if (!user) return unauthorized();
  const { id, section } = await params;
  if (!SECTION_KEYS.includes(section as SectionKey)) {
    return NextResponse.json({ error: "Unknown Interview Prep section" }, { status: 400 });
  }
  return interviewPrepResponse(await prepareSection(interviewPrepDeps(supabase, user.id), id, section as SectionKey));
}
