import type { MatchReport } from "./schema";

const LABELS = {
  overall: { strong: "Strong match", partial: "Partial match", weak: "Weak match" },
  match: { strong: "Strong", partial: "Partial", missing: "Missing" },
  importance: { must_have: "Must-have", nice_to_have: "Nice-to-have" },
  searchWord: { found: "Found", similar: "Similar wording", not_found: "Not found" },
  similarity: { same_meaning: "same thing, different wording", related: "related, but not the same" },
} as const;

/** Compact markdown rendering of a match report, for use as model context. */
export function formatMatchReportForPrompt(report: MatchReport): string {
  const lines: string[] = [
    `**Overall:** ${LABELS.overall[report.overall.label]}. ${report.overall.reason}`,
  ];

  if (report.overall.topFixes.length) {
    lines.push("", "**Top fixes:**", ...report.overall.topFixes.map((f) => `- ${f}`));
  }

  if (report.screeners.length) {
    lines.push(
      "",
      "**Could screen you out:**",
      ...report.screeners.map((s) => `- ${s.item}: ${s.shown ? "Shown" : "Not shown"}`),
    );
  }

  lines.push(
    "",
    "**Requirements:**",
    ...report.requirements.map(
      (r) =>
        `- ${r.text} (${LABELS.importance[r.importance]}): ${LABELS.match[r.match]}` +
        (r.evidence ? ` — "${r.evidence}"` : "") +
        (r.action ? ` — ${r.action}` : ""),
    ),
    "",
    "**Search words:**",
    ...report.searchWords.map(
      (w) =>
        `- ${w.term}: ${LABELS.searchWord[w.status]}` +
        (w.status === "similar" && w.resumeWording
          ? ` (resume says "${w.resumeWording}"${w.similarity ? `, ${LABELS.similarity[w.similarity]}` : ""})`
          : ""),
    ),
    "",
    `**First impression:** ${report.firstImpression}`,
  );

  if (report.nextSteps.length) {
    lines.push(
      "",
      "**What to do next:**",
      ...report.nextSteps.map((s, i) => `${i + 1}. ${s.text} (${s.relatesTo})`),
    );
  }

  return lines.join("\n");
}
