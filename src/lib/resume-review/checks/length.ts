/** Page count and section order. */
import { parseProfileDate } from "@/lib/profile/dates";
import { check, plural, type CheckContext } from "../context";
import type { CheckResult } from "../types";

// Under this many years of experience, one page is expected.
const EARLY_CAREER_YEARS = 5;
// A last page with less than this share of a full page's text looks unfinished.
const SHORT_LAST_PAGE = 0.3;
// Experience before Education once someone has this many years of work.
const EXPERIENCE_FIRST_YEARS = 3;

export function lengthChecks(ctx: CheckContext): CheckResult[] {
  const results: CheckResult[] = [];
  const pages = pageCheck(ctx);
  if (pages) results.push(pages);
  const order = sectionOrder(ctx);
  if (order) results.push(order);
  return results;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function pageCheck(ctx: CheckContext): CheckResult | null {
  const software = ctx.input.software;
  const pageCount = software?.pageCount;
  if (!pageCount) return null;

  const years = ctx.yearsOfExperience;
  const early = years !== null && years < EARLY_CAREER_YEARS;
  const data: CheckResult["data"] = { pages: pageCount, ...(years !== null ? { years: Math.round(years) } : {}) };
  const pagesText = plural(pageCount, "page");

  if (early && pageCount >= 2) {
    return check(
      "length.pages",
      pageCount >= 3 ? "fix" : "could_improve",
      `This resume is ${pagesText}. With under ${EARLY_CAREER_YEARS} years of experience, one page is expected. Keep your strongest, most relevant points.`,
      [],
      data,
    );
  }
  if (pageCount >= 3) {
    return check(
      "length.pages",
      pageCount >= 4 ? "fix" : "could_improve",
      `This resume is ${pagesText}. Two pages is plenty for most people. Longer resumes are usual only for academic or government jobs.`,
      [],
      data,
    );
  }

  // A second page with a few lines on it looks like it spilled over.
  const pageTexts = software.pages;
  if (pageTexts && pageTexts.length >= 2) {
    const lengths = pageTexts.map((p) => p.replace(/\s+/g, "").length);
    const fullPage = median(lengths.slice(0, -1));
    const last = lengths.at(-1)!;
    if (fullPage > 0 && last / fullPage < SHORT_LAST_PAGE) {
      return check(
        "length.pages",
        "could_improve",
        "Your last page is mostly empty. Trim a few lines to fit one page less, or add detail so it's worth the extra page.",
        [],
        { ...data, lastPageShare: Number((last / fullPage).toFixed(2)) },
      );
    }
  }
  return check("length.pages", "good", `${pagesText[0].toUpperCase()}${pagesText.slice(1)} suits your experience.`, [], data);
}

/** True when the person is studying, or finished in the last year. */
function isRecentGraduate(ctx: CheckContext): boolean {
  const asOfYear = Math.floor(ctx.asOf / 12);
  return (ctx.input.extraction?.education ?? []).some((e) => {
    if (e.end?.trim().toLowerCase() === "present") return true;
    const end = parseProfileDate(e.end);
    return end !== null && end.year >= asOfYear - 1;
  });
}

function sectionOrder(ctx: CheckContext): CheckResult | null {
  const kinds = ctx.resume.sections.map((s) => s.kind);
  const experience = kinds.indexOf("experience");
  const education = kinds.indexOf("education");
  if (experience === -1 || education === -1) return null;
  if (experience < education) {
    return check("length.section_order", "good", "Experience comes before Education.");
  }
  const years = ctx.yearsOfExperience;
  if (years === null || isRecentGraduate(ctx) || years < EXPERIENCE_FIRST_YEARS) {
    return check("length.section_order", "good", "Education first suits someone early in their career.");
  }
  return check(
    "length.section_order",
    "could_improve",
    `You have about ${Math.round(years)} years of experience, so put Experience before Education. Recruiters look for your recent work first.`,
    [],
    { years: Math.round(years) },
  );
}
