import { describe, expect, it } from "vitest";
import { context, editResume, result } from "../__fixtures__/helpers";
import { achievements, extraction, position } from "../__fixtures__/resumes";
import type { CodeCheckInput } from "../types";
import { bulletChecks } from "./bullets";

function checks(p: Partial<CodeCheckInput> = {}) {
  return bulletChecks(context(p));
}

/** A resume whose experience is just these bullets. */
function withBullets(bullets: string[]): string {
  return `# Jane Doe\n\njane@example.com\n\n## Experience\n\n### Analyst, Acme\nJan 2020 – Present\n\n${bullets.map((b) => `- ${b}`).join("\n")}\n`;
}

it("passes the example resume", () => {
  expect(checks().filter((r) => r.label !== "good")).toEqual([]);
});

it("suggests bullets for experience written as paragraphs", () => {
  const markdown =
    "# Jane\n\n## Experience\n\n### Analyst, Acme\nJan 2020 – Present\n\nIn this role I built reports for the sales team and worked with finance on the yearly budget, which took most of my time.";
  const results = checks({ markdown, extraction: null });
  expect(result(results, "bullets.present").label).toBe("could_improve");
  // The other bullet checks have nothing to check.
  expect(results.map((r) => r.id)).toEqual(["bullets.present"]);
});

describe("weak openers", () => {
  it("marks mostly duty-style bullets as Fix this", () => {
    const markdown = withBullets(["Responsible for weekly reports", "Helped the sales team", "Built a dashboard used by 40 people"]);
    const check = result(checks({ markdown }), "bullets.weak_openers");
    expect(check.label).toBe("fix");
    expect(check.evidence).toEqual(["Responsible for weekly reports", "Helped the sales team"]);
  });

  it("marks one duty-style bullet as Could improve", () => {
    const markdown = editResume(["- Mentored 3 junior engineers", "- Responsible for mentoring 3 junior engineers"]);
    expect(result(checks({ markdown }), "bullets.weak_openers").label).toBe("could_improve");
  });
});

describe("numbers", () => {
  it("marks bullets with almost no numbers as Fix this", () => {
    const markdown = withBullets(["Built dashboards", "Wrote reports", "Ran meetings", "Trained new hires", "Cut costs by 10%", "Planned events", "Led reviews"]);
    const check = result(checks({ markdown }), "bullets.numbers");
    expect(check.label).toBe("fix");
    expect(check.data).toMatchObject({ withNumbers: 1, bullets: 7 });
  });

  it("counts money, percentages and words like 'doubled'", () => {
    const markdown = withBullets(["Saved $40K", "Doubled sign-ups", "Grew revenue 12%", "Wrote reports"]);
    expect(result(checks({ markdown }), "bullets.numbers").data).toMatchObject({ withNumbers: 3 });
  });

  it("marks some numbers as Could improve", () => {
    const markdown = withBullets(["Saved $40K", "Wrote reports", "Ran meetings", "Trained new hires"]);
    expect(result(checks({ markdown }), "bullets.numbers").label).toBe("could_improve");
  });
});

it("flags bullets longer than two lines", () => {
  const long =
    "Worked closely with product, design, finance, legal and the regional sales teams across three time zones to plan, scope, build, test and eventually launch a brand new internal reporting tool that replaced several older spreadsheets";
  const markdown = withBullets([long, "Saved $40K", "Cut costs 10%"]);
  expect(result(checks({ markdown }), "bullets.length").label).toBe("could_improve");
});

describe("bullets per job (from the Career Story)", () => {
  it("flags a job with more than 8 bullets", () => {
    const e = extraction({ positions: [position({ title: "Analyst", employer: "Acme", achievements: achievements(11) })] });
    const check = result(checks({ extraction: e }), "bullets.per_role");
    expect(check.label).toBe("could_improve");
    expect(check.evidence).toEqual(["Acme (Analyst): 11 bullets"]);
  });

  it("flags a most recent job with no bullets", () => {
    const e = extraction({
      positions: [
        position({ title: "Lead", start: "2023-01", end: "present", achievements: [] }),
        position({ title: "Analyst", start: "2019-01", end: "2022-12", achievements: achievements(4) }),
      ],
    });
    expect(result(checks({ extraction: e }), "bullets.per_role").summary).toMatch(/most recent job has no bullet/);
  });

  it("isn't run without an extraction", () => {
    const ids = checks({ extraction: null }).map((r) => r.id);
    expect(ids).not.toContain("bullets.per_role");
    expect(ids).not.toContain("bullets.detail_by_recency");
  });
});

describe("detail by recency", () => {
  it("flags old jobs with lots of detail", () => {
    const e = extraction({
      positions: [
        position({ title: "Director", start: "2015-01", end: "present", achievements: achievements(5) }),
        position({ title: "Analyst", start: "2005-01", end: "2009-12", achievements: achievements(6) }),
      ],
    });
    const check = result(checks({ extraction: e }), "bullets.detail_by_recency");
    expect(check.label).toBe("could_improve");
    expect(check.evidence).toEqual(["Acme (Analyst): 6 bullets"]);
  });

  it("treats the job that ended last as the most recent, not the one that started last", () => {
    // A long job that ran until recently, and a short side job that started later and ended earlier.
    const e = extraction({
      positions: [
        position({ title: "Side project", start: "2023-09", end: "2024-09", achievements: achievements(3) }),
        position({ title: "Designer", start: "2018-09", end: "2026-01", achievements: achievements(10) }),
      ],
    });
    expect(result(checks({ extraction: e }), "bullets.detail_by_recency").label).toBe("good");
  });

  it("flags a recent job with much less detail than an earlier one", () => {
    const e = extraction({
      positions: [
        position({ title: "Lead", start: "2024-01", end: "present", achievements: achievements(2) }),
        position({ title: "Analyst", start: "2019-01", end: "2023-12", achievements: achievements(7) }),
      ],
    });
    expect(result(checks({ extraction: e }), "bullets.detail_by_recency").summary).toMatch(/most recent job has much less detail/);
  });
});
