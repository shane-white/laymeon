/**
 * Runs every resume review check that works in code (LAY-67). The same input
 * always gives the same results. The Claude review (LAY-68) adds the checks
 * that need judgment, and uses these results as input.
 *
 * Checks that don't apply are left out: for example the reading order check
 * for a .docx, or the gap check when there's no Career Story extraction.
 */
import { buildContext } from "./context";
import { basicsChecks } from "./checks/basics";
import { bulletChecks } from "./checks/bullets";
import { lengthChecks } from "./checks/length";
import { questionChecks } from "./checks/questions";
import { readabilityChecks } from "./checks/readability";
import { skillChecks } from "./checks/skills";
import { writingChecks } from "./checks/writing";
import type { CheckResult, CodeCheckInput } from "./types";

export function runCodeChecks(input: CodeCheckInput): CheckResult[] {
  const ctx = buildContext(input);
  return [
    ...readabilityChecks(ctx),
    ...basicsChecks(ctx),
    ...bulletChecks(ctx),
    ...skillChecks(ctx),
    ...writingChecks(ctx),
    ...lengthChecks(ctx),
    ...questionChecks(ctx),
  ];
}
