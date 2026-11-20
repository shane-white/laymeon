/**
 * The Tailoring module's types and the seams it works through. The operations
 * are in `lifecycle.ts`; the production adapters are in `supabase-store.ts`,
 * `supabase-jobs.ts`, `claude-steps.ts` and `deps.ts`, and the test adapters
 * in `testing.ts`.
 */
import type { MatchReport } from "@/lib/match-report/schema";

/** Bump when the stored shape of a Tailoring changes. */
export const TAILORING_VERSION = 1;

/**
 * One Match Report item the Tailoring covers, with its Suggestion (or none,
 * for a gap) and the user's decision. Stored as jsonb; LAY-100 defines its
 * fields.
 */
export type TailoringItem = Record<string, unknown>;

/** A saved Tailoring: one per Job and Resume pair. */
export interface Tailoring {
  id: string;
  /** The Job (`user_job_listings.id`). */
  jobId: string;
  resumeId: string;
  version: number;
  /** The Resume's text as structured Markdown. Suggestions quote it word for word. */
  markdown: string;
  items: TailoringItem[];
  /** The Match Report it was made from: its `generated_at`. */
  matchReportGeneratedAt: string;
  /** The Resume's Source material it was made from (`resumeContentHash`). */
  resumeContentHash: string;
  createdAt: string;
  updatedAt: string;
}

/** A Tailoring to save. The store fills in its ID and timestamps. */
export type NewTailoring = Omit<Tailoring, "id" | "createdAt" | "updatedAt">;

/** The Job's Resume as it is now. */
export interface TailoringResume {
  id: string;
  name: string;
  /** The text read from the file. */
  text: string | null;
  /** `resumeContentHash` of its Source material now. */
  contentHash: string;
  updatedAt: string;
}

/** The Job's current Match Report and what it was made from. */
export interface JobMatchReport {
  report: MatchReport;
  generatedAt: string;
  /** The Resume it compared. */
  resumeId: string;
  /** `resumeContentHash` of that Resume then. Null for reports saved before it was recorded. */
  resumeContentHash: string | null;
}

/** What a Tailoring needs to know about a Job. */
export interface TailoringJob {
  id: string;
  title: string | null;
  company: string | null;
  /** The Job's chosen Resume, or the Default document. */
  resume: TailoringResume | null;
  matchReport: JobMatchReport | null;
}

/** Loads the signed-in user's Jobs. */
export interface TailoringJobs {
  /** The Job, or null if there's none. */
  find(jobId: string): Promise<TailoringJob | null>;
}

/** Where the signed-in user's Tailorings are kept. */
export interface TailoringStore {
  /** The Tailoring for the Job and Resume pair, or null if there's none. */
  find(jobId: string, resumeId: string): Promise<Tailoring | null>;
  /** Saves the Tailoring, replacing any for the same Job and Resume pair. */
  save(tailoring: NewTailoring): Promise<Tailoring>;
}

/** The Claude steps a Tailoring runs. */
export interface TailoringSteps {
  /** The Resume's text as structured Markdown (headings, roles, dates, bullets), its wording kept. */
  structureResume(resumeText: string): Promise<string>;
}

export interface TailoringDeps {
  jobs: TailoringJobs;
  store: TailoringStore;
  steps: TailoringSteps;
}

/** Why a Tailoring can't be started. */
export type StartBlocker = "no_resume" | "no_match_report" | "match_report_earlier_version";

export type FailureKind = "not_found" | StartBlocker | "step_failed" | "save_failed";

export interface Failure {
  ok: false;
  kind: FailureKind;
  /** Shown to the user. */
  message: string;
}

/** A Job's Tailoring for its current Resume, and whether a new one can be started. */
export interface TailoringState {
  ok: true;
  /** The saved Tailoring for the Job and its current Resume, or null. */
  tailoring: Tailoring | null;
  /** The Tailoring's Match Report has been rerun, or its Resume's Source material has changed. */
  earlierVersion: boolean;
  /** Why starting (or starting over) would fail, or null if it can start. */
  startBlocker: StartBlocker | null;
}

export type TailoringResult = TailoringState | Failure;

export function failure(kind: FailureKind, message: string): Failure {
  return { ok: false, kind, message };
}
