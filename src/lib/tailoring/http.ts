/** Sends a Tailoring operation's result from a route, and reads what routes are sent. */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { Decision, ExampleWorkInput, FailureKind, TailoringResult, TailoringState } from "./tailoring";

/** What a successful Tailoring request sends back. */
export type TailoringResponse = Omit<TailoringState, "ok">;

/** The body of a request to save a decision: `{ itemId, decision }`. Own text is no longer taken: saved own-text decisions still load, but new ones are edits. */
export const decisionRequestSchema = z.object({
  itemId: z.string().min(1),
  decision: z.discriminatedUnion("status", [
    z.object({ status: z.enum(["undecided", "accepted", "rejected", "skipped"]) }),
    z.object({ status: z.literal("edited"), text: z.string() }),
  ]),
}) satisfies z.ZodType<{ itemId: string; decision: Decision }>;

/** The body of a request to fill a gap with an Example Work: `{ itemId, title, description }`. */
export const exampleWorkRequestSchema = z.object({
  itemId: z.string().min(1),
  title: z.string(),
  description: z.string(),
}) satisfies z.ZodType<{ itemId: string } & ExampleWorkInput>;

/** The request's Supabase client and signed-in user (null when signed out). */
export async function signedInUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export const unauthorized = () => NextResponse.json({ error: "Unauthorized" }, { status: 401 });

/** The request's JSON body, checked against the schema, or the 400 response to send instead. */
export async function requestBody<T>(
  request: NextRequest,
  schema: z.ZodType<T>,
): Promise<{ ok: true; body: T } | { ok: false; response: NextResponse }> {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return { ok: false, response: NextResponse.json({ error: "Invalid request body" }, { status: 400 }) };
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return { ok: false, response: NextResponse.json({ error: z.prettifyError(parsed.error) }, { status: 400 }) };
  }
  return { ok: true, body: parsed.data };
}

const STATUS: Record<FailureKind, number> = {
  not_found: 404,
  no_resume: 409,
  no_match_report: 409,
  match_report_earlier_version: 409,
  invalid_decision: 400,
  invalid_example_work: 400,
  step_failed: 502,
  load_failed: 500,
  save_failed: 500,
  conflict: 409,
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
