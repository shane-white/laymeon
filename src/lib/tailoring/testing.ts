/**
 * Test adapters for the Tailoring module's seams: in-memory Jobs, store and
 * Career Story, and scripted Claude steps. No Supabase or Claude.
 */
import type { CareerStoryRef, MatchReport, Requirement } from "@/lib/match-report/schema";
import { buildProfile } from "@/lib/profile/build";
import type { CareerProfile } from "@/lib/profile/schema";
import type {
  AddedExampleWork,
  ExampleWorkInput,
  NewTailoring,
  SuggestionRequest,
  Tailoring,
  TailoringCareerStory,
  TailoringExampleWorks,
  TailoringItem,
  TailoringJob,
  TailoringJobs,
  TailoringSteps,
  TailoringStore,
  WrittenSuggestion,
} from "./tailoring";

/** A Match Report with nothing in it, to build on. */
export function emptyMatchReport(overrides: Partial<MatchReport> = {}): MatchReport {
  return {
    version: 1,
    overall: { label: "partial", reason: "", topFixes: [] },
    screeners: [],
    requirements: [],
    searchWords: [],
    firstImpression: "",
    nextSteps: [],
    ...overrides,
  };
}

/** A Match Report Requirement: must-have and missing unless overridden. */
export function requirement(text: string, overrides: Partial<Requirement> = {}): Requirement {
  return {
    text,
    importance: "must_have",
    category: "experience",
    match: "missing",
    evidence: null,
    action: null,
    careerStory: [],
    ...overrides,
  };
}

/** A Match Report Screener: not shown unless overridden. */
export function screener(item: string, overrides: Partial<MatchReport["screeners"][number]> = {}) {
  return { item, shown: false, evidence: null, careerStory: [], ...overrides };
}

/**
 * A Job with a Resume and a current Match Report for it. Pass `resume: null`
 * or `matchReport: null` to leave either out.
 */
export function tailoringJob(overrides: Partial<TailoringJob> = {}): TailoringJob {
  return {
    id: "job-1",
    title: "Product Manager",
    company: "Acme",
    resume: {
      id: "resume-1",
      name: "PM Resume",
      text: "Jane Doe\nProduct Manager at Ledgerly 2020-2024\n- Shipped billing",
      contentHash: "hash-1",
      updatedAt: "2026-11-01T00:00:00.000Z",
    },
    matchReport: {
      report: emptyMatchReport(),
      generatedAt: "2026-11-02T00:00:00.000Z",
      resumeId: "resume-1",
      resumeContentHash: "hash-1",
    },
    ...overrides,
  };
}

/** The same Job with a different Match Report in it. */
export function withReport(job: TailoringJob, report: Partial<MatchReport>): TailoringJob {
  return { ...job, matchReport: { ...job.matchReport!, report: emptyMatchReport(report) } };
}

export interface MemoryJobs extends TailoringJobs {
  /** Replaces a Job, or adds it. */
  set(job: TailoringJob): void;
}

/** The given Jobs, held in memory. */
export function memoryJobs(...jobs: TailoringJob[]): MemoryJobs {
  const held = new Map(jobs.map((j) => [j.id, j]));
  return {
    async find(jobId) {
      return held.get(jobId) ?? null;
    },
    set(job) {
      held.set(job.id, job);
    },
  };
}

export interface MemoryTailoringStoreOptions {
  /** Make `find` fail. */
  failFind?: boolean;
  /** Make `save` fail. */
  failSave?: boolean;
  /** Make `saveItems` fail. */
  failSaveItems?: boolean;
  /**
   * Runs before the first `saveItems` call is applied, as if another request
   * changed the Tailoring between that call's read and its write.
   */
  beforeSaveItems?: () => Promise<void>;
}

export interface MemoryTailoringStore extends TailoringStore {
  /** The saved Tailorings. */
  tailorings(): Tailoring[];
}

/** Tailorings held in memory, one per Job and Resume pair. */
export function memoryTailoringStore(options: MemoryTailoringStoreOptions = {}): MemoryTailoringStore {
  const saved: Tailoring[] = [];
  let nextId = 1;
  const findPair = (jobId: string, resumeId: string) =>
    saved.find((t) => t.jobId === jobId && t.resumeId === resumeId) ?? null;
  // Saved rows go through JSON like the jsonb column, so nothing shares objects with the caller.
  const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));
  // Every write gets a later updatedAt, like the production store, even within a millisecond.
  let lastWrite = 0;
  const writeTime = () => new Date((lastWrite = Math.max(Date.now(), lastWrite + 1))).toISOString();

  return {
    async find(jobId, resumeId) {
      if (options.failFind) throw new Error("find failed");
      const found = findPair(jobId, resumeId);
      return found && copy(found);
    },
    async save(tailoring: NewTailoring) {
      if (options.failSave) throw new Error("save failed");
      const now = writeTime();
      const existing = findPair(tailoring.jobId, tailoring.resumeId);
      // Like the upsert on (user_job_id, resume_document_id): the row is replaced in place.
      const row: Tailoring = existing
        ? { ...copy(tailoring), id: existing.id, createdAt: existing.createdAt, updatedAt: now }
        : { ...copy(tailoring), id: `tailoring-${nextId++}`, createdAt: now, updatedAt: now };
      if (existing) saved[saved.indexOf(existing)] = row;
      else saved.push(row);
      return copy(row);
    },
    async saveItems(tailoringId: string, items: TailoringItem[], readAt: string) {
      if (options.failSaveItems) throw new Error("saveItems failed");
      const before = options.beforeSaveItems;
      options = { ...options, beforeSaveItems: undefined };
      await before?.();
      const index = saved.findIndex((t) => t.id === tailoringId);
      // Like the update conditional on updated_at: nothing is saved if it changed since it was read.
      if (index === -1 || saved[index].updatedAt !== readAt) return null;
      saved[index] = { ...saved[index], items: copy(items), updatedAt: writeTime() };
      return copy(saved[index]);
    },
    tailorings: () => copy(saved),
  };
}

/** A Career Story held in memory, or a failing one. */
export function memoryCareerStory(profile: CareerProfile | null | Error = null): TailoringCareerStory {
  return {
    async load() {
      if (profile instanceof Error) throw profile;
      return profile;
    },
  };
}

/**
 * A Career Story built from one Resume ("Résumé", ID `doc-1`): a Product
 * Manager job at Ledgerly, an accomplishment, and the skills SQL and Payments.
 * `ref(section, name)` gives a Match Report link to one of its items.
 */
export function careerStory(): { profile: CareerProfile; ref(section: "skill" | "accomplishment" | "position", name: string): CareerStoryRef } {
  const markdown = `**Product Manager** — Ledgerly (2021-01 – present)
- Built ACH payouts for invoice payments
Skills: SQL, Payments`;
  const profile = buildProfile(
    [
      {
        document: { id: "doc-1", name: "Résumé", type: "resume", markdown, asOf: "2026-11-01T00:00:00Z", targetRole: null },
        extraction: {
          headline: "",
          seniority: "experienced",
          positions: [
            {
              employer: "Ledgerly",
              title: "Product Manager",
              titleFamily: "Product Manager",
              location: "",
              employmentType: "unknown",
              start: "2021-01",
              end: "present",
              peopleManaged: 0,
              achievements: [
                { text: "Built ACH payouts for invoice payments", metric: "", evidence: "Built ACH payouts for invoice payments" },
              ],
              skills: ["Payments"],
              evidence: "Product Manager** — Ledgerly",
            },
          ],
          skills: [
            { name: "SQL", canonicalName: "SQL", category: "hard_skill", evidence: "SQL" },
            { name: "Payments", canonicalName: "Payments", category: "domain", evidence: "Payments" },
          ],
          education: [],
          certifications: [],
          languages: [],
        },
      },
    ],
    "2026-11-13T00:00:00Z",
  );
  return {
    profile,
    ref(section, name) {
      const item =
        section === "skill"
          ? profile.skills.find((s) => s.name === name)
          : section === "accomplishment"
            ? profile.accomplishments.find((a) => a.text === name)
            : profile.positions.find((p) => p.title === name);
      if (!item) throw new Error(`No ${section} ${name} in the test Career Story`);
      return { section, key: item.key, label: name, byUser: false };
    },
  };
}

/**
 * Example Works added in memory, with IDs `example-work-1`, `example-work-2`
 * and so on. Pass a failure to answer every add with it, or an error to throw it.
 */
export function memoryExampleWorks(fail?: Extract<AddedExampleWork, { ok: false }> | Error): TailoringExampleWorks & {
  /** The Example Works added, in order. */
  added(): ({ documentId: string } & ExampleWorkInput)[];
} {
  const added: ({ documentId: string } & ExampleWorkInput)[] = [];
  return {
    async add(input) {
      if (fail instanceof Error) throw fail;
      if (fail) return fail;
      const documentId = `example-work-${added.length + 1}`;
      added.push({ documentId, ...input });
      return { ok: true, documentId, title: input.title };
    },
    added: () => [...added],
  };
}

type SuggestionScript =
  | WrittenSuggestion[]
  | Error
  | ((requests: SuggestionRequest[]) => WrittenSuggestion[]);

/**
 * Claude steps that return what they're given, or throw it if it's an error.
 * A scripted Suggestion's `itemId` can be its item's text.
 */
export function scriptedSteps(script: { markdown?: string | Error; suggestions?: SuggestionScript } = {}): TailoringSteps & {
  /** The Resume texts given to `structureResume`, in order. */
  structured: string[];
  /** The Suggestion requests given to `writeSuggestions`, one list per call. */
  requested: SuggestionRequest[][];
} {
  const steps = {
    structured: [] as string[],
    requested: [] as SuggestionRequest[][],
    async structureResume(resumeText: string) {
      steps.structured.push(resumeText);
      if (script.markdown instanceof Error) throw script.markdown;
      return script.markdown ?? "# Structured resume";
    },
    async writeSuggestions(_markdown: string, requests: SuggestionRequest[]) {
      steps.requested.push(requests);
      const { suggestions } = script;
      if (suggestions instanceof Error) throw suggestions;
      const written = typeof suggestions === "function" ? suggestions(requests) : (suggestions ?? []);
      // A scripted Suggestion can name its item by the item's text, as IDs are made at start.
      return written.map((w) => ({ ...w, itemId: requests.find((r) => r.target.text === w.itemId)?.itemId ?? w.itemId }));
    },
  };
  return steps;
}

/** A written Rewrite. `itemId` can be the item's text. */
export const rewrite = (itemId: string, quote: string, text: string, why = "Shows the item"): WrittenSuggestion => ({
  itemId,
  kind: "rewrite",
  quote,
  section: "",
  text,
  why,
});

/** A written Add, after a quoted line or in a section. `itemId` can be the item's text. */
export const add = (
  itemId: string,
  anchor: { after: string } | { section: string },
  text: string,
  why = "Shows the item",
): WrittenSuggestion => ({
  itemId,
  kind: "add",
  quote: "after" in anchor ? anchor.after : "",
  section: "section" in anchor ? anchor.section : "",
  text,
  why,
});
