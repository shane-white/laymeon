import type { OverallLabel, Requirement } from "./schema";

/** Thresholds for the overall label (LAY-93). Tune here. */
const STRONG_MAX_MISSING = 0.17; // Strong: under this share missing
const PARTIAL_MAX_MISSING = 0.3; // Partial: up to this share missing
const STRONG_MIN_STRONG = 0.6; // Strong: over this share of the rest rated Strong
const PARTIAL_MIN_STRONG = 0.2; // Partial: at least this share of the rest rated Strong

type Rated = Pick<Requirement, "importance" | "match">;

/** The requirements the label is based on: the must-haves, or all of them if there are none. */
function consideredRequirements(requirements: Rated[]): Rated[] {
  const mustHaves = requirements.filter((r) => r.importance === "must_have");
  return mustHaves.length > 0 ? mustHaves : requirements;
}

/**
 * Overall label, computed in code so the same requirements always give the
 * same label. "Rest" is the considered requirements that aren't Missing.
 * - Perfect: every one is Strong.
 * - Strong: under 17% Missing, and over 60% of the rest Strong.
 * - Partial: 17–30% Missing, and at least 20% of the rest Strong.
 * - Weak: over 30% Missing.
 * Missing a tier's Strong bar drops the label one tier.
 *
 * If the posting has no must-haves, all requirements are used instead.
 */
export function computeOverallLabel(requirements: Rated[]): OverallLabel {
  const considered = consideredRequirements(requirements);
  if (considered.length === 0) return "partial";
  if (considered.every((r) => r.match === "strong")) return "perfect";

  const missing = considered.filter((r) => r.match === "missing").length;
  const rest = considered.length - missing;
  const strongShare = rest > 0 ? considered.filter((r) => r.match === "strong").length / rest : 0;
  const missingShare = missing / considered.length;

  if (missingShare < STRONG_MAX_MISSING) {
    return strongShare > STRONG_MIN_STRONG ? "strong" : "partial";
  }
  if (missingShare <= PARTIAL_MAX_MISSING) {
    return strongShare >= PARTIAL_MIN_STRONG ? "partial" : "weak";
  }
  return "weak";
}

/** How many of the requirements the label is based on are Missing. */
export function countMissingConsidered(requirements: Rated[]): number {
  return consideredRequirements(requirements).filter((r) => r.match === "missing").length;
}

/**
 * The label to show for a saved report: worked out again from its saved
 * ratings, so reports made under older rules follow the current ones.
 */
export function overallLabelOf(
  report: { overall: { label: OverallLabel }; requirements?: Rated[] },
): OverallLabel {
  return report.requirements ? computeOverallLabel(report.requirements) : report.overall.label;
}
