/** Sends a Document change's result from a route. */
import { NextResponse } from "next/server";
import type { DocumentResult, FailureKind } from "./document";

const STATUS: Record<FailureKind, number> = {
  not_found: 404,
  invalid: 400,
  unsupported_type: 400,
  too_large: 413,
  limit_reached: 409,
  unreadable: 422,
  save_failed: 500,
};

/**
 * A change is sent as `{ documents, rebuildRequested, contentChanged }`; a
 * failure as `{ error, kind }` with the status for its kind.
 */
export function documentResponse(result: DocumentResult, successStatus = 200): NextResponse {
  if (!result.ok) {
    return NextResponse.json({ error: result.message, kind: result.kind }, { status: STATUS[result.kind] });
  }
  const { documents, rebuildRequested, contentChanged } = result;
  return NextResponse.json({ documents, rebuildRequested, contentChanged }, { status: successStatus });
}
