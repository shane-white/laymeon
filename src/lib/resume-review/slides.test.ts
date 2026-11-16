import { describe, expect, it } from "vitest";
import type { ResumeReview, ReviewCheck } from "./report-schema";
import { RESUME_REVIEW_VERSION } from "./report-schema";
import { buildSlides, slideGroups, splitPlaceholders, worstLabel } from "./slides";

const check = (p: Partial<ReviewCheck> & Pick<ReviewCheck, "id" | "section">): ReviewCheck => ({
  label: "good",
  summary: "ok",
  evidence: [],
  source: "code",
  ...p,
});

function review(checks: ReviewCheck[], rewrites: ResumeReview["rewrites"] = []): ResumeReview {
  return {
    version: RESUME_REVIEW_VERSION,
    overall: { label: "few_fixes", reason: "r", topFixes: [] },
    checks,
    rewrites,
    nextSteps: [],
  };
}

const BASE = [
  check({ id: "readability.headings", section: "readability" }),
  check({ id: "basics.contact", section: "basics" }),
  check({ id: "bullets.numbers", section: "bullets", label: "fix", summary: "Add numbers" }),
  check({ id: "bullets.length", section: "bullets" }),
  check({ id: "bullets.weak_openers", section: "bullets", label: "could_improve" }),
  check({ id: "questions.gaps", section: "questions", label: "info" }),
];

describe("buildSlides", () => {
  it("has an overview, one slide per section with checks, and What to do next", () => {
    const slides = buildSlides(review(BASE));
    expect(slides.map((s) => s.key)).toEqual(["overview", "readability", "basics", "bullets", "questions", "next"]);
  });

  it("puts problems first, worst first, and labels the section by its worst check", () => {
    const bullets = buildSlides(review(BASE)).find((s) => s.key === "bullets");
    expect(bullets).toMatchObject({ kind: "section", label: "fix", title: "Experience bullets" });
    if (bullets?.kind !== "section") throw new Error("not a section");
    expect(bullets.problems.map((c) => c.id)).toEqual(["bullets.numbers", "bullets.weak_openers"]);
    expect(bullets.good.map((c) => c.id)).toEqual(["bullets.length"]);
  });

  it("adds What software reads when software misread something it can show", () => {
    const misread = check({
      id: "readability.reading_order",
      section: "readability",
      label: "fix",
      evidence: ["Summary Python, SQL"],
    });
    const slides = buildSlides(review([misread, ...BASE]));
    expect(slides.map((s) => s.key).slice(0, 3)).toEqual(["overview", "readability", "software"]);
    expect(slides[2]).toMatchObject({ kind: "software", group: "readability" });
  });

  it("doesn't add it for problems with nothing to show side by side", () => {
    const noEvidence = check({ id: "readability.dates", section: "readability", label: "fix" });
    expect(buildSlides(review([noEvidence, ...BASE])).map((s) => s.key)).not.toContain("software");
  });

  it("adds Suggested rewrites after the bullets slide", () => {
    const rewrites = [{ checkId: "bullets.numbers" as const, current: "a", suggested: "b [X]", why: "c" }];
    const keys = buildSlides(review(BASE, rewrites)).map((s) => s.key);
    expect(keys.slice(keys.indexOf("bullets"), keys.indexOf("bullets") + 2)).toEqual(["bullets", "rewrites"]);
  });

  it("counts every label for the overview", () => {
    const overview = buildSlides(review(BASE))[0];
    expect(overview).toMatchObject({ kind: "overview", counts: { fix: 1, could_improve: 1, info: 1, good: 3 } });
  });
});

it("slideGroups gives one progress segment per section, covering its extra slides", () => {
  const rewrites = [{ checkId: "bullets.numbers" as const, current: "a", suggested: "b", why: "c" }];
  const groups = slideGroups(buildSlides(review(BASE, rewrites)));
  expect(groups.map((g) => [g.group, g.first, g.count])).toEqual([
    ["overview", 0, 1],
    ["readability", 1, 1],
    ["basics", 2, 1],
    ["bullets", 3, 2],
    ["questions", 5, 1],
    ["next", 6, 1],
  ]);
});

it("worstLabel treats Information as worse than Good but not a problem", () => {
  expect(worstLabel([{ label: "good" }, { label: "info" }])).toBe("info");
  expect(worstLabel([{ label: "info" }, { label: "could_improve" }])).toBe("could_improve");
  expect(worstLabel([])).toBe("good");
});

it("splitPlaceholders marks [placeholders]", () => {
  expect(splitPlaceholders("Cut costs by [X]% for [number] teams")).toEqual([
    { text: "Cut costs by ", placeholder: false },
    { text: "[X]", placeholder: true },
    { text: "% for ", placeholder: false },
    { text: "[number]", placeholder: true },
    { text: " teams", placeholder: false },
  ]);
});
