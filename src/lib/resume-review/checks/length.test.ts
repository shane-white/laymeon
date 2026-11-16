import { describe, expect, it } from "vitest";
import { context, result } from "../__fixtures__/helpers";
import { achievements, extraction, GOOD_RESUME, position } from "../__fixtures__/resumes";
import type { CodeCheckInput, SoftwareView } from "../types";
import { lengthChecks } from "./length";

function pdfView(pageLengths: number[]): SoftwareView {
  const pages = pageLengths.map((n) => "x".repeat(n));
  return { format: "pdf", text: pages.join("\n"), pages, pageCount: pages.length, images: [], docx: null };
}

function checks(p: Partial<CodeCheckInput> = {}) {
  return lengthChecks(context(p));
}

const EARLY_CAREER = extraction({
  positions: [position({ start: "2024-01", end: "present", achievements: achievements(3) })],
});

describe("pages", () => {
  it("isn't run when the page count is unknown", () => {
    expect(checks({ software: null }).map((r) => r.id)).not.toContain("length.pages");
  });

  it("accepts two pages for an experienced person", () => {
    // The example resume has about 10 years of experience.
    expect(result(checks({ software: pdfView([3000, 2500]) }), "length.pages").label).toBe("good");
  });

  it("suggests one page early in a career", () => {
    const check = result(checks({ software: pdfView([3000, 2500]), extraction: EARLY_CAREER }), "length.pages");
    expect(check.label).toBe("could_improve");
    expect(check.summary).toMatch(/one page is expected/);
  });

  it("marks three pages early in a career as Fix this", () => {
    expect(result(checks({ software: pdfView([3000, 3000, 3000]), extraction: EARLY_CAREER }), "length.pages").label).toBe("fix");
  });

  it("flags three pages and marks four as Fix this", () => {
    expect(result(checks({ software: pdfView([3000, 3000, 3000]) }), "length.pages").label).toBe("could_improve");
    expect(result(checks({ software: pdfView([3000, 3000, 3000, 3000]) }), "length.pages").label).toBe("fix");
  });

  it("flags a last page that is mostly empty", () => {
    const check = result(checks({ software: pdfView([3000, 300]) }), "length.pages");
    expect(check.label).toBe("could_improve");
    expect(check.summary).toMatch(/last page is mostly empty/);
  });
});

describe("section order", () => {
  const educationFirst = GOOD_RESUME.replace(
    /(## Experience[\s\S]*?)(## Education[\s\S]*?)(## Skills)/,
    "$2$1$3",
  );

  it("accepts Experience first", () => {
    expect(result(checks(), "length.section_order").label).toBe("good");
  });

  it("suggests Experience first for an experienced person", () => {
    const check = result(checks({ markdown: educationFirst }), "length.section_order");
    expect(check.label).toBe("could_improve");
    expect(check.data?.years).toBe(10);
  });

  it("accepts Education first for a recent graduate", () => {
    const graduate = extraction({
      ...EARLY_CAREER,
      positions: [position({ start: "2015-01", end: "present" })],
      education: [{ school: "UT", degree: "M.S.", field: "", start: "2024-09", end: "2026-05", evidence: "" }],
    });
    expect(result(checks({ markdown: educationFirst, extraction: graduate }), "length.section_order").label).toBe("good");
  });
});
