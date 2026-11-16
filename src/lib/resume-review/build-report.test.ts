import { describe, expect, it } from "vitest";
import { buildResumeReview } from "./build-report";
import { GOOD_RESUME, input } from "./__fixtures__/resumes";
import type { ModelReview } from "./model-review";
import { runCodeChecks } from "./run-checks";
import { SECTIONS, type CheckResult } from "./types";

const good = (summary = "Looks good.") => ({ label: "good" as const, summary, evidence: [] });

function modelReview(p: Partial<ModelReview["checks"]> = {}, rewrites: ModelReview["rewrites"] = []): ModelReview {
  return {
    reason: "A clear, well-organized resume with strong numbers.",
    checks: {
      headline: good(),
      summary: good(),
      topThird: good(),
      achievements: good(),
      tense: good(),
      acronyms: good(),
      skillsList: good(),
      typos: good(),
      ...p,
    },
    rewrites,
  };
}

const codeChecks = runCodeChecks(input());

describe("buildResumeReview", () => {
  it("is Ready to send for a good resume, with every check in section order", () => {
    const review = buildResumeReview(codeChecks, modelReview(), GOOD_RESUME);
    expect(review.overall).toEqual({ label: "ready", reason: "A clear, well-organized resume with strong numbers.", topFixes: [] });
    expect(review.checks).toHaveLength(codeChecks.length + 8);
    const order = review.checks.map((c) => SECTIONS.indexOf(c.section));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(review.checks.find((c) => c.id === "first_impression.headline")?.source).toBe("model");
    expect(review.checks.find((c) => c.id === "readability.dates")?.source).toBe("code");
  });

  it("keeps only quotes that are in the resume", () => {
    const review = buildResumeReview(
      codeChecks,
      modelReview({
        acronyms: {
          label: "could_improve",
          summary: "Write out ELT once.",
          evidence: ["Wrote SQL models in dbt", "A quote that isn't there"],
        },
      }),
      GOOD_RESUME,
    );
    expect(review.checks.find((c) => c.id === "skills.acronyms")?.evidence).toEqual(["Wrote SQL models in dbt"]);
  });

  it("shows quotes without markdown", () => {
    const review = buildResumeReview(
      codeChecks,
      modelReview({ acronyms: { label: "could_improve", summary: "x", evidence: ["**Skills**", "Skills"] } }),
      GOOD_RESUME,
    );
    expect(review.checks.find((c) => c.id === "skills.acronyms")?.evidence).toEqual(["Skills"]);
  });

  it("drops a typo claim with no real quote", () => {
    const review = buildResumeReview(
      codeChecks,
      modelReview({ typos: { label: "fix", summary: 'Fix "recieved".', evidence: ["recieved the award"] } }),
      GOOD_RESUME,
    );
    expect(review.checks.find((c) => c.id === "writing.typos")).toMatchObject({
      label: "good",
      summary: "No spelling or grammar mistakes found.",
      evidence: [],
    });
    expect(review.overall.label).toBe("ready");
  });

  it("keeps a problem about something missing, which has nothing to quote", () => {
    const review = buildResumeReview(
      codeChecks,
      modelReview({ headline: { label: "could_improve", summary: "Add a job title under your name.", evidence: [] } }),
      GOOD_RESUME,
    );
    expect(review.checks.find((c) => c.id === "first_impression.headline")?.label).toBe("could_improve");
    expect(review.overall.topFixes).toEqual([
      { checkId: "first_impression.headline", label: "could_improve", text: "Add a job title under your name." },
    ]);
  });

  it("orders fixes from code and Claude together, and puts the first 3 on the overview", () => {
    const problems: CheckResult[] = [
      { id: "writing.cliches", section: "writing", label: "could_improve", summary: "Drop clichés.", evidence: [] },
      { id: "readability.reading_order", section: "readability", label: "fix", summary: "Use one column.", evidence: [] },
      { id: "bullets.numbers", section: "bullets", label: "fix", summary: "Add numbers.", evidence: [] },
    ];
    const review = buildResumeReview(
      problems,
      modelReview({ typos: { label: "fix", summary: "Fix the typo.", evidence: ["Cut warehouse costs by 30%"] } }),
      GOOD_RESUME,
    );
    expect(review.nextSteps.map((f) => f.checkId)).toEqual([
      "readability.reading_order",
      "writing.typos",
      "bullets.numbers",
      "writing.cliches",
    ]);
    expect(review.overall.topFixes).toHaveLength(3);
    expect(review.overall.label).toBe("needs_work");
  });

  it("keeps rewrites of real lines that change something, once each", () => {
    const review = buildResumeReview(
      codeChecks,
      modelReview({}, [
        {
          checkId: "bullets.numbers",
          current: "Wrote SQL models in dbt for 40 product and sales reports",
          suggested: "Built 40 dbt models that cut report prep time by [X] hours a week",
          why: "Shows the result.",
        },
        { checkId: "bullets.numbers", current: "Wrote SQL models in dbt for 40 product and sales reports", suggested: "Again", why: "" },
        { checkId: "writing.cliches", current: "A line that isn't in the resume", suggested: "Better", why: "" },
        { checkId: "writing.cliches", current: "Mentored 3 junior engineers", suggested: "Mentored 3 junior engineers", why: "" },
      ]),
      GOOD_RESUME,
    );
    expect(review.rewrites.map((r) => r.suggested)).toEqual(["Built 40 dbt models that cut report prep time by [X] hours a week"]);
  });

  it("keeps at most 8 rewrites", () => {
    const lines = Array.from({ length: 10 }, (_, i) => `Ran project number ${i + 1} for the team`);
    const resume = `## Experience\n\n${lines.map((l) => `- ${l}`).join("\n")}`;
    const rewrites = lines.map((current) => ({ checkId: "bullets.numbers" as const, current, suggested: `${current} [X]`, why: "" }));
    expect(buildResumeReview([], modelReview({}, rewrites), resume).rewrites).toHaveLength(8);
  });
});
