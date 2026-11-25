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

export function memoryStore(): InterviewPrepStore & { set(prep: InterviewPrep): void } {
  const preps = new Map<string, InterviewPrep>();
  return {
    async find(jobId) {
      return preps.get(jobId) ?? null;
    },
    async saveSection(jobId, key, section) {
      const prep = preps.get(jobId) ?? {
        jobId,
        version: INTERVIEW_PREP_VERSION,
        sections: emptySections(),
        updatedAt: "",
      };
      const saved = { ...prep, sections: { ...prep.sections, [key]: section }, updatedAt: new Date().toISOString() };
      preps.set(jobId, saved);
      return saved;
    },
    set: (prep) => preps.set(prep.jobId, prep),
  };
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

export function setup({
  job = interviewPrepJob(),
  generators = scriptedGenerators().generators,
  careerStory = memoryCareerStory(),
  now = () => NOW,
}: Partial<{ job: InterviewPrepJob; generators: SectionGenerators; careerStory: InterviewPrepCareerStory; now: () => string }> = {}) {
  const jobs = memoryJobs(job);
  const store = memoryStore();
  const deps: InterviewPrepDeps = { jobs, store, generators, careerStory, now };
  return { deps, jobs, store };
}
