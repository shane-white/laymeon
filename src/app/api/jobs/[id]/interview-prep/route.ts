import { interviewPrepDeps } from "@/lib/interview-prep/deps";
import { interviewPrepResponse } from "@/lib/interview-prep/http";
import { getInterviewPrep } from "@/lib/interview-prep/lifecycle";
import { signedInUser, unauthorized } from "@/lib/tailoring/http";
import type { NextRequest } from "next/server";

type Params = { params: Promise<{ id: string }> };

/** The Job's Interview Prep (null before its first Prepare), and its older Interview Suggestions if it still has them. */
export async function GET(_request: NextRequest, { params }: Params) {
  const { supabase, user } = await signedInUser();
  if (!user) return unauthorized();
  const { id } = await params;
  return interviewPrepResponse(await getInterviewPrep(interviewPrepDeps(supabase, user.id), id));
}
