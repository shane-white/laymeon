/** Sends a Tailoring operation's result from a route. */
import { NextResponse } from "next/server";
import type { FailureKind, TailoringResult } from "./tailoring";

const STATUS: Record<FailureKind, number> = {
  not_found: 404,
  no_resume: 409,
  no_match_report: 409,
  match_report_earlier_version: 409,
  step_failed: 502,
  save_failed: 500,
};

/**
 * A success is sent as `{ tailoring, earlierVersion, startBlocker }`; a
 * failure as `{ error, kind }` with the status for its kind.
 */
export function tailoringResponse(result: TailoringResult): NextResponse {
  if (!result.ok) {
    return NextResponse.json({ error: result.message, kind: result.kind }, { status: STATUS[result.kind] });
  }
  const { tailoring, earlierVersion, startBlocker } = result;
  return NextResponse.json({ tailoring, earlierVersion, startBlocker });
}
