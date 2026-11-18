/**
 * Turns a stored review into a prompt for an AI assistant that can see the
 * resume, such as Gemini in Google Docs (LAY-75). People copy it from the
 * "What to do next" slide and make the changes where their resume lives.
 */
import type { ResumeReview } from "./report-schema";
import { GROUP_TITLES } from "./slides";
import { SECTIONS, type CheckLabel } from "./types";

const LABEL_WORDS: Record<CheckLabel, string> = {
  fix: "Fix",
  could_improve: "Could improve",
  info: "Note",
  good: "Good",
};

export function buildReviewPrompt(review: ResumeReview, resumeName: string): string {
  const lines: string[] = [
    `Please help me revise my resume, "${resumeName}". You can see it. A resume review found the points below. Work through them in order.`,
    "",
    "Rules:",
    "- Only use facts that are already in my resume. Don't invent jobs, numbers, skills or results.",
    "- Text in [brackets] is a detail only I know. Ask me for it, or leave that part out. Never guess it.",
    "- Keep my formatting and layout unless a point below is about them.",
    "- Some points are about the file itself, such as its format, file name or layout. If you can't change those, tell me what to change by hand.",
    "- Suggest your changes one section at a time, and wait for my OK before you make them.",
  ];

  lines.push("", "## What to fix, most important first", "");
  if (review.nextSteps.length) {
    review.nextSteps.forEach((fix, i) => lines.push(`${i + 1}. [${LABEL_WORDS[fix.label]}] ${fix.text}`));
  } else {
    lines.push("The review found nothing to fix. Point out anything that would still make it stronger.");
  }

  const details: string[] = [];
  for (const section of SECTIONS) {
    const checks = review.checks.filter((c) => c.section === section && c.label !== "good");
    if (!checks.length) continue;
    details.push("", `### ${GROUP_TITLES[section]}`);
    for (const c of checks) {
      details.push(`- [${LABEL_WORDS[c.label]}] ${c.summary}`);
      for (const e of c.evidence) details.push(`  - "${e}"`);
    }
  }
  if (details.length) {
    lines.push("", "## Details from the review", "", "Quoted lines are where the review found each point.", ...details);
  }

  if (review.rewrites.length) {
    lines.push(
      "",
      "## Suggested rewrites",
      "",
      "Stronger versions of some of my lines. Use each one only if it's true for me.",
    );
    for (const r of review.rewrites) {
      lines.push("", `- Current: "${r.current}"`, `  Suggested: "${r.suggested}"`, `  Why: ${r.why}`);
    }
  }

  return lines.join("\n") + "\n";
}
