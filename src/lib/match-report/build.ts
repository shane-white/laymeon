import type { CareerStoryContext } from "@/lib/profile/for-prompt";
import { verifyEvidence } from "./evidence";
import { computeOverallLabel } from "./label";
import { classifySearchWord, createResumeMatcher } from "./search-words";
import {
  MATCH_REPORT_VERSION,
  matchReportSchema,
  type CareerStoryRef,
  type MatchReport,
  type ModelReport,
} from "./schema";

// Enough to show where the Career Story covers a requirement, without a long list.
const MAX_CAREER_STORY_REFS = 4;

/** Turns the IDs the model pointed at into Career Story items, dropping any that don't exist. */
export function resolveCareerStoryRefs(ids: string[], context: CareerStoryContext | undefined): CareerStoryRef[] {
  if (!context) return [];
  const refs: CareerStoryRef[] = [];
  for (const id of ids) {
    const ref = context.refs.get(id.trim().replace(/^\[|\]$/g, "").toUpperCase());
    if (ref && !refs.some((r) => r.section === ref.section && r.key === ref.key)) refs.push(ref);
  }
  return refs.slice(0, MAX_CAREER_STORY_REFS);
}

/**
 * Turns the model's output into the stored report: verifies evidence against
 * the resume, checks search words, computes the overall label, and validates.
 * Career Story items only show for what the resume doesn't, and never change
 * the label: the report judges the resume.
 */
export function buildMatchReport(
  model: ModelReport,
  resume: string,
  careerStory?: CareerStoryContext,
): MatchReport {
  const verified = verifyEvidence(model, resume);
  const requirements = verified.requirements.map((r) => ({
    ...r,
    careerStory: r.match === "strong" ? [] : resolveCareerStoryRefs(r.careerStoryIds, careerStory),
  }));
  const screeners = verified.screeners.map((s) => ({
    ...s,
    careerStory: s.shown ? [] : resolveCareerStoryRefs(s.careerStoryIds, careerStory),
  }));
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
