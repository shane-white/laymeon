/** Pure helpers for an Interview Prep's sections. Safe to import on the client. */
import { SECTION_KEYS, type InterviewPrep, type Section, type SectionKey, type Sections } from "./interview-prep";

export function emptySection<T>(): Section<T> {
  return { status: "not_started", researchedAt: null, data: null, startedAt: null, failure: null };
}

export function emptySections(): Sections {
  return { process: emptySection(), company: emptySection(), practice: emptySection() };
}

/**
 * How long a section can be researching before it's taken to have stopped
 * (the request timed out or the server restarted). Longer than the route's
 * `maxDuration`, so a request still running is never cut off.
 */
export const RESEARCH_TIME_LIMIT_MS = 6 * 60 * 1000;

function stuck(section: Section<unknown>, now: string): boolean {
  if (section.status !== "researching") return false;
  const started = Date.parse(section.startedAt ?? "");
  return Number.isNaN(started) || Date.parse(now) - started > RESEARCH_TIME_LIMIT_MS;
}

/** The section, shown as failed if it's stuck researching past the time limit. */
export function withStuckSectionFailed<T>(section: Section<T>, now: string): Section<T> {
  if (!stuck(section, now)) return section;
  return {
    ...section,
    status: "failed",
    startedAt: null,
    failure: { reason: "error", message: "Research stopped before it finished. Try again." },
  };
}

/** The Interview Prep with any section stuck researching past the time limit shown as failed. */
export function withStuckResearchFailed(prep: InterviewPrep, now: string): InterviewPrep {
  const sections = { ...prep.sections };
  for (const key of SECTION_KEYS) {
    sections[key] = withStuckSectionFailed(sections[key] as Section<unknown>, now) as never;
  }
  return { ...prep, sections };
}

/**
 * A freshly loaded Interview Prep, merged with what's shown while section
 * requests are still in flight. A load can land before a request has saved
 * "researching" (or anything at all), and must not undo it: sections being
 * researched keep their shown state until their own request answers.
 */
export function withSectionsInFlight(
  fetched: InterviewPrep | null,
  shown: InterviewPrep | null,
  inFlight: readonly SectionKey[],
): InterviewPrep | null {
  if (inFlight.length === 0 || !shown) return fetched;
  if (!fetched) return shown;
  const sections = { ...fetched.sections };
  for (const key of inFlight) sections[key] = shown.sections[key] as never;
  return { ...fetched, sections };
}

/** The section the tab opens on: Practice once it exists, Process otherwise. */
export function initialSection(prep: InterviewPrep | null): SectionKey {
  return prep?.sections.practice.data ? "practice" : "process";
}

/** Whether any section has a result to show. */
export function hasAnyResult(prep: InterviewPrep | null): boolean {
  return !!prep && SECTION_KEYS.some((key) => prep.sections[key].data !== null);
}
