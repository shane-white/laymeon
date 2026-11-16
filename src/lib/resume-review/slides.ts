/**
 * Turns a stored review into the slide deck (LAY-71). Plain code, so the
 * outline is easy to test; the components only draw it.
 *
 * Outline: Overview, then 1–2 slides per section (a section with no checks
 * is skipped), then What to do next. The extra slides are "What software
 * reads" after Can software read it?, when software misread something, and
 * "Suggested rewrites" after Experience bullets, when there are any.
 */
import { GUIDE_SECTIONS } from "./guide";
import type { Fix, ResumeReview, ReviewCheck, Rewrite } from "./report-schema";
import { SECTIONS, type CheckLabel, type CheckId, type SectionId } from "./types";

/** What the progress bar groups slides by. */
export type SlideGroup = "overview" | SectionId | "next";

interface BaseSlide {
  key: string;
  group: SlideGroup;
  title: string;
}

export type Slide =
  | (BaseSlide & { kind: "overview"; overall: ResumeReview["overall"]; counts: Record<CheckLabel, number> })
  | (BaseSlide & {
      kind: "section";
      section: SectionId;
      /** The worst label in the section. */
      label: CheckLabel;
      why: string;
      problems: ReviewCheck[];
      info: ReviewCheck[];
      good: ReviewCheck[];
    })
  | (BaseSlide & { kind: "software"; checks: ReviewCheck[] })
  | (BaseSlide & { kind: "rewrites"; rewrites: Rewrite[] })
  | (BaseSlide & { kind: "next"; fixes: Fix[] });

const SEVERITY: Record<CheckLabel, number> = { fix: 3, could_improve: 2, info: 1, good: 0 };

/** Checks where software read the file differently from a person: shown side by side. */
const SOFTWARE_VIEW_CHECKS: CheckId[] = [
  "readability.text_layer",
  "readability.reading_order",
  "readability.missing_content",
  "readability.hidden_text",
  "readability.contact_readable",
  "readability.layout_elements",
  "readability.header_footer",
];

export function worstLabel(checks: Pick<ReviewCheck, "label">[]): CheckLabel {
  return checks.reduce<CheckLabel>((worst, c) => (SEVERITY[c.label] > SEVERITY[worst] ? c.label : worst), "good");
}

export const GROUP_TITLES: Record<SlideGroup, string> = {
  overview: "Overview",
  ...(Object.fromEntries(GUIDE_SECTIONS.map((s) => [s.id, s.title])) as Record<SectionId, string>),
  next: "What to do next",
};

export function buildSlides(review: ResumeReview): Slide[] {
  const counts: Record<CheckLabel, number> = { fix: 0, could_improve: 0, info: 0, good: 0 };
  for (const c of review.checks) counts[c.label]++;

  const slides: Slide[] = [
    { kind: "overview", key: "overview", group: "overview", title: "Overview", overall: review.overall, counts },
  ];

  for (const section of SECTIONS) {
    const checks = review.checks.filter((c) => c.section === section);
    if (checks.length === 0) continue;
    const bySeverity = (a: ReviewCheck, b: ReviewCheck) => SEVERITY[b.label] - SEVERITY[a.label];
    slides.push({
      kind: "section",
      key: section,
      group: section,
      section,
      title: GROUP_TITLES[section],
      label: worstLabel(checks),
      why: GUIDE_SECTIONS.find((s) => s.id === section)?.intro ?? "",
      problems: checks.filter((c) => c.label === "fix" || c.label === "could_improve").sort(bySeverity),
      info: checks.filter((c) => c.label === "info"),
      good: checks.filter((c) => c.label === "good"),
    });

    if (section === "readability") {
      const misread = checks.filter(
        (c) => SOFTWARE_VIEW_CHECKS.includes(c.id) && c.label !== "good" && c.evidence.length > 0,
      );
      if (misread.length) {
        slides.push({ kind: "software", key: "software", group: section, title: "What software reads", checks: misread });
      }
    }
    if (section === "bullets" && review.rewrites.length) {
      slides.push({
        kind: "rewrites",
        key: "rewrites",
        group: section,
        title: "Suggested rewrites",
        rewrites: review.rewrites,
      });
    }
  }

  slides.push({ kind: "next", key: "next", group: "next", title: "What to do next", fixes: review.nextSteps });
  return slides;
}

/** The progress bar's segments: one per group, with the slides it covers. */
export function slideGroups(slides: Slide[]): { group: SlideGroup; title: string; first: number; count: number }[] {
  const groups: { group: SlideGroup; title: string; first: number; count: number }[] = [];
  slides.forEach((slide, index) => {
    const last = groups.at(-1);
    if (last?.group === slide.group) last.count++;
    else groups.push({ group: slide.group, title: GROUP_TITLES[slide.group], first: index, count: 1 });
  });
  return groups;
}

/** Splits text into plain parts and [placeholders], so the UI can highlight what the user fills in. */
export function splitPlaceholders(text: string): { text: string; placeholder: boolean }[] {
  return text
    .split(/(\[[^\]]+\])/)
    .filter(Boolean)
    .map((part) => ({ text: part, placeholder: /^\[[^\]]+\]$/.test(part) }));
}
