/**
 * Getting, starting and starting over a Job's Tailoring. Operations never
 * throw: every seam call is wrapped and turned into a `Failure`. Routes only
 * check who's signed in and send back the result (see `http.ts`).
 */
import { MAX_PROJECT_DESCRIPTION_LENGTH, MAX_PROJECT_TITLE_LENGTH } from "@/lib/projects";
import { exampleWorkRequest, exampleWorkSuggestion, newItems, suggestionRequests, withSuggestions } from "./items";
import {
  failure,
  MAX_DECISION_TEXT_LENGTH,
  TAILORING_VERSION,
  type Decision,
  type ExampleWorkInput,
  type Failure,
  type StartBlocker,
  type Tailoring,
  type TailoringDeps,
  type TailoringItem,
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
const SUGGESTIONS_FAILED_MESSAGE = "Couldn't write Suggestions for your Resume. Please try again.";

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
    resumeName: job.resume?.name ?? null,
    company: job.company,
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

  let items = newItems(matchReport.report, () => crypto.randomUUID());
  const covered = items.some((i) => i.careerStory.length > 0);
  // Without the Career Story, Suggestions are still written from the linked items' labels.
  const profile = covered ? await deps.careerStory.load().catch(() => null) : null;
  const requests = suggestionRequests(items, profile);
  if (requests.length > 0) {
    try {
      const written = await deps.steps.writeSuggestions(markdown, requests);
      items = withSuggestions(items, requests, written, markdown, profile);
    } catch (err) {
      console.error("Couldn't write Suggestions for a Tailoring", err);
      return failure("step_failed", SUGGESTIONS_FAILED_MESSAGE);
    }
  }

  try {
    const tailoring = await deps.store.save({
      jobId: job.id,
      resumeId: resume.id,
      version: TAILORING_VERSION,
      markdown,
      items,
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

/** The decision as it's saved, or why it can't be made on the item. */
function checkedDecision(item: TailoringItem, decision: Decision): Decision | string {
  switch (decision.status) {
    case "undecided":
      return decision;
    case "skipped":
      return item.gap ? decision : "Only a gap can be skipped.";
    case "accepted":
    case "rejected":
      return item.suggestion ? { status: decision.status } : "This item has no Suggestion to decide on.";
    case "edited":
    case "own_text": {
      if (!item.suggestion) return "This item has no Suggestion to decide on.";
      const text = decision.text.trim();
      if (!text) return "Write the text to use.";
      if (text.length > MAX_DECISION_TEXT_LENGTH) {
        return `Keep the text to ${MAX_DECISION_TEXT_LENGTH.toLocaleString("en-US")} characters.`;
      }
      return { status: decision.status, text };
    }
  }
}

/**
 * Records the user's decision on one item of the Job's Tailoring for its
 * current Resume, replacing any decision it had. Works on a Tailoring that's
 * an Earlier version too. A gap can only be skipped (or undecided); only an
 * item with a Suggestion can be accepted, edited, given own text or rejected.
 */
export async function decide(
  deps: TailoringDeps,
  jobId: string,
  itemId: string,
  decision: Decision,
): Promise<TailoringResult> {
  const job = await findJob(deps, jobId);
  if (isFailure(job)) return job;
  const tailoring = await findTailoring(deps, job);
  if (isFailure(tailoring)) return tailoring;
  const item = tailoring?.items.find((i) => i.id === itemId);
  if (!tailoring || !item) return failure("not_found", "This Suggestion is no longer in your Tailoring. Reload the page.");

  const saved = checkedDecision(item, decision);
  if (typeof saved === "string") return failure("invalid_decision", saved);

  try {
    const items = tailoring.items.map((i) => (i.id === itemId ? { ...i, decision: saved } : i));
    return state(job, await deps.store.saveItems(tailoring.id, items));
  } catch (err) {
    console.error("Couldn't save a Tailoring decision", err);
    return failure("save_failed", "Couldn't save your decision. Please try again.");
  }
}

/** Why the Example Work can't be added as it is, or null if it can. */
function exampleWorkProblem({ title, description }: ExampleWorkInput): string | null {
  if (!title) return "Give the project a title.";
  if (!description) return "Describe the project.";
  if (title.length > MAX_PROJECT_TITLE_LENGTH) return `Keep the title to ${MAX_PROJECT_TITLE_LENGTH} characters.`;
  if (description.length > MAX_PROJECT_DESCRIPTION_LENGTH) {
    return `Keep the description to ${MAX_PROJECT_DESCRIPTION_LENGTH.toLocaleString("en-US")} characters.`;
  }
  return null;
}

const NO_GAP_SUGGESTION_MESSAGE =
  "Your project is saved in your Example Works, but we couldn't write a Suggestion from it. It will show in your next Match Report.";

/**
 * Fills a gap in the Job's Tailoring for its current Resume: adds the user's
 * written Example Work (which requests a Rebuild, without waiting for it),
 * then writes the item's Suggestion from it, with the Example Work as its
 * Evidence. The item stops being a gap, and its decision is reset to
 * undecided. Works on a Tailoring that's an Earlier version, and doesn't make
 * it one. If no Suggestion can be written, the Example Work stays added.
 */
export async function fillGap(
  deps: TailoringDeps,
  jobId: string,
  itemId: string,
  input: ExampleWorkInput,
): Promise<TailoringResult> {
  const job = await findJob(deps, jobId);
  if (isFailure(job)) return job;
  const tailoring = await findTailoring(deps, job);
  if (isFailure(tailoring)) return tailoring;
  const item = tailoring?.items.find((i) => i.id === itemId);
  if (!tailoring || !item) return failure("not_found", "This item is no longer in your Tailoring. Reload the page.");
  if (!item.gap) return failure("invalid_example_work", "This item already has a Suggestion.");

  const exampleWork = { title: input.title.trim(), description: input.description.trim() };
  const problem = exampleWorkProblem(exampleWork);
  if (problem) return failure("invalid_example_work", problem);

  let added;
  try {
    added = await deps.exampleWorks.add(exampleWork);
  } catch (err) {
    console.error("Couldn't add an Example Work for a Tailoring gap", err);
    return failure("save_failed", "Couldn't save your project. Please try again.");
  }
  if (!added.ok) return failure(added.invalid ? "invalid_example_work" : "save_failed", added.message);

  let suggestion;
  try {
    const written = await deps.steps.writeSuggestions(tailoring.markdown, [exampleWorkRequest(item, exampleWork)]);
    suggestion = exampleWorkSuggestion(item, written, tailoring.markdown, { documentId: added.documentId, title: added.title });
  } catch (err) {
    console.error("Couldn't write a Suggestion from an Example Work", err);
    return failure("step_failed", NO_GAP_SUGGESTION_MESSAGE);
  }
  if (!suggestion) return failure("step_failed", NO_GAP_SUGGESTION_MESSAGE);

  // Read again: decisions may have been saved while Claude wrote.
  const current = await findTailoring(deps, job);
  if (isFailure(current)) return current;
  if (current?.id !== tailoring.id || !current.items.some((i) => i.id === itemId)) {
    return failure("not_found", "This item is no longer in your Tailoring. Reload the page.");
  }
  try {
    const items = current.items.map((i) =>
      i.id === itemId ? { ...i, suggestion, gap: false, decision: { status: "undecided" as const } } : i,
    );
    return state(job, await deps.store.saveItems(current.id, items));
  } catch (err) {
    console.error("Couldn't save a Tailoring gap's Suggestion", err);
    return failure("save_failed", "Your project is saved in your Example Works, but we couldn't save its Suggestion. Please reload the page.");
  }
}
