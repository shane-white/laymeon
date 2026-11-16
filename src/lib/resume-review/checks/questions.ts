/**
 * "Questions a recruiter may ask." Gaps and short jobs aren't problems, and
 * these checks never say they are: they're labeled info, so users can be
 * ready to explain them.
 */
import { formatMonth, unionIntervals } from "@/lib/profile/dates";
import { check, plural, type CheckContext, type Position } from "../context";
import type { CheckResult } from "../types";

const MIN_GAP_MONTHS = 6;
const SHORT_JOB_MONTHS = 12;
const SHORT_JOBS_MIN = 3;
const SHORT_JOBS_WINDOW_YEARS = 10;
// Short by design, so they don't count as short stays.
const EXPECTED_SHORT = new Set(["internship", "contract", "freelance", "volunteer"]);

export function questionChecks(ctx: CheckContext): CheckResult[] {
  if (ctx.positions.length === 0) return [];
  return [gaps(ctx), shortJobs(ctx)];
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function monthName(index: number): string {
  const [year, month] = formatMonth(index).split("-").map(Number);
  return `${MONTHS[month - 1]} ${year}`;
}

function gaps(ctx: CheckContext): CheckResult {
  const intervals = unionIntervals(
    ctx.positions.map((p) => p.interval).filter((i): i is NonNullable<Position["interval"]> => i !== null),
  );
  const found: string[] = [];
  for (let i = 1; i < intervals.length; i++) {
    const months = intervals[i].start - intervals[i - 1].end;
    if (months >= MIN_GAP_MONTHS) {
      found.push(`${monthName(intervals[i - 1].end)} – ${monthName(intervals[i].start - 1)} (${plural(months, "month")})`);
    }
  }
  // The end is exclusive, and the month the resume was added counts as worked for a current job.
  const last = intervals.at(-1);
  if (last && ctx.asOf + 1 - last.end >= MIN_GAP_MONTHS) {
    found.push(`Since ${monthName(last.end)} (${plural(ctx.asOf + 1 - last.end, "month")})`);
  }

  if (found.length === 0) {
    return check("questions.gaps", "good", `No gaps longer than ${MIN_GAP_MONTHS} months between jobs.`);
  }
  return check(
    "questions.gaps",
    "info",
    `There ${found.length === 1 ? "is a gap" : `are ${found.length} gaps`} of ${MIN_GAP_MONTHS} months or more between jobs. Gaps are common and rarely rule anyone out, but a recruiter may ask. A short line on the resume (study, caregiving, a career break) can answer it up front.`,
    found,
    { gaps: found.length },
  );
}

function shortJobs(ctx: CheckContext): CheckResult {
  const since = ctx.asOf - SHORT_JOBS_WINDOW_YEARS * 12;
  const short = ctx.positions.filter(
    (p) =>
      p.interval &&
      !p.current &&
      p.interval.start >= since &&
      !EXPECTED_SHORT.has(p.employmentType ?? "") &&
      p.interval.end - p.interval.start < SHORT_JOB_MONTHS,
  );
  if (short.length < SHORT_JOBS_MIN) {
    return check("questions.short_jobs", "good", "No pattern of very short jobs.");
  }
  return check(
    "questions.short_jobs",
    "info",
    `${plural(short.length, "job")} in the last ${SHORT_JOBS_WINDOW_YEARS} years lasted under a year. A recruiter may ask why. If some were contracts or the company closed, say so next to the job.`,
    short.map((p) => `${[p.title, p.employer].filter(Boolean).join(", ")} (${p.start} – ${p.end})`),
    { shortJobs: short.length },
  );
}
