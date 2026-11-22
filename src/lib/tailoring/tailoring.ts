/**
 * The Tailoring module's types and the seams it works through. The operations
 * are in `lifecycle.ts` (items and Suggestions are made in `items.ts`; quotes
 * are found in the Markdown by `quotes.ts`); the production adapters are in `supabase-store.ts`,
 * `supabase-jobs.ts`, `claude-steps.ts` and `deps.ts`, and the test adapters
 * in `testing.ts`.
 */
import type { CareerStoryRef, MatchReport, Requirement } from "@/lib/match-report/schema";
import type { CareerProfile } from "@/lib/profile/schema";

/** Bump when the stored shape of a Tailoring changes. */
export const TAILORING_VERSION = 1;

/** The Match Report item an item of the Tailoring is aimed at, copied in so a rerun doesn't change it. */
export type TailoringTarget =
  | {
      kind: "requirement";
      text: string;
      importance: Requirement["importance"];
      category: Requirement["category"];
      match: "missing" | "partial";
    }
  | { kind: "screener"; text: string };

/** One word-for-word quote from a Document, with the Document's name to show. */
export interface EvidenceQuote {
  documentId: string;
  /** The Document's name when the Career Story was built, or null if it's unknown. */
  documentName: string | null;
  quote: string;
}

/**
 * What a Suggestion is based on, to show the user so they can trust it:
 * - `career_story`: a Career Story item the Match Report linked to the item,
 *   with its Evidence quotes (none for time in a role, or for an item the user
 *   added themselves).
 * - `resume`: the Resume's own text, for a rewording Suggestion.
 * - `example_work`: an Example Work the user wrote for a gap.
 */
export type SuggestionEvidence =
  | ({ source: "career_story"; quotes: EvidenceQuote[] } & CareerStoryRef)
  | { source: "resume"; quote: string }
  | { source: "example_work"; documentId: string; title: string };

/**
 * Where an Add's new text goes: after the line holding `quote`, or at the end
 * of the section whose heading is `heading`.
 */
export type AddAnchor = { type: "after"; quote: string } | { type: "section"; heading: string };

/**
 * A proposed edit to the Resume, aimed at one item. Every quote and heading in
 * it is exactly as it is in the Tailoring's Markdown, so `markdown.indexOf`
 * finds it.
 * - `rewrite`: replace `quote` with `text`.
 * - `add`: insert `text` at `anchor`.
 */
export type Suggestion = (
  | { kind: "rewrite"; quote: string; text: string }
  | { kind: "add"; anchor: AddAnchor; text: string }
) & {
  /** Why this helps with the item, in plain words. */
  why: string;
  evidence: SuggestionEvidence[];
};

/**
 * The user's decision on an item:
 * - `accepted`: the Suggestion's text as it is.
 * - `edited`: the Suggestion, with the user's changes to its text.
 * - `own_text`: the user's own text in the Suggestion's place. No longer made (Edit
 *   covers it), but saved Tailorings may still hold it.
 * - `rejected`: nothing goes on the Resume.
 * - `skipped`: a gap the user chose not to fill for now.
 * - `not_had`: Not had: the user lacks a missing Requirement or a Screener the
 *   Resume doesn't show. It closes the item, and nothing goes on the Resume.
 * Only accepted, edited and own text change the Resume.
 */
export type Decision =
  | { status: "undecided" }
  | { status: "accepted" }
  | { status: "edited"; text: string }
  | { status: "own_text"; text: string }
  | { status: "rejected" }
  | { status: "skipped" }
  | { status: "not_had" };

/** The most text an edited or own-text decision can hold. */
export const MAX_DECISION_TEXT_LENGTH = 2000;

/** One Match Report item the Tailoring covers, with its Suggestion (if any) and the user's decision. */
export interface TailoringItem {
  /** Unique across Tailorings, so a decision can't land on one that was started over. */
  id: string;
  target: TailoringTarget;
  /** The Career Story items the Match Report linked to it. */
  careerStory: CareerStoryRef[];
  /** At most one. Null for a gap, or when the written one was dropped. */
  suggestion: Suggestion | null;
  /**
   * Offer to describe an Example Work for it: the Career Story doesn't cover
   * it, or no Suggestion could be written from it.
   */
  gap: boolean;
  decision: Decision;
}

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
  /**
   * Replaces a saved Tailoring's items, if it hasn't changed since it was read:
   * `readAt` is the `updatedAt` it had then. Every save (and starting over)
   * changes `updatedAt`. Null if it has changed, or there's no Tailoring with
   * that ID.
   */
  saveItems(tailoringId: string, items: TailoringItem[], readAt: string): Promise<Tailoring | null>;
}

/** The signed-in user's Career Story. */
export interface TailoringCareerStory {
  /** The Career Story, or null if it hasn't been built. */
  load(): Promise<CareerProfile | null>;
}

/** An item to write a Suggestion for, with what it may be based on. */
export interface SuggestionRequest {
  itemId: string;
  target: TailoringTarget;
  /**
   * `career_story`: write from `sources`, as a Rewrite or an Add.
   * `resume`: only reword what the Resume already says, as a Rewrite.
   * `example_work`: write from the Example Work the user just wrote for a
   *   gap (its title and description are the one source), as a Rewrite or an Add.
   */
  basis: "career_story" | "resume" | "example_work";
  /** What the Suggestion may draw on: each source's label and its Evidence quotes. */
  sources: { label: string; quotes: string[] }[];
}

/** A Suggestion as Claude wrote it, before its quotes are checked. */
export interface WrittenSuggestion {
  itemId: string;
  kind: "rewrite" | "add";
  /** Rewrite: the text to replace. Add: the line it goes after, or empty for an Add in a section. */
  quote: string;
  /** An Add in a section: the section's title. Otherwise empty. */
  section: string;
  text: string;
  why: string;
}

/** The Claude steps a Tailoring runs. */
export interface TailoringSteps {
  /** The Resume's text as structured Markdown (headings, roles, dates, bullets), its wording kept. */
  structureResume(resumeText: string): Promise<string>;
  /** At most one Suggestion per requested item, quoting the structured Markdown. */
  writeSuggestions(markdown: string, requests: SuggestionRequest[]): Promise<WrittenSuggestion[]>;
}

/** A written Example Work, as the user gives it for a gap. */
export interface ExampleWorkInput {
  title: string;
  description: string;
}

/** The outcome of adding an Example Work. */
export type AddedExampleWork =
  | { ok: true; documentId: string; title: string }
  /** `invalid`: the user can fix it (for example, too long, or too many Example Works). */
  | { ok: false; invalid: boolean; message: string };

/** Adds the signed-in user's written Example Works, through the Document lifecycle (which requests a Rebuild). */
export interface TailoringExampleWorks {
  add(input: ExampleWorkInput): Promise<AddedExampleWork>;
}

export interface TailoringDeps {
  jobs: TailoringJobs;
  store: TailoringStore;
  steps: TailoringSteps;
  careerStory: TailoringCareerStory;
  exampleWorks: TailoringExampleWorks;
}

/** Why a Tailoring can't be started. */
export type StartBlocker = "no_resume" | "no_match_report" | "match_report_earlier_version";

export type FailureKind =
  | "not_found"
  | StartBlocker
  | "invalid_decision"
  | "invalid_example_work"
  | "step_failed"
  | "load_failed"
  | "save_failed"
  /** The Tailoring kept changing while a change to it was saved. */
  | "conflict";

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
  /** The Job's current Resume's name, or null if it has none. For naming the download. */
  resumeName: string | null;
  /** The Job's company, or null if it's unknown. */
  company: string | null;
}

export type TailoringResult = TailoringState | Failure;

export function failure(kind: FailureKind, message: string): Failure {
  return { ok: false, kind, message };
}
