import { interviewPrepDeps } from "@/lib/interview-prep/deps";
import { interviewPrepResponse } from "@/lib/interview-prep/http";
import { updateHints } from "@/lib/interview-prep/practice/operations";
import { signedInUser, unauthorized } from "@/lib/tailoring/http";
import type { NextRequest } from "next/server";

// One Claude call per hint, a few at a time.
export const maxDuration = 300;

type Params = { params: Promise<{ id: string }> };

/**
 * Update hints: writes again every Practice hint that's an Earlier version of
 * the Career Story, keeping each card's question and mark. Responds with the whole Interview Prep.
 */
export async function POST(_request: NextRequest, { params }: Params) {
  const { supabase, user } = await signedInUser();
  if (!user) return unauthorized();
  const { id } = await params;
  return interviewPrepResponse(await updateHints(interviewPrepDeps(supabase, user.id), id));
}
