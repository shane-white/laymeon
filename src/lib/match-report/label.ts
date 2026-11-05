import type { OverallLabel, Requirement } from "./schema";

/**
 * Overall label rule from LAY-22, computed in code so the same requirements
 * always give the same label:
 * - Strong: every must-have is Strong.
 * - Partial: no more than one must-have is Missing.
 * - Weak: two or more must-haves are Missing.
 *
 * If the posting has no must-haves, all requirements are used instead.
 */
export function computeOverallLabel(
  requirements: Pick<Requirement, "importance" | "match">[],
): OverallLabel {
  const mustHaves = requirements.filter((r) => r.importance === "must_have");
  const considered = mustHaves.length > 0 ? mustHaves : requirements;

  if (considered.length === 0) return "partial";
  if (considered.every((r) => r.match === "strong")) return "strong";

  const missing = considered.filter((r) => r.match === "missing").length;
  return missing <= 1 ? "partial" : "weak";
}
