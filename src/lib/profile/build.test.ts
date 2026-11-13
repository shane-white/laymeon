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
    expect(empty.conflicts).toEqual([]);
  });

  it("records no conflicts when résumés only differ in precision", () => {
    expect(profile.conflicts).toEqual([]);
  });
});

function typed(
  type: "cover_letter" | "project",
  id: string,
  markdown: string,
  asOf: string,
  extraction: Partial<Extraction>,
): ExtractedDocument {
  const d = doc(id, markdown, asOf, extraction);
  return { ...d, document: { ...d.document, type } };
}

describe("buildProfile with cover letters and projects", () => {
  const PROJECT = `# Finance reporting in dbt

At Northwind Logistics I rebuilt our finance reporting in dbt and React.js, so month-end close took 2 days instead of 5.`;

  const project = typed("project", "project", PROJECT, "2026-11-10T00:00:00Z", {
    positions: [
      position({
        employer: "Northwind Logistics",
        title: "",
        titleFamily: "",
        // A project's dates aren't the job's dates and must not change them.
        start: "2024-01",
        end: "2024-06",
        skills: ["dbt", "React"],
        evidence: "At Northwind Logistics",
        achievements: [
          {
            text: "Rebuilt finance reporting in dbt so month-end close took 2 days instead of 5",
            metric: "month-end close 2 days instead of 5",
            evidence: "so month-end close took 2 days instead of 5",
          },
        ],
      }),
    ],
    skills: [
      { name: "dbt", canonicalName: "dbt", category: "tool", evidence: "rebuilt our finance reporting in dbt" },
      { name: "React.js", canonicalName: "React.js", category: "tool", evidence: "React.js" },
    ],
  });

  const LETTER = `Dear hiring team,

At Globex I led a support team of six. I also once cleaned up a messy data warehouse.

I'd love to bring this to your Staff Engineer role at Initech.`;

  const letter = typed("cover_letter", "letter", LETTER, "2026-11-11T00:00:00Z", {
    positions: [
      position({
        employer: "Globex",
        title: "Support Lead",
        titleFamily: "Support Lead",
        peopleManaged: 6,
        evidence: "At Globex I led a support team of six",
        skills: ["Team Leadership"],
      }),
      position({
        employer: "",
        title: "",
        titleFamily: "",
        achievements: [
          {
            text: "Cleaned up a messy data warehouse",
            metric: "",
            evidence: "I also once cleaned up a messy data warehouse",
          },
        ],
      }),
      // Named, but its quote isn't in the letter: ignored.
      position({ employer: "Initech", title: "Staff Engineer", titleFamily: "Engineer", evidence: "I worked at Initech" }),
    ],
    skills: [
      { name: "team leadership", canonicalName: "Team Leadership", category: "soft_skill", evidence: "led a support team of six" },
    ],
  });

  const resumeWithReact = doc(
    "react-resume",
    `${NEW_RESUME}\n\nAlso: React`,
    "2026-11-01T00:00:00Z",
    {
      ...newDoc.extraction,
      skills: [
        ...newDoc.extraction.skills,
        { name: "React", canonicalName: "React", category: "tool", evidence: "Also: React" },
      ],
    },
  );

  const profile = buildProfile([oldDoc, resumeWithReact, project, letter], BUILT_AT);
  const northwind = profile.positions.find((p) => p.employer === "Northwind Logistics")!;

  it("attaches a project to the résumé job at the same employer without changing its dates", () => {
    expect(profile.positions.filter((p) => p.employer === "Northwind Logistics")).toHaveLength(1);
    expect(northwind.start).toBe("2021-03");
    expect(northwind.end).toBe("present");
    expect(northwind.skillKeys).toContain("dbt");
    expect(profile.conflicts).toEqual([]);
  });

  it("counts a project's skills toward the job's years", () => {
    expect(profile.skills.find((s) => s.key === "dbt")?.months).toBe(69);
  });

  it("keeps the project's accomplishment on that job", () => {
    const accomplishment = profile.accomplishments.find((a) => a.text.includes("month-end close"));
    expect(accomplishment?.positionKey).toBe(northwind.key);
    expect(accomplishment?.evidence[0].documentId).toBe("project");
  });

  it("matches skill spellings across documents, keeping the résumé's name", () => {
    const react = profile.skills.filter((s) => s.key === "react");
    expect(react).toHaveLength(1);
    expect(react[0].name).toBe("React");
    expect(react[0].aliases).toEqual(["React.js"]);
    expect(react[0].evidence.map((e) => e.documentId).sort()).toEqual(["project", "react-resume"]);
  });

  it("adds a job only a cover letter mentions, without dates", () => {
    const globex = profile.positions.find((p) => p.employer === "Globex")!;
    expect(globex.months).toBeNull();
    expect(globex.peopleManaged).toBe(6);
    expect(globex.skillKeys).toEqual(["team-leadership"]);
    expect(profile.skills.find((s) => s.key === "team-leadership")?.months).toBeNull();
  });

  it("ignores the job applied for and jobs without a real quote", () => {
    expect(profile.positions.some((p) => p.employer === "Initech")).toBe(false);
  });

  it("keeps accomplishments that aren't tied to a job", () => {
    const warehouse = profile.accomplishments.find((a) => a.text.includes("data warehouse"));
    expect(warehouse?.positionKey).toBeNull();
  });

  it("takes the headline and level only from résumés", () => {
    expect(profile.summary.seniority).toBe("senior");
  });

  it("is the same whatever order the documents come in", () => {
    expect(buildProfile([letter, project, resumeWithReact, oldDoc], BUILT_AT)).toEqual(profile);
  });

  it("doesn't guess which job a document means when the employer has several", () => {
    const ambiguous = typed("project", "ambiguous", "At Brightside Health I ran claims analysis.", "2026-11-12T00:00:00Z", {
      positions: [
        position({
          employer: "Brightside Health",
          title: "Analyst",
          titleFamily: "Analyst",
          evidence: "At Brightside Health",
          achievements: [{ text: "Ran claims analysis", metric: "", evidence: "I ran claims analysis" }],
        }),
      ],
    });
    const result = buildProfile([oldDoc, newDoc, ambiguous], BUILT_AT);
    expect(result.positions.filter((p) => p.employer.startsWith("Brightside"))).toHaveLength(2);
    expect(result.accomplishments.find((a) => a.text === "Ran claims analysis")?.positionKey).toBeNull();
  });
});

describe("conflicts between résumés", () => {
  it("records different dates for the same job and keeps the newest résumé's", () => {
    const a = doc("a", "**Engineer** — Acme (2019-02 – 2022-06)", "2025-01-01T00:00:00Z", {
      positions: [
        position({ employer: "Acme", title: "Engineer", titleFamily: "Engineer", start: "2019-02", end: "2022-06" }),
      ],
    });
    const b = doc("b", "**Engineer** — Acme (2019-05 – 2022-06)", "2023-01-01T00:00:00Z", {
      positions: [
        position({ employer: "Acme", title: "Engineer", titleFamily: "Engineer", start: "2019-05", end: "2022-06" }),
      ],
    });
    const result = buildProfile([a, b], BUILT_AT);
    expect(result.positions).toHaveLength(1);
    expect(result.positions[0].start).toBe("2019-02");
    expect(result.conflicts).toEqual([
      {
        section: "position",
        key: result.positions[0].key,
        field: "start",
        chosen: { documentId: "a", value: "2019-02" },
        other: { documentId: "b", value: "2019-05" },
      },
    ]);
  });
});

describe("repeated accomplishments", () => {
  const NEWER = `**Senior Data Engineer** — Northwind Logistics (2021-03 – present)

- Cut warehouse costs 30% by partitioning and clustering large Snowflake tables
- Built Airflow DAGs that load 2 TB/day from Kafka into Snowflake`;

  const OLDER = `**Senior Data Engineer**, Northwind (March 2021 – present)

- Reduced Snowflake warehouse costs by 30% through partitioning and clustering
- Built Airflow DAGs loading 2 TB/day from Kafka into Snowflake
- Designed dbt models for finance reporting`;

  const achievement = (text: string) => ({ text, metric: "", evidence: text });

  const newer = doc("newer", NEWER, "2026-10-01T00:00:00Z", {
    positions: [
      position({
        employer: "Northwind Logistics",
        title: "Senior Data Engineer",
        titleFamily: "Data Engineer",
        start: "2021-03",
        end: "present",
        evidence: "Senior Data Engineer** — Northwind Logistics",
        achievements: [
          { ...achievement("Cut warehouse costs 30% by partitioning and clustering large Snowflake tables"), metric: "30% lower warehouse costs" },
          achievement("Built Airflow DAGs that load 2 TB/day from Kafka into Snowflake"),
        ],
      }),
    ],
  });

  const older = doc("older", OLDER, "2025-01-01T00:00:00Z", {
    positions: [
      position({
        employer: "Northwind",
        title: "Senior Data Engineer",
        titleFamily: "Data Engineer",
        start: "2021-03",
        end: "present",
        evidence: "Senior Data Engineer**, Northwind",
        achievements: [
          achievement("Reduced Snowflake warehouse costs by 30% through partitioning and clustering"),
          achievement("Built Airflow DAGs loading 2 TB/day from Kafka into Snowflake"),
          achievement("Designed dbt models for finance reporting"),
        ],
      }),
    ],
  });

  const profile = buildProfile([older, newer], BUILT_AT);

  it("merges a job whose employer is shortened on one résumé", () => {
    expect(profile.positions).toHaveLength(1);
    expect(profile.positions[0].employer).toBe("Northwind Logistics");
  });

  it("lists each accomplishment once, in the newest résumé's words, with both quotes", () => {
    expect(profile.accomplishments.map((a) => a.text)).toEqual([
      "Cut warehouse costs 30% by partitioning and clustering large Snowflake tables",
      "Built Airflow DAGs that load 2 TB/day from Kafka into Snowflake",
      "Designed dbt models for finance reporting",
    ]);
    expect(profile.accomplishments[0].evidence.map((e) => e.documentId)).toEqual(["newer", "older"]);
  });

  it("drops an unattached accomplishment that repeats one on a job", () => {
    const letter = typed("cover_letter", "letter", "I cut warehouse costs by 30% by clustering and partitioning Snowflake tables.", "2026-10-05T00:00:00Z", {
      positions: [
        position({
          achievements: [achievement("I cut warehouse costs by 30% by clustering and partitioning Snowflake tables")],
        }),
      ],
    });
    const result = buildProfile([older, newer, letter], BUILT_AT);
    expect(result.accomplishments).toHaveLength(3);
    expect(result.accomplishments[0].evidence.map((e) => e.documentId)).toContain("letter");
  });
});

describe("the same job with different titles on two résumés", () => {
  const BULLETS = [
    "Architected end-to-end AI-powered workflow connecting LLM agents (Anthropic Claude), PostgreSQL database, and custom React UI to automate job search analysis",
    "Designed context engineering system with carefully structured prompts to generate consistent, actionable output across multiple analysis types",
    "Implemented agentic workflow with multiple specialized AI functions for resume analysis, job matching, and conversational exploration",
  ];
  const resume = (id: string, title: string, asOf: string, dates: { start: string; end: string }, bullets: string[]) =>
    doc(id, `**${title}** — LayMeOn.com\n\n${bullets.map((b) => `- ${b}`).join("\n")}`, asOf, {
      positions: [
        position({
          employer: "LayMeOn.com",
          title,
          titleFamily: title,
          ...dates,
          evidence: `${title}** — LayMeOn.com`,
          achievements: bullets.map((text) => ({ text, metric: "", evidence: text })),
        }),
      ],
    });

  it("merges them when the titles mostly match", () => {
    const result = buildProfile(
      [
        resume("a", "SelfAI Systems Developer & Architect", "2026-11-01T00:00:00Z", { start: "2026-09", end: "present" }, BULLETS),
        resume("b", "AI Systems Developer & Architect", "2026-10-01T00:00:00Z", { start: "2026-09", end: "present" }, [
          "Shipped functional prototype in less than a week demonstrating rapid iteration and systems-first thinking",
          ...BULLETS,
        ]),
      ],
      BUILT_AT,
    );
    expect(result.positions).toHaveLength(1);
    expect(result.accomplishments).toHaveLength(4);
  });

  it("merges them without dates when they list the same accomplishments", () => {
    const result = buildProfile(
      [
        resume("a", "Founder", "2026-11-01T00:00:00Z", { start: "", end: "" }, BULLETS),
        resume("b", "AI Systems Developer & Architect", "2026-10-01T00:00:00Z", { start: "", end: "" }, BULLETS),
      ],
      BUILT_AT,
    );
    expect(result.positions).toHaveLength(1);
    expect(result.positions[0].title).toBe("Founder");
    expect(result.accomplishments).toHaveLength(3);
  });

  it("keeps different jobs at one employer apart", () => {
    const result = buildProfile(
      [
        resume("a", "Product Manager", "2026-11-01T00:00:00Z", { start: "", end: "" }, [BULLETS[0]]),
        resume("b", "Project Manager", "2026-10-01T00:00:00Z", { start: "", end: "" }, [BULLETS[1]]),
      ],
      BUILT_AT,
    );
    expect(result.positions).toHaveLength(2);
  });

  it("keeps a promotion apart even when the titles are similar", () => {
    const result = buildProfile(
      [
        resume("a", "Senior Data Engineer", "2026-11-01T00:00:00Z", { start: "2023-01", end: "present" }, [BULLETS[0]]),
        resume("b", "Data Engineer", "2026-10-01T00:00:00Z", { start: "2019-01", end: "2022-12" }, [BULLETS[1]]),
      ],
      BUILT_AT,
    );
    expect(result.positions).toHaveLength(2);
  });
});

describe("recomputing derived values", () => {
  it("agrees with buildProfile", async () => {
    const { recomputeDerived } = await import("./derive");
    const profiles = [
      buildProfile([oldDoc, newDoc], BUILT_AT),
      buildProfile([oldDoc, newDoc, doc("older", "**Analyst** — Contoso (2019-01 – present)", "2020-06-15T00:00:00Z", {
        positions: [position({ employer: "Contoso", title: "Analyst", titleFamily: "Analyst", start: "2019-01", end: "present" })],
      })], BUILT_AT),
    ];
    for (const profile of profiles) expect(recomputeDerived(profile)).toEqual(profile);
  });
});
