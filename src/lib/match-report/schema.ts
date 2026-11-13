import { z } from "zod";

export const MATCH_REPORT_VERSION = 1;

export const overallLabelSchema = z.enum(["strong", "partial", "weak"]);
export const importanceSchema = z.enum(["must_have", "nice_to_have"]);
export const requirementMatchSchema = z.enum(["strong", "partial", "missing"]);
export const requirementCategorySchema = z.enum([
  "skill",
  "tool",
  "experience",
  "education",
  "certification",
  "other",
]);
export const searchWordStatusSchema = z.enum(["found", "similar", "not_found"]);
export const similaritySchema = z.enum(["same_meaning", "related"]);

const careerStoryIds = z
  .array(z.string())
  .describe(
    "Only when the resume doesn't clearly show this: the IDs of Career Story items (like \"S3\" or \"R1\") that clearly show the candidate has it. Empty when the resume shows it, when no Career Story item does, or when there's no Career Story.",
  );

/** A Career Story item that shows a requirement the resume doesn't. See formatCareerStoryForPrompt. */
export const careerStoryRefSchema = z.object({
  section: z.string(),
  key: z.string(),
  label: z.string(),
  byUser: z.boolean(),
});

/**
 * What the model returns through the `submit_match_report` tool.
 * The overall label and search word statuses are computed in code, not by the model.
 */
export const modelReportSchema = z.object({
  overall: z.object({
    reason: z
      .string()
      .describe("One plain-language sentence on why the resume does or doesn't match this job."),
    topFixes: z
      .array(z.string())
      .describe("The top 3 things to fix, most important first. Short imperative sentences."),
  }),
  screeners: z
    .array(
      z.object({
        item: z
          .string()
          .describe(
            "A hard requirement that a resume is expected to show and employers often check with a yes/no question: minimum years of experience, degree, license or certification, security clearance, or required location. Never work authorization, sponsorship, citizenship, criminal history, background checks or other eligibility questions the applicant answers themselves.",
          ),
        shown: z.boolean().describe("Whether the resume clearly shows this requirement is met."),
        evidence: z
          .string()
          .nullable()
          .describe("A short verbatim quote from the resume that shows it, or null."),
        careerStoryIds: careerStoryIds,
      }),
    )
    .describe("Only hard requirements the posting actually states. Empty if none."),
  requirements: z
    .array(
      z.object({
        text: z.string().describe("The requirement, as stated or closely paraphrased from the posting."),
        importance: importanceSchema.describe(
          "must_have if the posting says required/must/minimum or lists it under requirements; nice_to_have for preferred/bonus/plus.",
        ),
        category: requirementCategorySchema,
        match: requirementMatchSchema.describe(
          "strong: clearly on the resume. partial: related experience, or only implied. missing: not on the resume.",
        ),
        evidence: z
          .string()
          .nullable()
          .describe(
            "A short quote copied character-for-character from the resume (no paraphrasing, no ellipses) that supports the match, or null if missing.",
          ),
        action: z
          .string()
          .nullable()
          .describe("For partial or missing: one line on what to do, phrased 'If true, add…'. Null for strong."),
        careerStoryIds: careerStoryIds,
      }),
    )
    .describe("One entry per requirement in the posting."),
  searchWords: z
    .array(
      z.object({
        term: z.string().describe("The exact wording used in the job posting."),
        resumeWordings: z
          .array(
            z.object({
              wording: z
                .string()
                .describe(
                  "A short phrase (usually 1–3 words) copied verbatim from the resume that refers to this term, e.g. 'Postgres' or 'Mixpanel', not a whole sentence.",
                ),
              similarity: similaritySchema.describe(
                "same_meaning: the same thing in different words (Postgres vs PostgreSQL, PM vs project management). related: related, but not the same (data pipelines vs ETL).",
              ),
            }),
          )
          .describe(
            "If the resume doesn't use the term's exact wording, the resume's own wordings for it, closest first. Empty if the resume uses the exact term or has nothing comparable.",
          ),
      }),
    )
    .describe("The 8–12 terms a recruiter would most likely search for."),
  firstImpression: z
    .string()
    .describe(
      "2–3 sentences on what a recruiter sees in a 10-second skim: the most recent title, the summary line, and whether the top of the resume covers the job's main needs.",
    ),
  nextSteps: z
    .array(
      z.object({
        text: z.string().describe("The action. Wording suggestions are phrased 'If true, add…'."),
        relatesTo: z.string().describe("The requirement or search word this action addresses."),
      }),
    )
    .describe("Up to 5 actions in priority order."),
});

export type ModelReport = z.infer<typeof modelReportSchema>;

/** The stored report (`user_job_listings.match_report`), shared with the UI. */
export const matchReportSchema = z.object({
  version: z.literal(MATCH_REPORT_VERSION),
  overall: z.object({
    label: overallLabelSchema,
    reason: z.string(),
    topFixes: z.array(z.string()).max(3),
  }),
  screeners: z.array(
    z.object({
      item: z.string(),
      shown: z.boolean(),
      evidence: z.string().nullable(),
      /** Career Story items that show it when the resume doesn't. */
      careerStory: z.array(careerStoryRefSchema).default([]),
    }),
  ),
  requirements: z.array(
    z.object({
      text: z.string(),
      importance: importanceSchema,
      category: requirementCategorySchema,
      match: requirementMatchSchema,
      evidence: z.string().nullable(),
      action: z.string().nullable(),
      /** Career Story items that show it when the resume doesn't. */
      careerStory: z.array(careerStoryRefSchema).default([]),
    }),
  ),
  searchWords: z.array(
    z.object({
      term: z.string(),
      status: searchWordStatusSchema,
      resumeWording: z.string().nullable(),
      similarity: similaritySchema.nullable(),
    }),
  ),
  firstImpression: z.string(),
  nextSteps: z
    .array(z.object({ text: z.string(), relatesTo: z.string() }))
    .max(5),
});

export type MatchReport = z.infer<typeof matchReportSchema>;
export type OverallLabel = z.infer<typeof overallLabelSchema>;
export type Requirement = MatchReport["requirements"][number];
export type SearchWord = MatchReport["searchWords"][number];
export type CareerStoryRef = z.infer<typeof careerStoryRefSchema>;
