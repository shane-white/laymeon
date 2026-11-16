/**
 * The whole resume review: the code checks (LAY-67), then Claude's review
 * (LAY-68), combined into the stored report. The API (LAY-70) calls this.
 */
import { buildResumeReview } from "./build-report";
import { generateModelReview } from "./model-review";
import type { ResumeReview } from "./report-schema";
import { runCodeChecks } from "./run-checks";
import type { CodeCheckInput } from "./types";

export interface ReviewInput extends CodeCheckInput {
  /** The resume's target role (`documents.target_role`), if the user gave one. */
  targetRole: string | null;
}

export async function reviewResume(input: ReviewInput): Promise<ResumeReview> {
  const codeChecks = runCodeChecks(input);
  const model = await generateModelReview(input.markdown, input.targetRole, codeChecks);
  return buildResumeReview(codeChecks, model, input.markdown);
}
