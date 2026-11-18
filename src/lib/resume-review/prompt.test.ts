import { describe, expect, it } from "vitest";
import { buildReviewPrompt } from "./prompt";
import { RESUME_REVIEW_VERSION, type ResumeReview } from "./report-schema";

const REVIEW: ResumeReview = {
  version: RESUME_REVIEW_VERSION,
  overall: { label: "few_fixes", reason: "r", topFixes: [] },
  checks: [
    { id: "readability.headings", section: "readability", label: "good", summary: "Headings read fine", evidence: [], source: "code" },
    {
      id: "bullets.numbers",
      section: "bullets",
      label: "fix",
      summary: "Few bullets have numbers",
      evidence: ["Led the team"],
      source: "code",
    },
    { id: "questions.gaps", section: "questions", label: "info", summary: "A gap in 2021", evidence: [], source: "code" },
  ],
  rewrites: [
    { checkId: "bullets.numbers", current: "Led the team", suggested: "Led a team of [number]", why: "Shows scale" },
  ],
  nextSteps: [
    { checkId: "bullets.numbers", label: "fix", text: "Add numbers to your bullets" },
    { checkId: "bullets.weak_openers", label: "could_improve", text: "Start bullets with verbs" },
  ],
};

describe("buildReviewPrompt", () => {
  const prompt = buildReviewPrompt(REVIEW, "Jane resume");

  it("names the resume and tells the assistant not to invent facts", () => {
    expect(prompt).toContain('"Jane resume"');
    expect(prompt).toContain("Don't invent");
    expect(prompt).toContain("[brackets]");
  });

  it("lists the fixes in order with their labels", () => {
    expect(prompt).toContain("1. [Fix] Add numbers to your bullets\n2. [Could improve] Start bullets with verbs");
  });

  it("includes findings with evidence by section, and leaves out good checks", () => {
    expect(prompt).toContain('### Experience bullets\n- [Fix] Few bullets have numbers\n  - "Led the team"');
    expect(prompt).toContain("- [Note] A gap in 2021");
    expect(prompt).not.toContain("Headings read fine");
    expect(prompt).not.toContain("Can software read it?");
  });

  it("includes the rewrites", () => {
    expect(prompt).toContain('Current: "Led the team"\n  Suggested: "Led a team of [number]"\n  Why: Shows scale');
  });

  it("says when there is nothing to fix and skips empty parts", () => {
    const clean = buildReviewPrompt({ ...REVIEW, checks: [], rewrites: [], nextSteps: [] }, "R");
    expect(clean).toContain("nothing to fix");
    expect(clean).not.toContain("## Details");
    expect(clean).not.toContain("## Suggested rewrites");
  });
});
