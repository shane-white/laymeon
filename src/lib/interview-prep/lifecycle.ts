/** The Interview Prep operations. See `interview-prep.ts` for the types and seams. */
import { careerStoryHash } from "@/lib/profile/career-story-hash";
import type { CareerProfile } from "@/lib/profile/schema";
import {
  SECTION_NEEDS_CAREER_STORY,
  SectionNotImplementedError,
  type FailureReason,
  type InterviewPrep,
  type InterviewPrepDeps,
  type InterviewPrepJob,
  type InterviewPrepResult,
  type InterviewPrepState,
  type PracticeData,
  type Research,
  type SectionData,
  type SectionGenerator,
  type Section,
  type SectionKey,
} from "./interview-prep";
import { addCards, questionsIn, resumeText, withResumeFlags } from "./practice/cards";
import { REFRESH_COMPANY_COUNT } from "./practice/writer";
import { withStuckResearchFailed, withStuckSectionFailed } from "./sections";

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Unknown error";
}

/**
 * What a successful operation sends back: the Interview Prep, with its
 * "not on your resume" flags checked against the Job's Resume now; the older
 * Interview Suggestions; and the Career Story's hash now (`careerStory`, when
 * the caller has already loaded it). A Career Story that can't be loaded gives
 * no hash rather than failing the operation.
 */
export async function interviewPrepState(
  deps: InterviewPrepDeps,
  job: InterviewPrepJob,
  prep: InterviewPrep | null,
  legacySuggestions: string | null,
  careerStory?: CareerProfile | null,
): Promise<InterviewPrepState> {
  const story = careerStory !== undefined ? careerStory : await deps.careerStory.load().catch(() => null);
  const practice = prep?.sections.practice;
  const flagged =
    prep && practice?.data
      ? { ...prep, sections: { ...prep.sections, practice: { ...practice, data: withResumeFlags(practice.data, resumeText(job)) } } }
      : prep;
  return { ok: true, prep: flagged, legacySuggestions, careerStoryHash: story ? careerStoryHash(story) : null };
}

/** The Job's Interview Prep, and its older Interview Suggestions while it still has them. */
export async function getInterviewPrep(deps: InterviewPrepDeps, jobId: string): Promise<InterviewPrepResult> {
  try {
    const job = await deps.jobs.find(jobId);
    if (!job) return { ok: false, kind: "not_found", message: "Job not found" };
    const prep = await deps.store.find(jobId);
    return interviewPrepState(deps, job, prep && withStuckResearchFailed(prep, deps.now()), job.legacySuggestions);
  } catch (err) {
    return { ok: false, kind: "load_failed", message: errorMessage(err) };
  }
}

/**
 * How long Practice waits for the Process and Company research it draws on.
 * Short enough to leave time to write the Decks within the route's
 * `maxDuration`; after it, Practice uses what's there.
 */
export const RESEARCH_WAIT_MS = 150 * 1000;
const RESEARCH_POLL_MS = 5000;

/** The Process and Company research, once neither is researching (or the wait is up). */
export async function waitForResearch(deps: InterviewPrepDeps, jobId: string, waitMs = RESEARCH_WAIT_MS): Promise<Research> {
  const until = Date.parse(deps.now()) + waitMs;
  for (;;) {
    const saved = await deps.store.find(jobId);
    const prep = saved && withStuckResearchFailed(saved, deps.now());
    const busy = !!prep && (prep.sections.process.status === "researching" || prep.sections.company.status === "researching");
    if (!busy || Date.parse(deps.now()) >= until) {
      return { process: prep?.sections.process.data ?? null, company: prep?.sections.company.data ?? null };
    }
    await deps.sleep(RESEARCH_POLL_MS);
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
    return { ok: true, data: await generate({ job, careerStory, previous, research: () => waitForResearch(deps, job.id) }) };
  } catch (err) {
    if (err instanceof SectionNotImplementedError) {
      return { ok: false, reason: "not_implemented", message: "This section isn't available yet." };
    }
    return { ok: false, reason: "error", message: errorMessage(err) };
  }
}

/**
 * The generator's result, put onto the section as saved now. Practice cards
 * are only added: anything saved while the generator ran (a mark, an own
 * question, More like this) is kept, and the generator's new cards go after it.
 */
function mergeResult<K extends SectionKey>(
  key: K,
  latest: SectionData[K] | null,
  generated: SectionData[K],
  previous: SectionData[K] | null,
): SectionData[K] {
  if (key !== "practice") return generated;
  const before = new Set((previous as PracticeData | null)?.cards.map((c) => c.id) ?? []);
  const added = (generated as PracticeData).cards.filter((c) => !before.has(c.id));
  return addCards(latest as PracticeData | null, added) as SectionData[K];
}

/**
 * After a Company refresh: adds a few About this company cards drawing on the
 * new research, repeating none of the Deck's questions. Only when Practice
 * already has cards and isn't researching itself (a Practice refresh draws
 * on the new research on its own). Cards are only added, to the cards as
 * saved now. Writing them is extra: if it can't be done, the Interview Prep
 * is returned as it was, and the Company refresh still succeeded.
 */
async function addCompanyCards(deps: InterviewPrepDeps, job: InterviewPrepJob, prep: InterviewPrep): Promise<InterviewPrep> {
  const { process, company } = prep.sections;
  const practice = withStuckSectionFailed(prep.sections.practice, deps.now());
  if (company.status !== "ready" || !practice.data?.cards.length || practice.status === "researching") return prep;
  try {
    const careerStory = await deps.careerStory.load();
    if (!careerStory) return prep;
    const cards = await deps.practice.write(
      { job, careerStory, research: { process: process.data, company: company.data } },
      { deck: "company", count: REFRESH_COMPANY_COUNT, avoid: questionsIn(practice.data, "company") },
    );
    return await deps.store.updateSection(job.id, "practice", (current) => ({ ...current, data: addCards(current.data, cards) }));
  } catch {
    return prep;
  }
}

class AlreadyResearchingError extends Error {}

/**
 * Researches one section of the Job's Interview Prep, creating the Interview
 * Prep if it has none. It's saved as researching first, so another request
 * (or a reload) shows "Researching…", then as ready or failed. The other
 * sections are left as they are, so all three can run at once. A failed
 * refresh keeps the last good result and its date.
 *
 * Practice cards saved while Practice is researching (marks, own questions)
 * are kept: the new cards are added to them. A Company refresh also adds a
 * few About this company cards to a Practice that has cards.
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
  try {
    job = await deps.jobs.find(jobId);
    if (!job) return { ok: false, kind: "not_found", message: "Job not found" };
  } catch (err) {
    return { ok: false, kind: "load_failed", message: errorMessage(err) };
  }

  let previous: SectionData[K] | null = null;
  try {
    await deps.store.updateSection(jobId, key, (saved) => {
      const current = withStuckSectionFailed(saved, deps.now());
      if (current.status === "researching") throw new AlreadyResearchingError();
      previous = current.data;
      return { ...current, status: "researching", startedAt: deps.now(), failure: null };
    });
  } catch (err) {
    if (err instanceof AlreadyResearchingError) {
      return { ok: false, kind: "already_researching", message: "This section is already being researched." };
    }
    return { ok: false, kind: "save_failed", message: errorMessage(err) };
  }

  const result = await research(deps, key, job, previous);

  try {
    let prep = await deps.store.updateSection(jobId, key, (current): Section<SectionData[K]> =>
      result.ok
        ? {
            status: "ready",
            researchedAt: deps.now(),
            data: mergeResult(key, current.data, result.data, previous),
            startedAt: null,
            failure: null,
          }
        : { ...current, status: "failed", startedAt: null, failure: { reason: result.reason, message: result.message } },
    );
    if (key === "company") prep = await addCompanyCards(deps, job, prep);
    let legacySuggestions = job.legacySuggestions;
    if (prep.sections[key].status === "ready" && legacySuggestions !== null) {
      await deps.jobs.clearLegacySuggestions(jobId);
      legacySuggestions = null;
    }
    return interviewPrepState(deps, job, prep, legacySuggestions);
  } catch (err) {
    return { ok: false, kind: "save_failed", message: errorMessage(err) };
  }
}
