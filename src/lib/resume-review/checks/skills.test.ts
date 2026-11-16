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
    const markdown = `## Skills\n\n- Stakeholder coordination across design, sales, and engineering teams\n- SQL`;
    expect(listedSkills(context({ markdown }))).toEqual(["SQL"]);
  });

  it("reads the tools in parentheses", () => {
    const markdown = `## Skills\n\n- Video editing (Premiere Pro, Camtasia, Articulate)`;
    expect(listedSkills(context({ markdown }))).toEqual(["Video editing", "Premiere Pro", "Camtasia", "Articulate"]);
  });

  it("skips bold and heading subheadings inside Skills", () => {
    const markdown = `## Skills\n\n### Data\n- Tableau\n\n**Development**\n- Languages: Python`;
    expect(listedSkills(context({ markdown }))).toEqual(["Tableau", "Python"]);
  });
});

describe("shown in context", () => {
  it("flags skills that are only in the list", () => {
    const markdown = editResume(["Python, SQL, Kafka, Snowflake, dbt, Airflow", "Python, Tableau, Looker, Excel, Spark, Rust"]);
    const check = result(checks({ markdown, extraction: null }), "skills.shown_in_context");
    // A tools list often has more than the bullets mention, so this is never Fix this.
    expect(check.label).toBe("could_improve");
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

describe("matching listed skills to the experience", () => {
  it("matches either half of 'JavaScript/TypeScript'", () => {
    const markdown = editResume(["Python, SQL, Kafka, Snowflake, dbt, Airflow", "Python, JavaScript/TypeScript"], ["in Python and Kafka", "in TypeScript"]);
    expect(result(checks({ markdown, extraction: null }), "skills.shown_in_context").evidence).toEqual(["Python"]);
  });

  it("matches a descriptive skill by most of its words", () => {
    // "Data quality monitoring" isn't written that way, but "data quality checks" and "monitored" are.
    const markdown = editResume(
      ["Python, SQL, Kafka, Snowflake, dbt, Airflow", "Python, Data quality monitoring, Event-driven architecture"],
      ["- Mentored 3", "- Monitored 12 pipelines; mentored 3"],
    );
    expect(result(checks({ markdown, extraction: null }), "skills.shown_in_context").evidence).toEqual([
      "Event-driven architecture",
    ]);
  });
});

it("doesn't count common words as keyword stuffing", () => {
  const markdown = editResume(
    ["Python, SQL, Kafka, Snowflake, dbt, Airflow", "Python, Development"],
    ["- Mentored 3", `- ${Array(10).fill("development").join(", ")}`],
  );
  expect(result(checks({ markdown }), "skills.repetition").label).toBe("good");
});

it("flags a keyword used more than 8 times", () => {
  const markdown = editResume(["- Mentored 3 junior engineers", `- ${Array(9).fill("Python").join(", ")}`]);
  const check = result(checks({ markdown }), "skills.repetition");
  expect(check.label).toBe("could_improve");
  expect(check.evidence).toEqual(["Python: 11 times"]);
});
