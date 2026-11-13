import { describe, expect, it } from "vitest";
import { buildProfile, type ExtractedDocument } from "./build";
import type { Extraction } from "./schema";

const NEW_RESUME = `# Priya Raman

**Senior Data Engineer** — Northwind Logistics (2021-03 – present)

- Built Airflow DAGs that load 2 TB/day from Kafka into Snowflake
- Cut warehouse costs 30% by clustering Snowflake tables
- Mentored 3 junior engineers

**Data Engineer** — Brightside Health (2018 – 2021)

- Developed ETL jobs in Python and PostgreSQL

Skills: Python, Postgres, Snowflake, Airflow

AWS Certified Data Engineer (Amazon Web Services, 2023)

Languages: Spanish (fluent)

B.S. Computer Science, University of Illinois, 2018`;

const OLD_RESUME = `# Priya Raman

**Data Engineer**, Brightside Health Inc. — 2018-06 to 2021-02

- Developed ETL jobs in Python and PostgreSQL for claims data

**Data Intern** — Brightside Health (2017-06 – 2017-08)

Skills: Python, SQL`;

const emptyExtraction: Extraction = {
  headline: "",
  seniority: "unknown",
  positions: [],
  skills: [],
  education: [],
  certifications: [],
  languages: [],
};

function doc(id: string, markdown: string, asOf: string, extraction: Partial<Extraction>): ExtractedDocument {
  return {
    document: { id, name: `${id}.pdf`, type: "resume", markdown, asOf, targetRole: null },
    extraction: { ...emptyExtraction, ...extraction },
  };
}

const position = (p: Partial<Extraction["positions"][number]>): Extraction["positions"][number] => ({
  employer: "",
  title: "",
  titleFamily: "",
  location: "",
  employmentType: "unknown",
  start: "",
  end: "",
  peopleManaged: 0,
  achievements: [],
  skills: [],
  evidence: "",
  ...p,
});

const newDoc = doc("new", NEW_RESUME, "2026-11-01T00:00:00Z", {
  headline: "",
  seniority: "senior",
  positions: [
    position({
      employer: "Northwind Logistics",
      title: "Senior Data Engineer",
      titleFamily: "Data Engineer",
      start: "2021-03",
      end: "present",
      skills: ["Airflow", "Snowflake", "Kafka", "Mentoring"],
      evidence: "Senior Data Engineer** — Northwind Logistics",
      achievements: [
        {
          text: "Cut warehouse costs 30% by clustering Snowflake tables",
          metric: "30% lower warehouse costs",
          evidence: "Cut warehouse costs 30% by clustering Snowflake tables",
        },
        { text: "Invented a quantum database", metric: "", evidence: "Invented a quantum database" },
      ],
    }),
    position({
      employer: "Brightside Health",
      title: "Data Engineer",
      titleFamily: "Data Engineer",
      start: "2018",
      end: "2021",
      skills: ["Python", "PostgreSQL"],
      evidence: "Data Engineer** — Brightside Health",
    }),
  ],
  skills: [
    { name: "Python", canonicalName: "Python", category: "hard_skill", evidence: "Python" },
    { name: "Postgres", canonicalName: "PostgreSQL", category: "tool", evidence: "Postgres" },
    { name: "Snowflake", canonicalName: "Snowflake", category: "tool", evidence: "Snowflake" },
    { name: "Airflow", canonicalName: "Airflow", category: "tool", evidence: "Airflow DAGs" },
    { name: "Kafka", canonicalName: "Kafka", category: "tool", evidence: "from Kafka into Snowflake" },
    { name: "mentoring", canonicalName: "Mentoring", category: "soft_skill", evidence: "Mentored 3 junior engineers" },
    { name: "Rust", canonicalName: "Rust", category: "hard_skill", evidence: "Expert in Rust" },
  ],
  certifications: [
    {
      name: "AWS Certified Data Engineer",
      issuer: "Amazon Web Services",
      issued: "2023",
      expires: "",
      evidence: "AWS Certified Data Engineer (Amazon Web Services, 2023)",
    },
    { name: "PMP", issuer: "", issued: "", expires: "", evidence: "PMP certified" },
  ],
  languages: [{ language: "Spanish", level: "fluent", evidence: "Spanish (fluent)" }],
  education: [
    {
      school: "University of Illinois",
      degree: "B.S.",
      field: "Computer Science",
      start: "",
      end: "2018",
      evidence: "B.S. Computer Science, University of Illinois, 2018",
    },
  ],
});

const oldDoc = doc("old", OLD_RESUME, "2021-03-01T00:00:00Z", {
  seniority: "experienced",
  positions: [
    position({
      employer: "Brightside Health Inc.",
      title: "Data Engineer",
      titleFamily: "Data Engineer",
      location: "Chicago, IL",
      start: "2018-06",
      end: "2021-02",
      skills: ["Python", "PostgreSQL", "SQL"],
      evidence: "Data Engineer**, Brightside Health Inc.",
      achievements: [
        {
          text: "Developed ETL jobs in Python and PostgreSQL for claims data",
          metric: "",
          evidence: "Developed ETL jobs in Python and PostgreSQL for claims data",
        },
      ],
    }),
    position({
      employer: "Brightside Health",
      title: "Data Intern",
      titleFamily: "Data Engineer",
      employmentType: "internship",
      start: "2017-06",
      end: "2017-08",
      evidence: "Data Intern** — Brightside Health",
    }),
  ],
  skills: [
    { name: "Python", canonicalName: "Python", category: "hard_skill", evidence: "Python" },
    { name: "PostgreSQL", canonicalName: "PostgreSQL", category: "tool", evidence: "PostgreSQL" },
    { name: "SQL", canonicalName: "SQL", category: "hard_skill", evidence: "SQL" },
  ],
});

const BUILT_AT = "2026-11-13T00:00:00Z";

describe("buildProfile", () => {
  const profile = buildProfile([oldDoc, newDoc], BUILT_AT);

  it("merges the same job from two résumés, newest first", () => {
    expect(profile.positions.map((p) => p.key)).toEqual([
      "northwind-logistics|data-engineer|2021",
      "brightside-health|data-engineer|2018",
      "brightside-health|data-engineer|2017",
    ]);
    const brightside = profile.positions[1];
    // The newest résumé's dates win; the older one fills in the location.
    expect(brightside.start).toBe("2018");
    expect(brightside.end).toBe("2021");
    expect(brightside.location).toBe("Chicago, IL");
    expect(brightside.evidence.map((e) => e.documentId).sort()).toEqual(["new", "old"]);
  });

  it("doesn't merge an internship into the job after it", () => {
    expect(profile.positions[2].title).toBe("Data Intern");
  });

  it("is the same whatever order the documents come in", () => {
    expect(buildProfile([newDoc, oldDoc], BUILT_AT)).toEqual(profile);
  });

  it("computes months, overlaps counted once", () => {
    const [northwind, brightside, intern] = profile.positions;
    expect(northwind.months).toBe(69); // Mar 2021 – Nov 2026
    expect(northwind.isCurrent).toBe(true);
    expect(brightside.months).toBe(36); // mid-2018 – mid-2021
    expect(intern.months).toBe(3);
    // Mid-2018 – mid-2021 overlaps Mar 2021 – Nov 2026 by 4 months.
    expect(profile.summary.totalMonths).toBe(69 + 36 - 4 + 3);
    expect(profile.summary.currentTitle).toBe("Senior Data Engineer");
    expect(profile.summary.seniority).toBe("senior");
  });

  it("computes years per skill from the positions it was used in", () => {
    const python = profile.skills.find((s) => s.key === "python")!;
    expect(python.months).toBe(36);
    expect(python.lastUsed).toBe("2021-06");
    const airflow = profile.skills.find((s) => s.key === "airflow")!;
    expect(airflow.months).toBe(69);
    expect(airflow.lastUsed).toBe("present");
  });

  it("merges skill aliases", () => {
    const postgres = profile.skills.find((s) => s.key === "postgresql")!;
    expect(postgres.name).toBe("PostgreSQL");
    expect(postgres.aliases).toEqual(["Postgres"]);
  });

  it("drops skills, certifications and accomplishments without a real quote", () => {
    expect(profile.skills.find((s) => s.key === "rust")).toBeUndefined();
    expect(profile.certifications.map((c) => c.name)).toEqual(["AWS Certified Data Engineer"]);
    expect(profile.accomplishments.map((a) => a.text)).toEqual([
      "Cut warehouse costs 30% by clustering Snowflake tables",
      "Developed ETL jobs in Python and PostgreSQL for claims data",
    ]);
  });

  it("only links skills that made it into the profile", () => {
    expect(profile.positions[0].skillKeys).toEqual(["airflow", "kafka", "mentoring", "snowflake"]);
  });

  it("totals experience by role", () => {
    expect(profile.roles).toEqual([
      {
        key: "data-engineer",
        titleFamily: "Data Engineer",
        months: 69 + 36 - 4 + 3,
        positionKeys: profile.positions.map((p) => p.key),
      },
    ]);
  });

  it("ends 'present' on an older résumé at that résumé's date", () => {
    const older = doc("older", "**Analyst** — Contoso (2019-01 – present)", "2020-06-15T00:00:00Z", {
      positions: [
        position({ employer: "Contoso", title: "Analyst", titleFamily: "Analyst", start: "2019-01", end: "present" }),
      ],
    });
    const result = buildProfile([older, newDoc], BUILT_AT);
    const contoso = result.positions.find((p) => p.employer === "Contoso")!;
    expect(contoso.end).toBe("2020-06");
    expect(contoso.isCurrent).toBe(false);
    expect(contoso.months).toBe(18);
  });

  it("builds an empty profile from no documents", () => {
    const empty = buildProfile([], BUILT_AT);
    expect(empty.positions).toEqual([]);
    expect(empty.summary.totalMonths).toBeNull();
  });
});
