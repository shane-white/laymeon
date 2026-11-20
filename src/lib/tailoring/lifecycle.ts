/**
 * Getting, starting and starting over a Job's Tailoring. Operations never
 * throw: every seam call is wrapped and turned into a `Failure`. Routes only
 * check who's signed in and send back the result (see `http.ts`).
 */
import {
  failure,
  TAILORING_VERSION,
  type Failure,
  type StartBlocker,
  type Tailoring,
  type TailoringDeps,
  type TailoringJob,
  type TailoringResult,
  type TailoringState,
} from "./tailoring";

const BLOCKER_MESSAGES: Record<StartBlocker, string> = {
  no_resume: "This Job has no Resume to tailor. Upload a resume first.",
  no_match_report: "Run a Match Report for this Job first.",
  match_report_earlier_version:
    "The Match Report is for an earlier version of this Job's Resume. Run it again first.",
};

const STEP_FAILED_MESSAGE = "Couldn't prepare your Resume for tailoring. Please try again.";

/**
 * Whether the Match Report was made from the Job's Resume as it is now. A
 * report saved before its Resume's Source material was recorded counts if the
 * Resume hasn't changed since it was made.
 */
function matchReportIsCurrent(job: TailoringJob): boolean {
  const { resume, matchReport } = job;
  if (!resume || !matchReport || matchReport.resumeId !== resume.id) return false;
  if (matchReport.resumeContentHash !== null) return matchReport.resumeContentHash === resume.contentHash;
  return Date.parse(resume.updatedAt) <= Date.parse(matchReport.generatedAt);
}

/** Why a Tailoring can't be started for the Job now, or null if it can. */
function startBlocker(job: TailoringJob): StartBlocker | null {
  if (!job.resume?.text?.trim()) return "no_resume";
  if (!job.matchReport) return "no_match_report";
  if (!matchReportIsCurrent(job)) return "match_report_earlier_version";
  return null;
}

/**
 * Whether a Tailoring is an Earlier version: its Match Report has been rerun,
 * or its Resume's Source material has changed.
 */
function isEarlierVersion(tailoring: Tailoring, job: TailoringJob): boolean {
  return (
    tailoring.matchReportGeneratedAt !== job.matchReport?.generatedAt ||
    tailoring.resumeContentHash !== job.resume?.contentHash
  );
}

function state(job: TailoringJob, tailoring: Tailoring | null): TailoringState {
  return {
    ok: true,
    tailoring,
    earlierVersion: tailoring ? isEarlierVersion(tailoring, job) : false,
    startBlocker: startBlocker(job),
  };
}

async function findJob(deps: TailoringDeps, jobId: string): Promise<TailoringJob | Failure> {
  try {
    return (await deps.jobs.find(jobId)) ?? failure("not_found", "Job not found");
  } catch (err) {
    console.error("Couldn't load a Job for a Tailoring", err);
    return failure("save_failed", "Couldn't load this Job. Please try again.");
  }
}

async function findTailoring(deps: TailoringDeps, job: TailoringJob): Promise<Tailoring | null | Failure> {
  if (!job.resume) return null;
  try {
    return await deps.store.find(job.id, job.resume.id);
  } catch (err) {
    console.error("Couldn't load a Tailoring", err);
    return failure("save_failed", "Couldn't load this Job's Tailoring. Please try again.");
  }
}

const isFailure = (value: unknown): value is Failure =>
  typeof value === "object" && value !== null && (value as { ok?: unknown }).ok === false;

/** The Job's Tailoring for its current Resume, if there is one, and whether one can be started. */
export async function getTailoring(deps: TailoringDeps, jobId: string): Promise<TailoringResult> {
  const job = await findJob(deps, jobId);
  if (isFailure(job)) return job;
  const tailoring = await findTailoring(deps, job);
  if (isFailure(tailoring)) return tailoring;
  return state(job, tailoring);
}

/** Makes and saves a new Tailoring for the Job and its Resume, replacing any it had. */
async function makeTailoring(deps: TailoringDeps, job: TailoringJob): Promise<TailoringResult> {
  const blocker = startBlocker(job);
  if (blocker) return failure(blocker, BLOCKER_MESSAGES[blocker]);
  const resume = job.resume!;
  const matchReport = job.matchReport!;

  let markdown: string;
  try {
    markdown = (await deps.steps.structureResume(resume.text!)).trim();
  } catch (err) {
    console.error("Couldn't structure a Resume for a Tailoring", err);
    return failure("step_failed", STEP_FAILED_MESSAGE);
  }
  if (!markdown) return failure("step_failed", STEP_FAILED_MESSAGE);

  try {
    const tailoring = await deps.store.save({
      jobId: job.id,
      resumeId: resume.id,
      version: TAILORING_VERSION,
      markdown,
      items: [],
      matchReportGeneratedAt: matchReport.generatedAt,
      resumeContentHash: resume.contentHash,
    });
    return state(job, tailoring);
  } catch (err) {
    console.error("Couldn't save a Tailoring", err);
    return failure("save_failed", "Couldn't save this Tailoring. Please try again.");
  }
}

/**
 * Starts a Tailoring for the Job and its Resume. Needs the Job's Resume and a
 * Match Report for it that isn't an Earlier version. If the pair already has a
 * Tailoring, it's kept and returned as it is, even if it's an Earlier version.
 */
export async function startTailoring(deps: TailoringDeps, jobId: string): Promise<TailoringResult> {
  const job = await findJob(deps, jobId);
  if (isFailure(job)) return job;
  const existing = await findTailoring(deps, job);
  if (isFailure(existing)) return existing;
  if (existing) return state(job, existing);
  return makeTailoring(deps, job);
}

/**
 * Replaces the Job's Tailoring for its Resume with a new one from the current
 * Match Report, dropping its Suggestions and decisions. Needs what
 * `startTailoring` needs; when it can't start, the old Tailoring is kept.
 */
export async function startOver(deps: TailoringDeps, jobId: string): Promise<TailoringResult> {
  const job = await findJob(deps, jobId);
  if (isFailure(job)) return job;
  return makeTailoring(deps, job);
}
