import { buildContext } from "../context";
import { GOOD_RESUME, input } from "./resumes";
import type { CheckResult, CodeCheckId, CodeCheckInput } from "../types";

export const PDF = "application/pdf";
export const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** The result for one check. Fails the test if the check didn't run. */
export function result(results: CheckResult[], id: CodeCheckId): CheckResult {
  const found = results.find((r) => r.id === id);
  if (!found) throw new Error(`Check ${id} didn't run`);
  return found;
}

/** The example resume with some text replaced. Fails if the text isn't there, so tests don't pass by accident. */
export function editResume(...edits: [string, string][]): string {
  return edits.reduce((md, [from, to]) => {
    if (!md.includes(from)) throw new Error(`The example resume doesn't contain: ${from}`);
    return md.replace(from, to);
  }, GOOD_RESUME);
}

export function context(p: Partial<CodeCheckInput> = {}) {
  return buildContext(input(p));
}
