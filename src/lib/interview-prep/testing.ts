/**
 * Test adapters for the Interview Prep module's seams: in-memory Jobs, store
 * and Career Story, and scripted generators. No Supabase, Claude or search.
 */
import { buildProfile } from "@/lib/profile/build";
import type { CareerProfile } from "@/lib/profile/schema";
import { emptySections } from "./sections";
import {
  INTERVIEW_PREP_VERSION,
  SectionNotImplementedError,
  type InterviewPrep,
  type InterviewPrepCareerStory,
  type InterviewPrepDeps,
  type InterviewPrepJob,
  type InterviewPrepJobs,
  type InterviewPrepStore,
  type SectionData,
  type SectionGenerators,
  type SectionInput,
  type SectionKey,
  type Section,
  type DeckKey,
  type Hint,
  type PracticeCard,
  type PracticeCardWriter,
  type PracticeContext,
} from "./interview-prep";

/** A Job at Acme with a Resume and older Interview Suggestions unless overridden. */
export function interviewPrepJob(overrides: Partial<InterviewPrepJob> = {}): InterviewPrepJob {
  return {
    id: "job-1",
    title: "Product Manager",
    company: "Acme",
    description: "We need a product manager.",
    resume: { name: "PM Resume", text: "## Experience" },
    legacySuggestions: null,
    ...overrides,
  };
}

export function memoryJobs(...initial: InterviewPrepJob[]): InterviewPrepJobs & { get(id: string): InterviewPrepJob | undefined } {
  const jobs = new Map(initial.map((j) => [j.id, j]));
  return {
    async find(id) {
      return jobs.get(id) ?? null;
    },
    async clearLegacySuggestions(id) {
      const job = jobs.get(id);
      if (job) jobs.set(id, { ...job, legacySuggestions: null });
    },
    get: (id) => jobs.get(id),
  };
}

export function memoryStore(): InterviewPrepStore & {
  set(prep: InterviewPrep): void;
  /** Saves a section as given. */
  saveSection<K extends SectionKey>(jobId: string, key: K, section: Section<SectionData[K]>): Promise<InterviewPrep>;
} {
  const preps = new Map<string, InterviewPrep>();
  const store: ReturnType<typeof memoryStore> = {
    async find(jobId) {
      return preps.get(jobId) ?? null;
    },
    // Reads and writes with no await in between, so it's atomic like the real one.
    async updateSection(jobId, key, update) {
      const prep = preps.get(jobId) ?? {
        jobId,
        version: INTERVIEW_PREP_VERSION,
        sections: emptySections(),
        updatedAt: "",
      };
      const section = update(prep.sections[key]);
      const saved = { ...prep, sections: { ...prep.sections, [key]: section }, updatedAt: new Date().toISOString() };
      preps.set(jobId, saved);
      return saved;
    },
    set: (prep) => preps.set(prep.jobId, prep),
    saveSection(jobId, key, section) {
      return store.updateSection(jobId, key, () => section);
    },
  };
  return store;
}

export function memoryCareerStory(profile: CareerProfile | null = buildProfile([], "2026-11-01T00:00:00.000Z")): InterviewPrepCareerStory {
  return { load: async () => profile };
}

export const sampleData: SectionData = {
  process: { stages: [], tips: [], commonForRole: "Usually a recruiter call, then a panel." },
  company: { whatTheyDo: { text: "Makes anvils.", sources: [] }, news: [], values: [] },
  practice: { cards: [] },
};

/**
 * Generators that return `sampleData` (or what `results` gives for a section)
 * and record what each was called with. A result that's an Error is thrown.
 */
export function scriptedGenerators(
  results: { [K in SectionKey]?: SectionData[K] | Error | "not_implemented" } = {},
) {
  const calls: { [K in SectionKey]: SectionInput<K>[] } = { process: [], company: [], practice: [] };
  function generator<K extends SectionKey>(key: K) {
    return async (input: SectionInput<K>): Promise<SectionData[K]> => {
      calls[key].push(input);
      const result = results[key];
      if (result === "not_implemented") throw new SectionNotImplementedError(key);
      if (result instanceof Error) throw result;
      return (result ?? sampleData[key]) as SectionData[K];
    };
  }
  const generators: SectionGenerators = {
    process: generator("process"),
    company: generator("company"),
    practice: generator("practice"),
  };
  return { generators, calls };
}

export const NOW = "2026-11-25T12:00:00.000Z";

export const sampleHint: Hint = {
  probing: "Whether you own your mistakes.",
  outline: ["What went wrong", "What you did"],
  experiences: [],
};

/** A ready card with no mark. */
export function practiceCard(overrides: Partial<PracticeCard> = {}): PracticeCard {
  return {
    id: "card-1",
    deck: "behavioral",
    question: "Tell me about a mistake.",
    own: false,
    mark: "not_tried",
    hint: sampleHint,
    hintStatus: "ready",
    hintRequestedAt: null,
    hintBasis: "basis-1",
    ...overrides,
  };
}

/**
 * A Practice card writer that numbers its cards ("written-1"…) with the
 * question "<deck> question <n>", and records what it was asked. `hint`
 * throws `failHint` when set. `before` runs before each answer, so a test can
 * act while cards are being written.
 */
export function scriptedPracticeWriter(options: { failHint?: Error; failWrite?: Error; before?: () => Promise<void> } = {}) {
  let n = 0;
  const calls: { write: { deck: DeckKey; count: number; avoid: string[]; context: PracticeContext }[]; hint: { deck: DeckKey; question: string; context: PracticeContext }[] } = {
    write: [],
    hint: [],
  };
  const writer: PracticeCardWriter = {
    async write(context, request) {
      calls.write.push({ ...request, context });
      await options.before?.();
      if (options.failWrite) throw options.failWrite;
      return Array.from({ length: request.count }, () => {
        n++;
        return practiceCard({ id: `written-${n}`, deck: request.deck, question: `${request.deck} question ${n}` });
      });
    },
    async hint(context, request) {
      calls.hint.push({ ...request, context });
      await options.before?.();
      if (options.failHint) throw options.failHint;
      return { hint: { ...sampleHint, probing: `Listening for: ${request.question}` }, hintBasis: "basis-2" };
    },
  };
  return { writer, calls };
}

export function setup({
  job = interviewPrepJob(),
  generators = scriptedGenerators().generators,
  careerStory = memoryCareerStory(),
  practice = scriptedPracticeWriter().writer,
  now = () => NOW,
  sleep = async () => {},
}: Partial<{
  job: InterviewPrepJob;
  generators: SectionGenerators;
  careerStory: InterviewPrepCareerStory;
  practice: PracticeCardWriter;
  now: () => string;
  sleep: (ms: number) => Promise<void>;
}> = {}) {
  const jobs = memoryJobs(job);
  const store = memoryStore();
  const deps: InterviewPrepDeps = { jobs, store, generators, careerStory, practice, now, sleep };
  return { deps, jobs, store };
}
