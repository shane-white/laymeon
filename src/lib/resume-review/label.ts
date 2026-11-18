/**
 * The overall label and the order of fixes, computed in code so the same
 * checks always give the same result. Information items never count.
 */
import type { Fix, OverallLabel, ReviewCheck } from "./report-schema";
import type { CheckId } from "./types";

/**
 * Thresholds for the overall label. Tune here.
 * - Ready to send: no Fix this, and at most READY_MAX_IMPROVE Could improve.
 * - Needs work: NEEDS_WORK_MIN_FIX or more Fix this, or NEEDS_WORK_MIN_PROBLEMS or more problems in all.
 * - A few fixes: everything in between.
 */
export const LABEL_THRESHOLDS = {
  READY_MAX_IMPROVE: 5,
  NEEDS_WORK_MIN_FIX: 3,
  NEEDS_WORK_MIN_PROBLEMS: 12,
};

/**
 * Checks that look at the same weakness from two sides. For the label they
 * count once, with the worse of their labels, so one weakness can't tip a
 * resume into Needs work on its own.
 */
export const OVERLAPPING_CHECKS: CheckId[][] = [
  // Bullets without numbers are usually the duty-style bullets: both mean "no results shown".
  ["bullets.numbers", "bullets.achievements"],
];

const SEVERITY = { good: 0, info: 0, could_improve: 1, fix: 2 } as const;

/** The labels that count toward the overall label: one per group of overlapping checks. */
function countedLabels(checks: Pick<ReviewCheck, "label" | "id">[]): ReviewCheck["label"][] {
  const grouped = new Map<number, ReviewCheck["label"]>();
  const labels: ReviewCheck["label"][] = [];
  for (const c of checks) {
    const group = OVERLAPPING_CHECKS.findIndex((g) => g.includes(c.id));
    if (group === -1) {
      labels.push(c.label);
      continue;
    }
    const current = grouped.get(group);
    if (!current || SEVERITY[c.label] > SEVERITY[current]) grouped.set(group, c.label);
  }
  return [...labels, ...grouped.values()];
}

export function computeOverallLabel(checks: Pick<ReviewCheck, "label" | "id">[]): OverallLabel {
  const labels = countedLabels(checks);
  const fix = labels.filter((l) => l === "fix").length;
  const improve = labels.filter((l) => l === "could_improve").length;
  const t = LABEL_THRESHOLDS;
  if (fix >= t.NEEDS_WORK_MIN_FIX || fix + improve >= t.NEEDS_WORK_MIN_PROBLEMS) return "needs_work";
  if (fix === 0 && improve <= t.READY_MAX_IMPROVE) return "ready";
  return "few_fixes";
}

/**
 * Checks by how much a problem costs the candidate, most first. Within the
 * same label, a fix higher in this list comes first. Problems that stop
 * software reading the resume come before style.
 */
export const CHECK_PRIORITY: CheckId[] = [
  "readability.text_layer",
  "readability.contact_readable",
  "readability.reading_order",
  "readability.missing_content",
  "readability.layout_elements",
  "readability.header_footer",
  "basics.contact",
  "readability.file_type",
  "readability.dates",
  "readability.headings",
  "writing.typos",
  "basics.personal_details",
  "first_impression.headline",
  "first_impression.top_third",
  "bullets.achievements",
  "bullets.numbers",
  "bullets.present",
  "bullets.weak_openers",
  "first_impression.summary",
  "readability.hidden_text",
  "skills.shown_in_context",
  "writing.ai_words",
  "length.pages",
  "basics.email",
  "bullets.per_role",
  "bullets.detail_by_recency",
  "writing.pronouns",
  "writing.ing_endings",
  "writing.repetitive_structure",
  "writing.cliches",
  "skills.repetition",
  "skills.list_quality",
  "skills.acronyms",
  "bullets.tense",
  "bullets.length",
  "length.section_order",
  "basics.outdated_lines",
  "writing.em_dashes",
  "writing.consistency",
  "readability.file_name",
];

const LABEL_RANK = { fix: 0, could_improve: 1 } as const;

/** Every problem, most important first: Fix this before Could improve, then by CHECK_PRIORITY. */
export function orderFixes(checks: Pick<ReviewCheck, "id" | "label" | "summary">[]): Fix[] {
  const rank = (id: CheckId) => {
    const index = CHECK_PRIORITY.indexOf(id);
    return index === -1 ? CHECK_PRIORITY.length : index;
  };
  return checks
    .filter((c): c is typeof c & { label: Fix["label"] } => c.label === "fix" || c.label === "could_improve")
    .sort((a, b) => LABEL_RANK[a.label] - LABEL_RANK[b.label] || rank(a.id) - rank(b.id))
    .map((c) => ({ checkId: c.id, label: c.label, text: c.summary }));
}
