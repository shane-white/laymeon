/** Example resumes for the tests. GOOD_RESUME should pass every check. */
import type { Extraction } from "@/lib/profile/schema";
import type { CodeCheckInput } from "../types";

export const GOOD_RESUME = `# Jane Doe

Data Engineer | Austin, TX | jane.doe@example.com | (512) 555-0147 | linkedin.com/in/janedoe

## Summary

Data engineer with 7 years of experience building reliable pipelines for finance and retail teams.

## Experience

### Senior Data Engineer, Lumen Analytics
Jan 2021 – Present

- Built a streaming pipeline in Python and Kafka that cut report delays from 6 hours to 15 minutes
- Led a team of 4 engineers through a move to Snowflake, saving $120K a year
- Designed data quality checks that caught 95% of bad loads before they reached dashboards
- Mentored 3 junior engineers, two of whom were promoted within a year

### Data Engineer, Northwind Retail
Jun 2017 – Dec 2020

- Wrote SQL models in dbt for 40 product and sales reports
- Automated nightly loads with Airflow, removing 10 hours of manual work each week
- Cut warehouse costs by 30% by partitioning the largest tables

## Education

### B.S. Computer Science, University of Texas
Sep 2013 – May 2017

## Skills

Python, SQL, Kafka, Snowflake, dbt, Airflow
`;

/** The same resume as plain lines, the way a simple PDF prints it. */
export const GOOD_RESUME_LINES = GOOD_RESUME.split("\n")
  .map((l) =>
    l
      .replace(/^#+\s+/, "")
      .replace(/^- /, "• ")
      .trim(),
  )
  .filter(Boolean);

type Position = Extraction["positions"][number];

export function position(p: Partial<Position>): Position {
  return {
    employer: "Acme",
    title: "Engineer",
    titleFamily: "Engineer",
    location: "",
    employmentType: "full_time",
    start: "2020-01",
    end: "present",
    peopleManaged: 0,
    achievements: [],
    skills: [],
    evidence: "",
    ...p,
  };
}

export function achievements(count: number): Position["achievements"] {
  return Array.from({ length: count }, (_, i) => ({ text: `Did thing ${i}`, metric: "", evidence: "" }));
}

export function extraction(p: Partial<Extraction> = {}): Extraction {
  return {
    headline: "",
    seniority: "senior",
    positions: [],
    skills: [],
    education: [],
    certifications: [],
    languages: [],
    ...p,
  };
}

export const GOOD_EXTRACTION = extraction({
  positions: [
    position({
      employer: "Lumen Analytics",
      title: "Senior Data Engineer",
      start: "2021-01",
      end: "present",
      achievements: achievements(4),
      skills: ["Python", "Apache Kafka", "Snowflake"],
    }),
    position({
      employer: "Northwind Retail",
      title: "Data Engineer",
      start: "2017-06",
      end: "2020-12",
      achievements: achievements(3),
      skills: ["SQL", "dbt", "Apache Airflow"],
    }),
  ],
  skills: [
    { name: "Python", canonicalName: "Python", category: "hard_skill", evidence: "" },
    { name: "Kafka", canonicalName: "Apache Kafka", category: "tool", evidence: "" },
    { name: "Airflow", canonicalName: "Apache Airflow", category: "tool", evidence: "" },
  ],
  education: [{ school: "University of Texas", degree: "B.S.", field: "Computer Science", start: "2013-09", end: "2017-05", evidence: "" }],
});

export function input(p: Partial<CodeCheckInput> = {}): CodeCheckInput {
  return {
    markdown: GOOD_RESUME,
    filename: "Jane-Doe-Resume.pdf",
    mimeType: "application/pdf",
    software: null,
    extraction: GOOD_EXTRACTION,
    asOf: "2026-11-01",
    ...p,
  };
}
