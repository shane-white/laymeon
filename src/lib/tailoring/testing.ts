/**
 * Test adapters for the Tailoring module's seams: in-memory Jobs and store,
 * and scripted Claude steps. No Supabase or Claude.
 */
import type { MatchReport } from "@/lib/match-report/schema";
import type {
  NewTailoring,
  Tailoring,
  TailoringJob,
  TailoringJobs,
  TailoringSteps,
  TailoringStore,
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

  return {
    async find(jobId, resumeId) {
      if (options.failFind) throw new Error("find failed");
      return findPair(jobId, resumeId);
    },
    async save(tailoring: NewTailoring) {
      if (options.failSave) throw new Error("save failed");
      const now = new Date().toISOString();
      const existing = findPair(tailoring.jobId, tailoring.resumeId);
      // Like the upsert on (user_job_id, resume_document_id): the row is replaced in place.
      const row: Tailoring = existing
        ? { ...tailoring, id: existing.id, createdAt: existing.createdAt, updatedAt: now }
        : { ...tailoring, id: `tailoring-${nextId++}`, createdAt: now, updatedAt: now };
      if (existing) saved[saved.indexOf(existing)] = row;
      else saved.push(row);
      return row;
    },
    tailorings: () => [...saved],
  };
}

/** Claude steps that return what they're given, or throw it if it's an error. */
export function scriptedSteps(script: { markdown?: string | Error } = {}): TailoringSteps & {
  /** The Resume texts given to `structureResume`, in order. */
  structured: string[];
} {
  const steps = {
    structured: [] as string[],
    async structureResume(resumeText: string) {
      steps.structured.push(resumeText);
      if (script.markdown instanceof Error) throw script.markdown;
      return script.markdown ?? "# Structured resume";
    },
  };
  return steps;
}
