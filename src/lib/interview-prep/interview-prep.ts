/**
 * The Interview Prep module's types and the seams it works through. One
 * Interview Prep per Job, with three sections (Process, Company, Practice),
 * each researched, saved and refreshed on its own.
 *
 * The operations are in `lifecycle.ts`; each section's generator is in
 * `generators.ts`; the production adapters are in `supabase-store.ts`,
 * `supabase-jobs.ts` and `deps.ts`, and the test adapters in `testing.ts`.
 */
import type { CareerProfile } from "@/lib/profile/schema";

/** Bump when the stored shape of an Interview Prep changes. */
export const INTERVIEW_PREP_VERSION = 1;

/** The sections, in switcher order. */
export const SECTION_KEYS = ["process", "company", "practice"] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];

/**
 * - `not_started`: never researched.
 * - `researching`: a request is working on it now.
 * - `ready`: researched; `data` holds it.
 * - `failed`: the last research failed. `data` still holds the last good result, if any.
 */
export type SectionStatus = "not_started" | "researching" | "ready" | "failed";

/**
 * Why a section failed:
 * - `no_career_story`: Practice needs a Career Story and the user has none.
 * - `not_implemented`: the section's generator hasn't been built yet.
 * - `error`: anything else (a Claude or search failure, a timeout).
 */
export type FailureReason = "no_career_story" | "not_implemented" | "error";

/** A web page that backs a Process stage or tip, or a Company fact. */
export interface Source {
  title: string;
  url: string;
}

/** LAY-120 fills this in. Stages and tips only appear when a Source backs them. */
export interface ProcessData {
  stages: { name: string; detail: string; sources: Source[] }[];
  tips: { text: string; sources: Source[] }[];
  /** Shown, clearly labeled, when nothing sourced was found. Null otherwise. */
  commonForRole: string | null;
}

/** LAY-121 fills this in. About the company only: no talking points tied to the user. */
export interface CompanyData {
  whatTheyDo: { text: string; sources: Source[] };
  /** From the last 6 months. */
  news: { date: string; headline: string; howItMightComeUp: string; sources: Source[] }[];
  values: { text: string; sources: Source[] }[];
}

/** The Decks, in display order. */
export const DECK_KEYS = ["behavioral", "role", "company", "ask"] as const;
export type DeckKey = (typeof DECK_KEYS)[number];

/** A Practice card's mark. Nothing is scored. */
export type Mark = "not_tried" | "feels_good" | "practice_more";

/** The back of a Practice card, built from the Career Story (LAY-122). */
export interface Hint {
  /** What the interviewer is probing for. */
  probing: string;
  /** A rough outline of an answer. */
  outline: string[];
  /** Experiences from the Career Story that fit. `onResume` is false when this Job's Resume doesn't show it. */
  experiences: { text: string; onResume: boolean }[];
}

/** A likely interview question (LAY-122..125). */
export interface PracticeCard {
  /** Unique across Interview Preps, so a mark can't land on the wrong card. */
  id: string;
  deck: DeckKey;
  question: string;
  /** The user added it. Only the user removes their own cards or marked cards. */
  own: boolean;
  mark: Mark;
  /** Null while the hint is still being written. */
  hint: Hint | null;
  /**
   * A hash of the Career Story the hint was built from. When it differs from
   * the Career Story's now, the hint is an Earlier version.
   */
  hintBasis: string | null;
}

/** LAY-122 fills this in. Decks are only ever added to. */
export interface PracticeData {
  cards: PracticeCard[];
}

export interface SectionData {
  process: ProcessData;
  company: CompanyData;
  practice: PracticeData;
}

/** One section of an Interview Prep, as saved. */
export interface Section<T> {
  status: SectionStatus;
  /** When `data` was researched. Null until it first is. */
  researchedAt: string | null;
  /** The last good result. Kept through a refresh, and through a failed one. */
  data: T | null;
  /** When the current research started, while `researching`. */
  startedAt: string | null;
  /** Why the last research failed, while `failed`. */
  failure: { reason: FailureReason; message: string } | null;
}

export type Sections = { [K in SectionKey]: Section<SectionData[K]> };

/** A Job's saved Interview Prep. */
export interface InterviewPrep {
  /** The Job (`user_job_listings.id`). */
  jobId: string;
  version: number;
  sections: Sections;
  updatedAt: string;
}

/** The Job, as an Interview Prep needs it. */
export interface InterviewPrepJob {
  id: string;
  title: string | null;
  company: string | null;
  description: string | null;
  /** The Job's Resume text, or null. Prepare works without one. */
  resume: { name: string; text: string | null } | null;
  /** The older free-text Interview Suggestions, shown read-only until an Interview Prep exists. */
  legacySuggestions: string | null;
}

export interface InterviewPrepJobs {
  find(jobId: string): Promise<InterviewPrepJob | null>;
  /** Clears the older Interview Suggestions once the Interview Prep has a ready section. */
  clearLegacySuggestions(jobId: string): Promise<void>;
}

export interface InterviewPrepStore {
  /** The Job's Interview Prep, or null if it has none. */
  find(jobId: string): Promise<InterviewPrep | null>;
  /**
   * Saves one section and leaves the others as they are, creating the
   * Interview Prep if the Job has none. Returns the whole Interview Prep.
   */
  saveSection<K extends SectionKey>(jobId: string, key: K, section: Section<SectionData[K]>): Promise<InterviewPrep>;
}

export interface InterviewPrepCareerStory {
  /** The user's Career Story, or null if they have none. */
  load(): Promise<CareerProfile | null>;
}

/** What a section's generator gets. */
export interface SectionInput<K extends SectionKey> {
  job: InterviewPrepJob;
  /** Loaded only for sections that need it (see `SECTION_NEEDS_CAREER_STORY`); null otherwise. */
  careerStory: CareerProfile | null;
  /** The section's last good result, so a refresh can build on it (Decks are only added to). */
  previous: SectionData[K] | null;
}

/** Researches one section. Throws on failure; `SectionNotImplementedError` until it's built. */
export type SectionGenerator<K extends SectionKey> = (input: SectionInput<K>) => Promise<SectionData[K]>;

export type SectionGenerators = { [K in SectionKey]: SectionGenerator<K> };

/** Practice builds hints from the Career Story, so it can't run without one. */
export const SECTION_NEEDS_CAREER_STORY: Record<SectionKey, boolean> = {
  process: false,
  company: false,
  practice: true,
};

/** Thrown by a generator that a later ticket fills in. */
export class SectionNotImplementedError extends Error {
  constructor(key: SectionKey) {
    super(`The ${key} section isn't built yet.`);
    this.name = "SectionNotImplementedError";
  }
}

export interface InterviewPrepDeps {
  jobs: InterviewPrepJobs;
  store: InterviewPrepStore;
  generators: SectionGenerators;
  careerStory: InterviewPrepCareerStory;
  /** The time now, as an ISO string. */
  now: () => string;
}

/** What the Interview Prep tab shows. */
export interface InterviewPrepState {
  ok: true;
  /** Null until the Job's first Prepare. Sections stuck researching past the time limit show as failed. */
  prep: InterviewPrep | null;
  /** The older Interview Suggestions, while the Job has no Interview Prep. */
  legacySuggestions: string | null;
}

export type FailureKind = "not_found" | "already_researching" | "load_failed" | "save_failed";

export type InterviewPrepResult = InterviewPrepState | { ok: false; kind: FailureKind; message: string };
