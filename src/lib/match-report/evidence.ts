import type { ModelReport } from "./schema";

/**
 * Normalizes text for evidence matching: lowercases, removes markdown
 * formatting and escapes, unifies quotes and dashes, and collapses whitespace.
 */
export function normalizeText(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\\([\\`*_{}[\]()#+\-.!|>])/g, "$1") // markdown escapes: C\+\+ → C++
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[‐‑‒–—―−]/g, "-")
    .replace(/…/g, "...")
    .replace(/[*_`#>|]/g, " ") // markdown emphasis, headings, quotes, tables
    .replace(/^\s*[-+•]\s+/gm, " ") // list bullets at line start
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * True when the quote appears in the resume after normalization. A quote with
 * "..." is accepted if each part appears in order.
 */
export function quoteInResume(quote: string, resume: string): boolean {
  const normalizedResume = normalizeText(resume);
  const parts = normalizeText(quote)
    .split(/\s*\.\.\.\s*/)
    .map((p) => p.replace(/^[\s"'.,;:]+|[\s"'.,;:]+$/g, ""))
    .filter(Boolean);

  if (parts.length === 0) return false;

  let from = 0;
  for (const part of parts) {
    const index = normalizedResume.indexOf(part, from);
    if (index === -1) return false;
    from = index + part.length;
  }
  return true;
}

function verifiedQuote(quote: string | null, resume: string): string | null {
  if (!quote || !quote.trim()) return null;
  return quoteInResume(quote, resume) ? quote.trim() : null;
}

/**
 * Drops evidence quotes that aren't actually in the resume. A requirement
 * marked Strong without a verified quote is downgraded to Partial, since
 * Strong means "clearly on your resume". Likewise, a screener without a
 * verified quote is marked not shown.
 */
export function verifyEvidence(
  report: ModelReport,
  resume: string,
): Pick<ModelReport, "requirements" | "screeners"> {
  return {
    requirements: report.requirements.map((r) => {
      const evidence = r.match === "missing" ? null : verifiedQuote(r.evidence, resume);
      const match = r.match === "strong" && !evidence ? "partial" : r.match;
      return { ...r, evidence, match };
    }),
    // Same rule for screeners: "Shown" needs a quote that's really there.
    screeners: report.screeners.map((s) => {
      const evidence = verifiedQuote(s.evidence, resume);
      return { ...s, evidence, shown: s.shown && evidence !== null };
    }),
  };
}
