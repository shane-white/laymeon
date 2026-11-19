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
 * Drops evidence quotes that aren't actually in the resume. Evidence supports
 * a Requirement's rating but doesn't decide it, so a Strong without a verified
 * quote stays Strong. A screener without a verified quote is marked not shown.
 */
export function verifyEvidence(
  report: ModelReport,
  resume: string,
): Pick<ModelReport, "requirements" | "screeners"> {
  return {
    requirements: report.requirements.map((r) => ({
      ...r,
      evidence: r.match === "missing" ? null : verifiedQuote(r.evidence, resume),
    })),
    // Screeners are still decided by Claude: "Shown" needs a quote that's really there.
    screeners: report.screeners.map((s) => {
      const evidence = verifiedQuote(s.evidence, resume);
      return { ...s, evidence, shown: s.shown && evidence !== null };
    }),
  };
}
