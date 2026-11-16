import { describe, expect, it } from "vitest";
import { context, editResume, result } from "../__fixtures__/helpers";
import { extraction, GOOD_RESUME, position } from "../__fixtures__/resumes";
import type { CodeCheckInput } from "../types";
import { listedSkills, skillChecks } from "./skills";

function checks(p: Partial<CodeCheckInput> = {}) {
  return skillChecks(context(p));
}

it("passes the example resume", () => {
  expect(checks().filter((r) => r.label !== "good")).toEqual([]);
});

it("isn't run without a skills section", () => {
  const markdown = GOOD_RESUME.replace(/## Skills[\s\S]*$/, "");
  expect(checks({ markdown })).toEqual([]);
});

describe("listedSkills", () => {
  it("reads comma, pipe and labeled lists, once each", () => {
    const markdown = `## Experience\n\n- Did things\n\n## Technical Skills\n\n- **Languages:** Python, SQL, R\n- Tools: Tableau | dbt | Excel (advanced)\n- python`;
    expect(listedSkills(context({ markdown }))).toEqual(["Python", "SQL", "R", "Tableau", "dbt", "Excel"]);
  });

  it("skips sentences", () => {
    const markdown = `## Skills\n\nI am a quick learner who enjoys working with data and people, SQL`;
    expect(listedSkills(context({ markdown }))).toEqual(["SQL"]);
  });
});

describe("shown in context", () => {
  it("marks skills only in the list as Fix this", () => {
    const markdown = editResume(["Python, SQL, Kafka, Snowflake, dbt, Airflow", "Python, Tableau, Looker, Excel, Spark, Rust"]);
    const check = result(checks({ markdown, extraction: null }), "skills.shown_in_context");
    expect(check.label).toBe("fix");
    expect(check.evidence).toEqual(["Tableau", "Looker", "Excel", "Spark", "Rust"]);
  });

  it("uses the Career Story to match different wording", () => {
    // The bullets say "Postgres"; the list says "PostgreSQL".
    const markdown = editResume(
      ["Python, SQL, Kafka, Snowflake, dbt, Airflow", "Python, PostgreSQL"],
      ["Wrote SQL models", "Wrote Postgres models"],
    );
    const e = extraction({
      positions: [position({ skills: ["PostgreSQL"] })],
      skills: [{ name: "Postgres", canonicalName: "PostgreSQL", category: "tool", evidence: "" }],
    });
    expect(result(checks({ markdown, extraction: null }), "skills.shown_in_context").evidence).toEqual(["PostgreSQL"]);
    expect(result(checks({ markdown, extraction: e }), "skills.shown_in_context").evidence).toEqual([]);
  });
});

it("flags a keyword used more than 8 times", () => {
  const markdown = editResume(["- Mentored 3 junior engineers", `- ${Array(9).fill("Python").join(", ")}`]);
  const check = result(checks({ markdown }), "skills.repetition");
  expect(check.label).toBe("could_improve");
  expect(check.evidence).toEqual(["Python: 11 times"]);
});
