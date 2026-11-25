import { interviewPrepDeps } from "@/lib/interview-prep/deps";
import { interviewPrepResponse } from "@/lib/interview-prep/http";
import { writeHint } from "@/lib/interview-prep/practice/operations";
import { signedInUser, unauthorized } from "@/lib/tailoring/http";
import type { NextRequest } from "next/server";

// Writing the hint is one Claude call.
export const maxDuration = 120;

type Params = { params: Promise<{ id: string; cardId: string }> };

/**
 * Writes a Practice card's hint again (one that failed or stopped, or an
 * Earlier version), keeping its question and mark. Responds with the whole Interview Prep.
 */
export async function POST(_request: NextRequest, { params }: Params) {
  const { supabase, user } = await signedInUser();
  if (!user) return unauthorized();
  const { id, cardId } = await params;
  return interviewPrepResponse(await writeHint(interviewPrepDeps(supabase, user.id), id, cardId));
}
