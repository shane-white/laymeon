import { quoteInResume, verifyEvidence } from "./evidence";
import { computeOverallLabel } from "./label";
import {
  MATCH_REPORT_VERSION,
  matchReportSchema,
  type MatchReport,
  type ModelReport,
  type SearchWord,
} from "./schema";

function classifySearchWords(
  words: ModelReport["searchWords"],
  resume: string,
): SearchWord[] {
  return words.map(({ term, resumeWording, similarity }) => {
    if (quoteInResume(term, resume)) {
      return { term, status: "found", resumeWording: null, similarity: null };
    }
    if (resumeWording && quoteInResume(resumeWording, resume)) {
      return {
        term,
        status: "similar",
        resumeWording,
        similarity: similarity ?? "related",
      };
    }
    return { term, status: "not_found", resumeWording: null, similarity: null };
  });
}

/**
 * Turns the model's output into the stored report: verifies evidence against
 * the resume, checks search words, computes the overall label, and validates.
 */
export function buildMatchReport(model: ModelReport, resume: string): MatchReport {
  const { requirements, screeners } = verifyEvidence(model, resume);

  return matchReportSchema.parse({
    version: MATCH_REPORT_VERSION,
    overall: {
      label: computeOverallLabel(requirements),
      reason: model.overall.reason,
      topFixes: model.overall.topFixes.slice(0, 3),
    },
    screeners,
    requirements,
    searchWords: classifySearchWords(model.searchWords, resume),
    firstImpression: model.firstImpression,
    nextSteps: model.nextSteps.slice(0, 5),
  });
}
