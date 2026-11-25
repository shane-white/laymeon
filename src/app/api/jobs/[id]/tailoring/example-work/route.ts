import { tailoringDeps } from "@/lib/tailoring/deps";
import { exampleWorkRequestSchema, tailoringResponse } from "@/lib/tailoring/http";
import { requestBody, signedInUser, unauthorized } from "@/lib/http";
import { fillGap } from "@/lib/tailoring/lifecycle";
import type { NextRequest } from "next/server";

// Writing the Suggestion is a Claude step, and adding the Example Work
// rebuilds the Career Story in the background after the response is sent;
// both count toward this limit.
export const maxDuration = 300;

/**
 * Fills a gap in the Job's Tailoring: adds the user's written Example Work and
 * writes the item's Suggestion from it. The JSON body is
 * `{ itemId, title, description }` (see `exampleWorkRequestSchema`); the
 * response is the Tailoring, as for GET `/api/jobs/[id]/tailoring`.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, user } = await signedInUser();
  if (!user) return unauthorized();
  const { id } = await params;

  const parsed = await requestBody(request, exampleWorkRequestSchema);
  if (!parsed.ok) return parsed.response;

  const { itemId, title, description } = parsed.body;
  return tailoringResponse(await fillGap(tailoringDeps(supabase, user.id), id, itemId, { title, description }));
}
