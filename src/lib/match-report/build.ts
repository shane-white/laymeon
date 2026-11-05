import { verifyEvidence } from "./evidence";
import { computeOverallLabel } from "./label";
import { classifySearchWord, createResumeMatcher } from "./search-words";
import {
  MATCH_REPORT_VERSION,
  matchReportSchema,
  type MatchReport,
  type ModelReport,
} from "./schema";

/**
 * Turns the model's output into the stored report: verifies evidence against
 * the resume, checks search words, computes the overall label, and validates.
 */
export function buildMatchReport(model: ModelReport, resume: string): MatchReport {
  const { requirements, screeners } = verifyEvidence(model, resume);
  const resumeMatcher = createResumeMatcher(resume);

  return matchReportSchema.parse({
    version: MATCH_REPORT_VERSION,
    overall: {
      label: computeOverallLabel(requirements),
      reason: model.overall.reason,
      topFixes: model.overall.topFixes.slice(0, 3),
    },
    screeners,
    requirements,
    searchWords: model.searchWords.map((w) =>
      classifySearchWord(w.term, w.resumeWordings, resumeMatcher),
    ),
    firstImpression: model.firstImpression,
    nextSteps: model.nextSteps.slice(0, 5),
  });
}
