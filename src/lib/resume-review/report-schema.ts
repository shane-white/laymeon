/**
 * The stored resume review (LAY-68): the code checks and Claude's checks
 * combined, with the overall label and the fixes in priority order. The
 * slides (LAY-71) are built from this. It stores check IDs, never source
 * links, so "Read further" links can change without re-running reviews.
 */
import { z } from "zod";
import { CHECK_IDS, SECTIONS } from "./types";

/** Bump when the report's shape changes. */
export const RESUME_REVIEW_VERSION = 1;

export const checkIdSchema = z.enum(CHECK_IDS);
export const overallLabelSchema = z.enum(["ready", "few_fixes", "needs_work"]);
export const checkLabelSchema = z.enum(["good", "could_improve", "fix", "info"]);

export const reviewCheckSchema = z.object({
  id: checkIdSchema,
  section: z.enum(SECTIONS),
  label: checkLabelSchema,
  summary: z.string(),
  evidence: z.array(z.string()),
  data: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  /** "code" checks always give the same result; "model" checks are Claude's judgment. */
  source: z.enum(["code", "model"]),
});

/** One thing to fix, for the overview and "What to do next" slides. */
export const fixSchema = z.object({
  checkId: checkIdSchema,
  label: z.enum(["could_improve", "fix"]),
  text: z.string(),
});

export const rewriteSchema = z.object({
  /** The check this rewrite addresses. */
  checkId: checkIdSchema,
  /** Copied from the resume. */
  current: z.string(),
  /** The suggested text. The UI shows it as "If true, try…". [Brackets] mark details only the user knows. */
  suggested: z.string(),
  why: z.string(),
});

export const resumeReviewSchema = z.object({
  version: z.literal(RESUME_REVIEW_VERSION),
  overall: z.object({
    label: overallLabelSchema,
    reason: z.string(),
    topFixes: z.array(fixSchema).max(3),
  }),
  /** Every check that ran, in section order. */
  checks: z.array(reviewCheckSchema),
  rewrites: z.array(rewriteSchema).max(8),
  /** Every fix, most important first. */
  nextSteps: z.array(fixSchema),
});

export type ResumeReview = z.infer<typeof resumeReviewSchema>;
export type ReviewCheck = z.infer<typeof reviewCheckSchema>;
export type Fix = z.infer<typeof fixSchema>;
export type Rewrite = z.infer<typeof rewriteSchema>;
export type OverallLabel = z.infer<typeof overallLabelSchema>;
