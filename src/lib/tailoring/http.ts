/** Sends a Tailoring operation's result from a route, and reads what routes are sent. */
import { NextResponse } from "next/server";
import { z } from "zod";
import type { Decision, ExampleWorkInput, FailureKind, TailoringResult, TailoringState } from "./tailoring";

/** What a successful Tailoring request sends back. */
export type TailoringResponse = Omit<TailoringState, "ok">;

/** The body of a request to save a decision: `{ itemId, decision }`. */
export const decisionRequestSchema = z.object({
  itemId: z.string().min(1),
  decision: z.discriminatedUnion("status", [
    z.object({ status: z.enum(["undecided", "accepted", "rejected", "skipped"]) }),
    z.object({ status: z.enum(["edited", "own_text"]), text: z.string() }),
  ]),
}) satisfies z.ZodType<{ itemId: string; decision: Decision }>;

/** The body of a request to fill a gap with an Example Work: `{ itemId, title, description }`. */
export const exampleWorkRequestSchema = z.object({
  itemId: z.string().min(1),
  title: z.string(),
  description: z.string(),
}) satisfies z.ZodType<{ itemId: string } & ExampleWorkInput>;

const STATUS: Record<FailureKind, number> = {
  not_found: 404,
  no_resume: 409,
  no_match_report: 409,
  match_report_earlier_version: 409,
  invalid_decision: 400,
  invalid_example_work: 400,
  step_failed: 502,
  save_failed: 500,
};

/**
 * A success is sent as a `TailoringResponse`; a
 * failure as `{ error, kind }` with the status for its kind.
 */
export function tailoringResponse(result: TailoringResult): NextResponse {
  if (!result.ok) {
    return NextResponse.json({ error: result.message, kind: result.kind }, { status: STATUS[result.kind] });
  }
  const { tailoring, earlierVersion, startBlocker, resumeName, company } = result;
  return NextResponse.json({ tailoring, earlierVersion, startBlocker, resumeName, company } satisfies TailoringResponse);
}
