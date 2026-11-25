import { z } from "zod";
import { interviewPrepDeps } from "@/lib/interview-prep/deps";
import { interviewPrepResponse } from "@/lib/interview-prep/http";
import { markCard, removeCard } from "@/lib/interview-prep/practice/operations";
import { requestBody, signedInUser, unauthorized } from "@/lib/tailoring/http";
import type { NextRequest } from "next/server";

type Params = { params: Promise<{ id: string; cardId: string }> };

const bodySchema = z.object({ mark: z.enum(["not_tried", "feels_good", "practice_more"]) });

/** Sets a Practice card's mark; `not_tried` clears it. Responds with the whole Interview Prep. */
export async function PATCH(request: NextRequest, { params }: Params) {
  const { supabase, user } = await signedInUser();
  if (!user) return unauthorized();
  const { id, cardId } = await params;
  const body = await requestBody(request, bodySchema);
  if (!body.ok) return body.response;
  return interviewPrepResponse(await markCard(interviewPrepDeps(supabase, user.id), id, cardId, body.body.mark));
}

/** Removes a Practice card the user added or has marked. Responds with the whole Interview Prep. */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const { supabase, user } = await signedInUser();
  if (!user) return unauthorized();
  const { id, cardId } = await params;
  return interviewPrepResponse(await removeCard(interviewPrepDeps(supabase, user.id), id, cardId));
}