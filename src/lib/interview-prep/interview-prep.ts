/**
 * The Interview Prep module's types and the seams it works through. One
 * Interview Prep per Job, with three sections (Process, Company, Practice),
 * each researched, saved and refreshed on its own.
 *
 * The operations are in `lifecycle.ts`; each section's generator is in
 * `generators.ts`; the production adapters are in `supabase-store.ts`,
 * `supabase-jobs.ts` and `deps.ts`, and the test adapters in `testing.ts`.
 */
import type { CareerStoryRef } from "@/lib/profile/for-prompt";
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

/**
 * A briefing about the company only: no talking points tied to the user. Every
 * item links to its sources, and a part with nothing sourced is empty (null)
 * rather than padded.
 */
export interface CompanyData {
  /** Products, customers, business model, and rough size and stage. Null when nothing sourced was found. */
  whatTheyDo: { text: string; sources: Source[] } | null;
  /** From the last 6 months, newest first. `date` is an ISO date (YYYY-MM-DD), approximate when the news gave "3 months ago". */
  news: { date: string; headline: string; howItMightComeUp: string; sources: Source[] }[];
  /** Quoted word for word from the company's own site. */
  values: { text: string; sources: Source[] }[];
}

/** The Decks, in display order. */
export const DECK_KEYS = ["behavioral", "role", "company", "ask"] as const;
export type DeckKey = (typeof DECK_KEYS)[number];

/** Each Deck's name, as the user sees it. */
export const DECK_NAMES: Record<DeckKey, string> = {
  behavioral: "Behavioral",
  role: "Role & technical",
  company: "About this company",
  ask: "Questions to ask them",
};

/** A Practice card's mark. Nothing is scored. */
export type Mark = "not_tried" | "feels_good" | "practice_more";

/** Each mark's name, as the user sees it. */
export const MARK_NAMES: Record<Mark, string> = {
  not_tried: "Not tried yet",
  feels_good: "Feels good",
  practice_more: "Practice more",
};

/** A Career Story item behind an experience on a hint, with its Evidence. */
export interface HintSource {
  /** The Career Story item: its section, key and a short label such as "Product Manager at Ledgerly". */
  ref: CareerStoryRef;
  /** Word-for-word quotes from the user's Documents that back the item. Empty for an item the user stated themselves. */
  evidence: { documentName: string | null; quote: string }[];
}

/** An experience from the Career Story that fits a question. */
export interface HintExperience {
  /** One line on the experience and how it fits, e.g. "Checkout redesign at Ledgerly: you argued for a usability test". */
  text: string;
  /**
   * Whether this Job's Resume shows it: false is flagged "not on your resume".
   * Null when the Job has no Resume to compare against, so nothing is flagged.
   * Checked again against the Job's Resume each time the Interview Prep is
   * sent (`withResumeFlags`), so a Resume change never makes a hint an Earlier version.
   */
  onResume: boolean | null;
  /** The Career Story items it comes from. Never empty. */
  backedBy: HintSource[];
}

/** The back of a Practice card, built from the Career Story (LAY-122). */
export interface Hint {
  /** What they're listening for. */
  probing: string;
  /** A rough shape: an outline of an answer, in a few steps. */
  outline: string[];
  /** From your experience. Empty for questions to ask them, and when nothing in the Career Story fits. */
  experiences: HintExperience[];
}

/**
 * - `writing`: the hint is being written (an own question just added, or a hint being rewritten).
 * - `ready`: `hint` holds it.
 * - `failed`: writing it failed; it can be tried again.
 */
export type HintStatus = "writing" | "ready" | "failed";

/** A likely interview question (LAY-122..125). */
export interface PracticeCard {
  /** Unique across Interview Preps, so a mark can't land on the wrong card. */
  id: string;
  deck: DeckKey;
  question: string;
  /** The user added it. Only the user removes their own cards or marked cards. */
  own: boolean;
  mark: Mark;
  /** Null until the first hint is written. Kept while a new one is written. */
  hint: Hint | null;
  hintStatus: HintStatus;
  /** When the hint now being written was asked for, so one stuck writing can be retried. Null when not writing. */
  hintRequestedAt: string | null;
  /**
   * `careerStoryHash` of the Career Story the hint was built from. When it
   * differs from the Career Story's now, the hint is an Earlier version (LAY-125).
   */
  hintBasis: string | null;
}

/** Decks are only ever added to. Cards are in the order they were added. */
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
   *
   * `update` gets the section as saved now and returns it changed. If another
   * request saves in between, it's run again on that newer save, so two
   * requests changing the same section (a mark saved while new cards are
   * written) never undo each other. It may run more than once, so keep it
   * free of side effects; anything it throws is passed on.
   */
  updateSection<K extends SectionKey>(
    jobId: string,
    key: K,
    update: (current: Section<SectionData[K]>) => Section<SectionData[K]>,
  ): Promise<InterviewPrep>;
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
  /**
   * The Process and Company research, waiting a while for any of it still
   * researching (Prepare runs all three sections at once). Practice uses it
   * for its company Decks.
   */
  research(): Promise<Research>;
}

/** The Process and Company research a Practice card can draw on. Null where there's none. */
export interface Research {
  process: ProcessData | null;
  company: CompanyData | null;
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
  /** Writes Practice cards and their hints, for More like this and the user's own questions. */
  practice: PracticeCardWriter;
  /** The time now, as an ISO string. */
  now: () => string;
  /** Waits, while Practice waits on the Process and Company research. */
  sleep: (ms: number) => Promise<void>;
}

/** What writing Practice cards needs to know. */
export interface PracticeContext {
  job: InterviewPrepJob;
  careerStory: CareerProfile;
  research: Research;
}

/** Writes Practice cards from the Career Story (`practice/writer.ts`). Throws with a message fit to show the user. */
export interface PracticeCardWriter {
  /** Up to `count` new cards for a Deck, with hints, repeating none of the questions in `avoid`. */
  write(context: PracticeContext, request: { deck: DeckKey; count: number; avoid: string[] }): Promise<PracticeCard[]>;
  /** A hint for a question, and the basis it was built from. */
  hint(context: PracticeContext, request: { deck: DeckKey; question: string }): Promise<{ hint: Hint; hintBasis: string }>;
}

/** What the Interview Prep tab shows. */
export interface InterviewPrepState {
  ok: true;
  /** Null until the Job's first Prepare. Sections stuck researching past the time limit show as failed. */
  prep: InterviewPrep | null;
  /** The older Interview Suggestions, while the Job has no Interview Prep. */
  legacySuggestions: string | null;
  /**
   * `careerStoryHash` of the user's Career Story now, or null if they have
   * none. A card whose `hintBasis` differs has an Earlier version of its hint.
   */
  careerStoryHash: string | null;
}

/**
 * - `invalid`: the request doesn't make sense (an empty question, an unknown Deck).
 * - `no_career_story`: a Practice operation that writes hints, for a user with no Career Story.
 * - `write_failed`: writing Practice cards or a hint failed.
 */
export type FailureKind =
  | "not_found"
  | "already_researching"
  | "invalid"
  | "no_career_story"
  | "load_failed"
  | "save_failed"
  | "write_failed";

export type InterviewPrepResult = InterviewPrepState | { ok: false; kind: FailureKind; message: string };
