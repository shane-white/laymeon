import {
  monthOfIsoDate,
  rangeToInterval,
  totalMonths,
  isPresent,
  type MonthIndex,
  type MonthInterval,
} from "@/lib/profile/dates";
import { knownOrNull } from "@/lib/profile/schema";
import { parseResume, stripMarkdown, workBullets, type ParsedResume } from "./text";
import {
  CODE_CHECKS,
  MAX_EVIDENCE,
  type CheckLabel,
  type CheckResult,
  type CodeCheckId,
  type CodeCheckInput,
} from "./types";

/** A position from the Career Story extraction, with its dates as months. */
export interface Position {
  title: string;
  employer: string;
  employmentType: string | null;
  /** Null when its dates can't be counted. */
  interval: MonthInterval | null;
  current: boolean;
  achievements: number;
  /** How the resume writes the dates, for evidence. */
  start: string;
  end: string;
}

export interface CheckContext {
  input: CodeCheckInput;
  resume: ParsedResume;
  /** Bullets that describe work (Experience and Projects). */
  bullets: string[];
  /** Everything but the header, without markdown. */
  body: string;
  asOf: MonthIndex;
  /** Empty when there's no extraction. Most recent first. */
  positions: Position[];
  /** Null when there's no extraction or no countable dates. */
  yearsOfExperience: number | null;
}

// Experience that isn't a regular job doesn't count toward years of experience.
const NOT_A_JOB = new Set(["volunteer", "internship"]);

export function buildContext(input: CodeCheckInput): CheckContext {
  const resume = parseResume(input.markdown);
  const asOf = monthOfIsoDate(input.asOf);

  const positions: Position[] = (input.extraction?.positions ?? [])
    .map((p) => ({
      title: p.title,
      employer: p.employer,
      employmentType: knownOrNull(p.employmentType),
      interval: rangeToInterval(p.start || null, p.end || null, asOf),
      current: isPresent(p.end),
      achievements: p.achievements.length,
      start: p.start,
      end: p.end,
    }))
    // Most recent first: by when the job ended (current jobs first), then when it started.
    // Jobs without dates go last.
    .sort(
      (a, b) =>
        (b.interval?.end ?? -Infinity) - (a.interval?.end ?? -Infinity) ||
        (b.interval?.start ?? -Infinity) - (a.interval?.start ?? -Infinity),
    );

  const jobMonths = totalMonths(
    positions.filter((p) => !NOT_A_JOB.has(p.employmentType ?? "")).map((p) => p.interval),
  );

  return {
    input,
    resume,
    bullets: workBullets(resume),
    body: resume.sections
      .flatMap((s) => [s.heading, ...s.lines])
      .map(stripMarkdown)
      .join("\n"),
    asOf,
    positions,
    yearsOfExperience: jobMonths === null ? null : jobMonths / 12,
  };
}

/** "Pathstream (Data Specialist)", for evidence. Titles can contain commas, so the employer goes first. */
export function describePosition(p: { title: string; employer: string }): string {
  if (p.employer && p.title) return `${p.employer} (${p.title})`;
  return p.employer || p.title || "A job";
}

export function check(
  id: CodeCheckId,
  label: CheckLabel,
  summary: string,
  evidence: string[] = [],
  data?: CheckResult["data"],
): CheckResult {
  return {
    id,
    section: CODE_CHECKS[id],
    label,
    summary,
    evidence: [...new Set(evidence)].slice(0, MAX_EVIDENCE),
    ...(data ? { data } : {}),
  };
}

export { plural } from "@/lib/utils";

export function share(part: number, whole: number): number {
  return whole === 0 ? 0 : part / whole;
}

export function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}
