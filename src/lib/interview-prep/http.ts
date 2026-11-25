/** Sends an Interview Prep operation's result from a route. */
import { NextResponse } from "next/server";
import type { FailureKind, InterviewPrepResult, InterviewPrepState } from "./interview-prep";

/** What a successful Interview Prep request sends back. */
export type InterviewPrepResponse = Omit<InterviewPrepState, "ok">;

const STATUS: Record<FailureKind, number> = {
  not_found: 404,
  already_researching: 409,
  invalid: 400,
  no_career_story: 409,
  load_failed: 500,
  save_failed: 500,
  write_failed: 502,
};

/** A success is sent as an `InterviewPrepResponse`; a failure as `{ error, kind }` with the status for its kind. */
export function interviewPrepResponse(result: InterviewPrepResult): NextResponse {
  if (!result.ok) {
    return NextResponse.json({ error: result.message, kind: result.kind }, { status: STATUS[result.kind] });
  }
  const { prep, legacySuggestions, careerStoryHash } = result;
  return NextResponse.json({ prep, legacySuggestions, careerStoryHash } satisfies InterviewPrepResponse);
}
