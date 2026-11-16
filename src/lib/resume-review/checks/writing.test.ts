import { describe, expect, it } from "vitest";
import { context, editResume, result } from "../__fixtures__/helpers";
import type { CodeCheckInput } from "../types";
import { writingChecks } from "./writing";

function checks(p: Partial<CodeCheckInput> = {}) {
  return writingChecks(context(p));
}

function withBullets(bullets: string[]): string {
  return `# Jane Doe\n\n## Summary\n\nAnalyst.\n\n## Experience\n\n### Analyst, Acme\nJan 2020 – Present\n\n${bullets.map((b) => `- ${b}`).join("\n")}\n`;
}

it("passes the example resume", () => {
  expect(checks().filter((r) => r.label !== "good")).toEqual([]);
});

describe("pronouns", () => {
  it('flags "I" and "my"', () => {
    const markdown = editResume(["Data engineer with", "I am a data engineer with"], ["- Mentored 3", "- My team and I mentored 3"]);
    const check = result(checks({ markdown }), "writing.pronouns");
    expect(check.label).toBe("could_improve");
    expect(check.data?.lines).toBe(2);
  });

  it('ignores job levels like "Engineer I"', () => {
    const markdown = editResume(["- Mentored 3", "- Promoted from Engineer I to Engineer II; mentored 3"]);
    expect(result(checks({ markdown }), "writing.pronouns").label).toBe("good");
  });
});

it("flags clichés", () => {
  const markdown = editResume(["Data engineer with", "Results-driven team player and data engineer with"]);
  const check = result(checks({ markdown }), "writing.cliches");
  expect(check.label).toBe("could_improve");
  expect(check.evidence).toEqual(["results-driven", "team player"]);
});

describe("AI words", () => {
  it("allows one or two", () => {
    const markdown = editResume(["- Built a streaming", "- Leveraged Kafka and built a streaming"]);
    expect(result(checks({ markdown }), "writing.ai_words").label).toBe("good");
  });

  it("flags several", () => {
    const markdown = withBullets([
      "Spearheaded a robust reporting effort",
      "Leveraged data to foster collaboration",
      "Cut costs by 20%",
    ]);
    const check = result(checks({ markdown }), "writing.ai_words");
    expect(check.label).toBe("could_improve");
    expect(check.evidence).toEqual(["Spearheaded a robust reporting effort", "Leveraged data to foster collaboration"]);
  });

  it("marks heavy use as Fix this", () => {
    const markdown = withBullets([
      "Spearheaded a robust, seamless platform",
      "Leveraged cutting-edge tools to foster a holistic culture",
      "Orchestrated a transformative, pivotal shift",
    ]);
    expect(result(checks({ markdown }), "writing.ai_words").label).toBe("fix");
  });
});

it("counts em dashes in the file's own text, not ones Claude added to the markdown", () => {
  const markdown = withBullets(["Built a tool — fast", "Ran a team — well", "Cut costs — 20%"]);
  const software = { format: "docx" as const, text: "Built a tool, fast", pages: null, pageCount: null, images: [], docx: null };
  expect(result(checks({ markdown, software }), "writing.em_dashes").label).toBe("good");
});

it("flags more than two em dashes", () => {
  const markdown = withBullets(["Built a tool — fast", "Ran a team — well", "Cut costs — 20%"]);
  expect(result(checks({ markdown }), "writing.em_dashes")).toMatchObject({ label: "could_improve", data: { count: 3 } });
});

describe("-ing endings", () => {
  it("flags bullets ending in a vague -ing phrase", () => {
    const markdown = withBullets([
      "Rebuilt the onboarding flow, improving the user experience",
      "Ran weekly reviews, ensuring alignment across teams",
      "Wrote documentation, enabling faster handoffs",
      "Cut costs by 20%",
    ]);
    const check = result(checks({ markdown }), "writing.ing_endings");
    expect(check.label).toBe("could_improve");
    expect(check.data?.count).toBe(3);
  });

  it("doesn't count endings with a number, or 'including'", () => {
    const markdown = withBullets([
      "Moved the warehouse to Snowflake, saving $120K a year",
      "Led 4 launches, including the mobile app",
      "Cut wait times by 30%, reducing churn by 5%",
    ]);
    expect(result(checks({ markdown }), "writing.ing_endings").label).toBe("good");
  });
});

describe("repetitive structure", () => {
  it("flags bullets that all start with the same verb", () => {
    const markdown = withBullets(["Led a launch", "Led hiring", "Led a migration", "Led planning", "Built a tool"]);
    const check = result(checks({ markdown }), "writing.repetitive_structure");
    expect(check.label).toBe("could_improve");
    expect(check.summary).toMatch(/4 bullets start with "Led"/);
  });

  it('flags lots of "resulting in"', () => {
    const markdown = withBullets([
      "Rebuilt search, resulting in more sign-ups",
      "Cleaned the data, resulting in better reports",
      "Hired 3 engineers, leading to faster releases",
    ]);
    expect(result(checks({ markdown }), "writing.repetitive_structure").summary).toMatch(/3 use "resulting in"/);
  });
});

describe("consistency", () => {
  it("flags a mix of bullets with and without periods", () => {
    const markdown = withBullets(["Built a tool.", "Ran a team.", "Cut costs by 20%", "Hired 3 people", "Wrote docs", "Led reviews"]);
    expect(result(checks({ markdown }), "writing.consistency").label).toBe("could_improve");
  });

  it("accepts one style used throughout", () => {
    const markdown = withBullets(["Built a tool.", "Ran a team.", "Cut costs by 20%."]);
    expect(result(checks({ markdown }), "writing.consistency").label).toBe("good");
  });

  it("flags bullets starting in lowercase", () => {
    const markdown = withBullets(["built a tool", "ran a team", "Cut costs by 20%"]);
    expect(result(checks({ markdown }), "writing.consistency").summary).toMatch(/2 bullets start with a lowercase letter/);
  });
});
