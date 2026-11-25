/**
 * A hash of the Career Story as Claude sees it, so a result built from it (a
 * Practice card's hint) can tell when the Career Story has changed since. It
 * changes exactly when the prompt text does: after a Rebuild that changed
 * something or a User change, but not when `updated_at` moves on its own.
 */
import { createHash } from "node:crypto";
import { formatCareerStoryForPrompt } from "./for-prompt";
import type { CareerProfile } from "./schema";

export function careerStoryHash(profile: CareerProfile): string {
  return createHash("sha256").update(formatCareerStoryForPrompt(profile).text).digest("hex");
}
