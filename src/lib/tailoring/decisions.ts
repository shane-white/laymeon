/**
 * The rules for the user's decisions on a Tailoring's items, shared by the
 * server (which checks each decision before saving it) and the view.
 */
import type { Decision, TailoringItem } from "./tailoring";

/** Whether a decision puts text on the Resume: accepted, edited or own text. */
export function putsTextOnResume(status: Decision["status"]): boolean {
  return status === "accepted" || status === "edited" || status === "own_text";
}

/** The user's text in an edited or own-text decision, otherwise null. */
export function userText(decision: Decision): string | null {
  return decision.status === "edited" || decision.status === "own_text" ? decision.text : null;
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
 * with a Suggestion can be accepted, edited, given own text or rejected; a gap
 * can be skipped.
 */
export function allowedDecisions(item: TailoringItem): Exclude<Decision["status"], "undecided">[] {
  return [
    ...(item.suggestion ? (["accepted", "edited", "own_text", "rejected"] as const) : []),
    ...(item.gap ? (["skipped"] as const) : []),
  ];
}
