/**
 * The rules for the user's decisions on a Tailoring's items, shared by the
 * server (which checks each decision before saving it) and the view.
 */
import type { Decision, TailoringItem } from "./tailoring";

/** Whether a decision puts text on the Resume: accepted, edited or own text. */
export function putsTextOnResume(status: Decision["status"]): boolean {
  return status === "accepted" || status === "edited" || status === "own_text";
}

/**
 * Whether a decision is on the gap itself, skipped or Not had, so the user
 * isn't asked to fill it. Rejecting a gap's rewording Suggestion isn't.
 */
export function closesGap(status: Decision["status"]): boolean {
  return status === "skipped" || status === "not_had";
}

/** Whether a decision closes the item and puts nothing on the Resume: rejected, skipped or Not had. */
export function closesWithoutText(status: Decision["status"]): boolean {
  return status === "rejected" || closesGap(status);
}

/** Whether a decision carries the user's text: edited or own text. */
export function hasText(decision: Decision): decision is Extract<Decision, { text: string }> {
  return decision.status === "edited" || decision.status === "own_text";
}

/** The user's text in an edited or own-text decision, otherwise null. */
export function userText(decision: Decision): string | null {
  return hasText(decision) ? decision.text : null;
}

/**
 * The text an item puts on the Resume: its Suggestion's text when accepted,
 * the user's text when edited or their own, otherwise null.
 */
export function acceptedText(item: TailoringItem): string | null {
  if (!item.suggestion || !putsTextOnResume(item.decision.status)) return null;
  return userText(item.decision) ?? item.suggestion.text;
}

/**
 * The decisions the user can make on an item, besides undoing one: an item
 * with a Suggestion can be accepted, edited or rejected; a gap can be skipped;
 * a gap with no Suggestion that's a missing Requirement or a Screener can be
 * marked Not had. Never own text (see `Decision`).
 */
export function allowedDecisions(item: TailoringItem): Exclude<Decision["status"], "undecided">[] {
  return [
    ...(item.suggestion ? (["accepted", "edited", "rejected"] as const) : []),
    ...(item.gap ? (["skipped"] as const) : []),
    ...(canBeNotHad(item) ? (["not_had"] as const) : []),
  ];
}

/** A gap with no Suggestion that's a missing Requirement or a Screener the Resume doesn't show. */
function canBeNotHad(item: TailoringItem): boolean {
  if (!item.gap || item.suggestion) return false;
  return item.target.kind === "screener" || item.target.match === "missing";
}
