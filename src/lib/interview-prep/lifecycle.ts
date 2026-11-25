/** The Interview Prep operations. See `interview-prep.ts` for the types and seams. */
import {
  SECTION_NEEDS_CAREER_STORY,
  SectionNotImplementedError,
  type FailureReason,
  type InterviewPrep,
  type InterviewPrepDeps,
  type InterviewPrepJob,
  type InterviewPrepResult,
  type SectionData,
  type SectionGenerator,
  type Section,
  type SectionKey,
} from "./interview-prep";
import { emptySection, withStuckResearchFailed } from "./sections";

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Unknown error";
}

/** The Job's Interview Prep, and its older Interview Suggestions while it still has them. */
export async function getInterviewPrep(deps: InterviewPrepDeps, jobId: string): Promise<InterviewPrepResult> {
  try {
    const job = await deps.jobs.find(jobId);
    if (!job) return { ok: false, kind: "not_found", message: "Job not found" };
    const prep = await deps.store.find(jobId);
    return { ok: true, prep: prep && withStuckResearchFailed(prep, deps.now()), legacySuggestions: job.legacySuggestions };
  } catch (err) {
    return { ok: false, kind: "load_failed", message: errorMessage(err) };
  }
}

/** Runs the section's generator, or says why it can't run. Never throws. */
async function research<K extends SectionKey>(
  deps: InterviewPrepDeps,
  key: K,
  job: InterviewPrepJob,
  previous: SectionData[K] | null,
): Promise<{ ok: true; data: SectionData[K] } | { ok: false; reason: FailureReason; message: string }> {
  try {
    let careerStory = null;
    if (SECTION_NEEDS_CAREER_STORY[key]) {
      careerStory = await deps.careerStory.load();
      if (!careerStory) {
        return { ok: false, reason: "no_career_story", message: "Practice builds its hints from your Career Story, so it needs one." };
      }
    }
    const generate = deps.generators[key] as SectionGenerator<K>;
    return { ok: true, data: await generate({ job, careerStory, previous }) };
  } catch (err) {
    if (err instanceof SectionNotImplementedError) {
      return { ok: false, reason: "not_implemented", message: "This section isn't available yet." };
    }
    return { ok: false, reason: "error", message: errorMessage(err) };
  }
}

/**
 * Researches one section of the Job's Interview Prep, creating the Interview
 * Prep if it has none. It's saved as researching first, so another request
 * (or a reload) shows "Researching…", then as ready or failed. The other
 * sections are left as they are, so all three can run at once. A failed
 * refresh keeps the last good result and its date.
 *
 * The Job's older Interview Suggestions are cleared once a section is ready,
 * and not before, so a Prepare that fails doesn't lose them.
 */
export async function prepareSection<K extends SectionKey>(
  deps: InterviewPrepDeps,
  jobId: string,
  key: K,
): Promise<InterviewPrepResult> {
  let job: InterviewPrepJob | null;
  let existing: InterviewPrep | null;
  try {
    job = await deps.jobs.find(jobId);
    if (!job) return { ok: false, kind: "not_found", message: "Job not found" };
    const saved = await deps.store.find(jobId);
    existing = saved && withStuckResearchFailed(saved, deps.now());
  } catch (err) {
    return { ok: false, kind: "load_failed", message: errorMessage(err) };
  }

  const previous: Section<SectionData[K]> = existing?.sections[key] ?? emptySection();
  if (previous.status === "researching") {
    return { ok: false, kind: "already_researching", message: "This section is already being researched." };
  }
  const kept = { data: previous.data, researchedAt: previous.researchedAt };

  try {
    await deps.store.saveSection(jobId, key, { ...kept, status: "researching", startedAt: deps.now(), failure: null });
  } catch (err) {
    return { ok: false, kind: "save_failed", message: errorMessage(err) };
  }

  const result = await research(deps, key, job, kept.data);
  const outcome: Section<SectionData[K]> = result.ok
    ? { status: "ready", researchedAt: deps.now(), data: result.data, startedAt: null, failure: null }
    : { ...kept, status: "failed", startedAt: null, failure: { reason: result.reason, message: result.message } };

  try {
    const prep = await deps.store.saveSection(jobId, key, outcome);
    let legacySuggestions = job.legacySuggestions;
    if (outcome.status === "ready" && legacySuggestions !== null) {
      await deps.jobs.clearLegacySuggestions(jobId);
      legacySuggestions = null;
    }
    return { ok: true, prep, legacySuggestions };
  } catch (err) {
    return { ok: false, kind: "save_failed", message: errorMessage(err) };
  }
}
