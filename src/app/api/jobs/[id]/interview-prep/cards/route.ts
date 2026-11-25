import { z } from "zod";
import { interviewPrepDeps } from "@/lib/interview-prep/deps";
import { interviewPrepResponse } from "@/lib/interview-prep/http";
import { DECK_KEYS } from "@/lib/interview-prep/interview-prep";
import { addOwnQuestion } from "@/lib/interview-prep/practice/operations";
import { requestBody, signedInUser, unauthorized } from "@/lib/tailoring/http";
import type { NextRequest } from "next/server";

// Writing the hint is one Claude call.
export const maxDuration = 120;

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({ deck: z.enum(DECK_KEYS), question: z.string() });

/**
 * Adds the user's own question to a Deck and writes its hint. The card is
 * saved (writing its hint) before the hint is written, and the response comes
 * once the hint is saved, or marked failed. Responds with the whole Interview Prep.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const { supabase, user } = await signedInUser();
  if (!user) return unauthorized();
  const { id } = await params;
  const body = await requestBody(request, bodySchema);
  if (!body.ok) return body.response;
  const { deck, question } = body.body;
  return interviewPrepResponse(await addOwnQuestion(interviewPrepDeps(supabase, user.id), id, deck, question));
}
