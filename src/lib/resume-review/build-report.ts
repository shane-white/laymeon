/**
 * Combines the code checks and Claude's review into the stored report:
 * verifies Claude's quotes against the resume, computes the overall label
 * and orders the fixes. Everything here is code, so it's easy to test.
 */
import { quoteInResume } from "@/lib/match-report/evidence";
import { computeOverallLabel, orderFixes } from "./label";
import { stripMarkdown } from "./text";
import { MODEL_CHECK_KEYS, type ModelReview } from "./model-review";
import {
  RESUME_REVIEW_VERSION,
  resumeReviewSchema,
  type ResumeReview,
  type ReviewCheck,
  type Rewrite,
} from "./report-schema";
import { MAX_EVIDENCE, MODEL_CHECKS, SECTIONS, type CheckResult, type ModelCheckId } from "./types";

const MAX_REWRITES = 8;

/**
 * Checks that are about specific lines. Without a real quote there's nothing
 * to show, so a problem with no verified quote is dropped.
 */
const NEEDS_EVIDENCE = new Set<ModelCheckId>(["writing.typos", "bullets.achievements", "bullets.tense"]);

const NO_PROBLEM_SUMMARY: Partial<Record<ModelCheckId, string>> = {
  "writing.typos": "No spelling or grammar mistakes found.",
  "bullets.achievements": "Your bullets describe what you achieved.",
  "bullets.tense": "Your tenses are consistent.",
};

function modelChecks(model: ModelReview, resume: string): ReviewCheck[] {
  return (Object.entries(MODEL_CHECK_KEYS) as [keyof ModelReview["checks"], ModelCheckId][]).map(([key, id]) => {
    const raw = model.checks[key];
    // Checked against the resume as quoted, then shown without markdown ("**Skills**" → "Skills").
    const evidence = [
      ...new Set(raw.evidence.filter((q) => q.trim() && quoteInResume(q, resume)).map((q) => stripMarkdown(q))),
    ]
      .filter(Boolean)
      .slice(0, MAX_EVIDENCE);
    const unsupported = raw.label !== "good" && NEEDS_EVIDENCE.has(id) && evidence.length === 0;
    return {
      id,
      section: MODEL_CHECKS[id],
      label: unsupported ? "good" : raw.label,
      summary: unsupported ? (NO_PROBLEM_SUMMARY[id] ?? raw.summary) : raw.summary,
      evidence: unsupported || raw.label === "good" ? [] : evidence,
      source: "model",
    };
  });
}

/** Rewrites whose "current" text is really in the resume and that actually change it. */
function verifiedRewrites(model: ModelReview, resume: string): Rewrite[] {
  const seen = new Set<string>();
  return model.rewrites
    .filter((r) => quoteInResume(r.current, resume))
    .map((r) => ({ ...r, current: stripMarkdown(r.current), suggested: stripMarkdown(r.suggested), why: r.why.trim() }))
    .filter((r) => {
      const key = r.current.toLowerCase();
      if (!r.current || !r.suggested || seen.has(key) || r.suggested === r.current) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_REWRITES);
}

export function buildResumeReview(codeChecks: CheckResult[], model: ModelReview, resume: string): ResumeReview {
  const all: ReviewCheck[] = [
    ...codeChecks.map((c) => ({ ...c, source: "code" as const })),
    ...modelChecks(model, resume),
  ];
  // Section order for the slides. The sort is stable, so checks keep their order within a section.
  const checks = all.sort((a, b) => SECTIONS.indexOf(a.section) - SECTIONS.indexOf(b.section));
  const nextSteps = orderFixes(checks);

  return resumeReviewSchema.parse({
    version: RESUME_REVIEW_VERSION,
    overall: {
      label: computeOverallLabel(checks),
      reason: model.reason.trim(),
      topFixes: nextSteps.slice(0, 3),
    },
    checks,
    rewrites: verifiedRewrites(model, resume),
    nextSteps,
  });
}
