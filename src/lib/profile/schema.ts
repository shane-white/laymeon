import { z } from "zod";

/** Bump when the extraction prompt or schema changes, so cached extractions are redone. */
export const EXTRACTION_VERSION = 2;

/** Turns the extraction's "unknown" into null. */
export function knownOrNull<T extends string>(value: T | "unknown"): T | null {
  return value === "unknown" ? null : value;
}

/** Bump when the stored profile's shape changes. */
export const PROFILE_VERSION = 1;

// Textkernel's job levels, without "low level".
export const seniorityLevelSchema = z.enum([
  "entry",
  "experienced",
  "senior",
  "manager",
  "senior_manager",
  "executive",
  "senior_executive",
]);

export const skillCategorySchema = z.enum([
  "hard_skill",
  "tool",
  "domain",
  "soft_skill",
  "method",
]);

export const employmentTypeSchema = z.enum([
  "full_time",
  "part_time",
  "contract",
  "freelance",
  "internship",
  "volunteer",
  "other",
]);

export const languageLevelSchema = z.enum([
  "native",
  "fluent",
  "professional",
  "conversational",
  "basic",
]);

const quote = z
  .string()
  .describe(
    "A short quote copied character-for-character from the document that shows this (no paraphrasing, no ellipses, no joining separate lines).",
  );

// The extraction schema has no nullable fields: each one compiles to a union,
// and too many make the structured-output grammar too large for the API.
// Text the document doesn't give is an empty string, enums have "unknown",
// and the build step turns these into nulls.
const text = (description: string) =>
  z.string().describe(`${description} Empty string if not stated.`);

const date = (what: string) =>
  text(`${what} as "YYYY-MM", or "YYYY" if the document only gives the year.`);

const UNKNOWN = "unknown";

/** What the model returns for one document. */
export const extractionSchema = z.object({
  headline: text(
    `The document's own headline or summary line describing the person professionally, e.g. "Data engineer with 6 years of experience building pipelines".`,
  ),
  seniority: z
    .enum([...seniorityLevelSchema.options, UNKNOWN])
    .describe(
      "The level of the most recent position. entry: first jobs, interns, juniors. experienced: individual contributor. senior: senior, staff, lead or principal individual contributor. manager: manages people. senior_manager: manages managers, or director. executive: VP or head of a department. senior_executive: C-level, president, founder of a large company. unknown if there are no positions.",
    ),
  positions: z
    .array(
      z.object({
        employer: z.string().describe("The employer's name as written."),
        title: z.string().describe("The job title exactly as written."),
        titleFamily: z
          .string()
          .describe(
            'The general role, without seniority words (junior, senior, staff, lead, principal, I/II/III) or team names. "Senior Software Engineer II, Payments" → "Software Engineer"; "Lead Product Designer" → "Product Designer"; "Engineering Manager" stays "Engineering Manager". Use the same titleFamily for the same kind of role.',
          ),
        location: text('City, region or country, or "Remote".'),
        employmentType: z
          .enum([...employmentTypeSchema.options, UNKNOWN])
          .describe('Only if the document says so or the title makes it clear (e.g. "Intern", "Volunteer"). unknown otherwise.'),
        start: date("Start date"),
        end: text(
          'End date as "YYYY-MM", or "YYYY" if the document only gives the year, or "present" if this is a current job.',
        ),
        peopleManaged: z
          .number()
          .describe("How many people the person managed in this job, if the document says. 0 otherwise."),
        achievements: z
          .array(
            z.object({
              text: z.string().describe("The achievement, as written in the document."),
              metric: text('The measurable result, if there is one, e.g. "30% lower warehouse costs".'),
              evidence: quote,
            }),
          )
          .describe("Accomplishments and responsibilities listed for this job, one per bullet or sentence."),
        skills: z
          .array(z.string())
          .describe(
            "The canonicalName of each skill, tool or method in the skills list that this job's text shows was used in this job.",
          ),
        evidence: quote.describe("A quote with the job title or employer, copied character-for-character."),
      }),
    )
    .describe("Every job the document describes, most recent first. Include internships and volunteer roles."),
  skills: z
    .array(
      z.object({
        name: z.string().describe("The skill as written in the document."),
        canonicalName: z
          .string()
          .describe(
            'The standard name for it, e.g. "Postgres" → "PostgreSQL", "JS" → "JavaScript", "k8s" → "Kubernetes", "ReactJS" → "React", "AWS Lambda" stays "AWS Lambda". Use one canonicalName for every mention of the same thing.',
          ),
        category: skillCategorySchema.describe(
          "hard_skill: a learned ability (e.g. data modeling, financial forecasting, copywriting, Python). tool: a product, platform or technology used (e.g. Snowflake, Figma, Salesforce, AWS Lambda). domain: an industry or field of knowledge (e.g. healthcare claims, logistics). soft_skill: how the person works with others (e.g. mentoring, stakeholder management). method: a methodology or practice (e.g. Agile, TDD, OKRs).",
        ),
        evidence: quote,
      }),
    )
    .describe(
      'Every skill, tool, domain and method the document shows, once each. Include ones only mentioned inside job descriptions. Only list soft skills shown by something the person did ("mentored 4 engineers" shows mentoring), never adjectives the person uses about themselves ("hard-working", "detail-oriented").',
    ),
  education: z
    .array(
      z.object({
        school: z.string(),
        degree: text('e.g. "B.S.", "MBA", "High school diploma".'),
        field: text('e.g. "Computer Science".'),
        start: date("Start date"),
        end: date("End or graduation date"),
        evidence: quote,
      }),
    )
    .describe("Degrees, diplomas and other formal education. Not short courses or certifications."),
  certifications: z
    .array(
      z.object({
        name: z.string(),
        issuer: text("The organization that issued it."),
        issued: date("Date issued"),
        expires: date("Expiry date"),
        evidence: quote,
      }),
    )
    .describe("Certifications and professional licenses."),
  languages: z
    .array(
      z.object({
        language: z.string().describe('A human language, e.g. "Spanish". Never a programming language.'),
        level: z
          .enum([...languageLevelSchema.options, UNKNOWN])
          .describe("Only if the document says. unknown otherwise."),
        evidence: quote,
      }),
    )
    .describe("Human languages the person speaks or writes, as the document lists them."),
});

export type Extraction = z.infer<typeof extractionSchema>;

const evidenceSchema = z.object({
  documentId: z.string(),
  quote: z.string(),
});

export type Evidence = z.infer<typeof evidenceSchema>;

/** The stored profile (`career_profiles.base` and `.data`), shared with the UI. */
export const careerProfileSchema = z.object({
  version: z.literal(PROFILE_VERSION),
  builtAt: z.string(),
  sources: z.array(
    z.object({
      documentId: z.string(),
      documentName: z.string(),
      documentType: z.enum(["resume", "cover_letter", "project"]),
      /** The day the document was added; "present" in it means this date. */
      asOf: z.string(),
    }),
  ),
  summary: z.object({
    headline: z.string().nullable(),
    seniority: seniorityLevelSchema.nullable(),
    currentTitle: z.string().nullable(),
    targetRoles: z.array(z.string()),
    /** Months of work experience, overlapping jobs counted once. Volunteer roles aren't counted. */
    totalMonths: z.number().nullable(),
  }),
  positions: z.array(
    z.object({
      key: z.string(),
      employer: z.string(),
      title: z.string(),
      titleFamily: z.string(),
      location: z.string().nullable(),
      employmentType: employmentTypeSchema.nullable(),
      /** "YYYY-MM" or "YYYY". */
      start: z.string().nullable(),
      /** "YYYY-MM", "YYYY" or "present". */
      end: z.string().nullable(),
      isCurrent: z.boolean(),
      months: z.number().nullable(),
      peopleManaged: z.number().nullable(),
      skillKeys: z.array(z.string()),
      evidence: z.array(evidenceSchema),
    }),
  ),
  skills: z.array(
    z.object({
      key: z.string(),
      name: z.string(),
      aliases: z.array(z.string()),
      category: skillCategorySchema,
      /** Months across the positions it was used in, overlaps counted once. Null if it isn't tied to a dated position. */
      months: z.number().nullable(),
      /** "YYYY-MM", "present", or null. */
      lastUsed: z.string().nullable(),
      positionKeys: z.array(z.string()),
      evidence: z.array(evidenceSchema),
    }),
  ),
  roles: z.array(
    z.object({
      key: z.string(),
      titleFamily: z.string(),
      months: z.number().nullable(),
      positionKeys: z.array(z.string()),
    }),
  ),
  education: z.array(
    z.object({
      key: z.string(),
      school: z.string(),
      degree: z.string().nullable(),
      field: z.string().nullable(),
      start: z.string().nullable(),
      end: z.string().nullable(),
      evidence: z.array(evidenceSchema),
    }),
  ),
  certifications: z.array(
    z.object({
      key: z.string(),
      name: z.string(),
      issuer: z.string().nullable(),
      issued: z.string().nullable(),
      expires: z.string().nullable(),
      evidence: z.array(evidenceSchema),
    }),
  ),
  languages: z.array(
    z.object({
      key: z.string(),
      language: z.string(),
      level: languageLevelSchema.nullable(),
      evidence: z.array(evidenceSchema),
    }),
  ),
  accomplishments: z.array(
    z.object({
      key: z.string(),
      text: z.string(),
      metric: z.string().nullable(),
      positionKey: z.string().nullable(),
      evidence: z.array(evidenceSchema),
    }),
  ),
  /**
   * Places where two résumés disagree. The chosen value (from the most recent
   * résumé) is the one in the profile; the user can review the rest.
   */
  conflicts: z
    .array(
      z.object({
        section: z.literal("position"),
        key: z.string(),
        field: z.enum(["start", "end"]),
        chosen: z.object({ documentId: z.string(), value: z.string().nullable() }),
        other: z.object({ documentId: z.string(), value: z.string().nullable() }),
      }),
    )
    // Profiles built before conflicts were recorded have none.
    .default([]),
});

export type CareerProfile = z.infer<typeof careerProfileSchema>;
export type ProfilePosition = CareerProfile["positions"][number];
export type ProfileSkill = CareerProfile["skills"][number];
export type SeniorityLevel = z.infer<typeof seniorityLevelSchema>;
