/**
 * Month arithmetic for the Career Story. Dates come from documents as "YYYY-MM"
 * or, when a document only gives the year, "YYYY". A date range is turned
 * into a half-open interval of months [start, end), so "Jan 2020 – Mar 2020"
 * is 3 months.
 */

/** A month counted from year 0: year * 12 + (month - 1). */
export type MonthIndex = number;

export interface MonthInterval {
  start: MonthIndex;
  /** Exclusive. */
  end: MonthIndex;
}

export interface ParsedDate {
  year: number;
  /** 1–12, or null when the document only gives the year. */
  month: number | null;
}

const DATE_PATTERN = /^(\d{4})(?:-(\d{1,2}))?$/;

// Year-only dates are treated as the middle of the year, so on average they
// neither over- nor under-count. "2019 – 2021" is 24 months.
const MID_YEAR_MONTH = 7;

// A year-only range that starts and ends in the same year ("2021 – 2021")
// counts as half a year.
const SAME_YEAR_MONTHS = 6;

/** Parses "YYYY" or "YYYY-MM". Anything else is null. */
export function parseProfileDate(value: string | null | undefined): ParsedDate | null {
  if (!value) return null;
  const match = DATE_PATTERN.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = match[2] ? Number(match[2]) : null;
  if (year < 1900 || year > 2200) return null;
  if (month !== null && (month < 1 || month > 12)) return null;
  return { year, month };
}

/** Returns the date as "YYYY-MM" or "YYYY", or null if it isn't valid. */
export function cleanProfileDate(value: string | null | undefined): string | null {
  const parsed = parseProfileDate(value);
  if (!parsed) return null;
  return parsed.month === null
    ? String(parsed.year)
    : `${parsed.year}-${String(parsed.month).padStart(2, "0")}`;
}

export function toMonthIndex(year: number, month: number): MonthIndex {
  return year * 12 + (month - 1);
}

/** "2026-11-13" (or any ISO timestamp) → its month. */
export function monthOfIsoDate(iso: string): MonthIndex {
  const [year, month] = iso.slice(0, 7).split("-").map(Number);
  return toMonthIndex(year, month);
}

/** A month as "YYYY-MM". */
export function formatMonth(index: MonthIndex): string {
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function isPresent(value: string | null | undefined): boolean {
  return value?.trim().toLowerCase() === "present";
}

/**
 * The months a position covers, or null if its dates can't be counted (no
 * start, or no end and not current). "present" ends at `asOf`, the month the
 * document was written, including that month. Dates after `asOf` are capped.
 */
export function rangeToInterval(
  start: string | null,
  end: string | null,
  asOf: MonthIndex,
): MonthInterval | null {
  const startDate = parseProfileDate(start);
  if (!startDate) return null;

  const startIndex = toMonthIndex(startDate.year, startDate.month ?? MID_YEAR_MONTH);
  const lastCountable = asOf + 1;

  let endIndex: MonthIndex;
  let bothYearOnly = false;
  if (isPresent(end)) {
    endIndex = lastCountable;
  } else {
    const endDate = parseProfileDate(end);
    if (!endDate) return null;
    endIndex =
      endDate.month === null
        ? toMonthIndex(endDate.year, MID_YEAR_MONTH)
        : toMonthIndex(endDate.year, endDate.month) + 1;
    bothYearOnly = startDate.month === null && endDate.month === null;
  }

  endIndex = Math.min(endIndex, lastCountable);
  if (startIndex >= lastCountable) return null;

  // A range that ends where it starts (or before) still counts for something.
  if (endIndex <= startIndex) {
    endIndex = Math.min(startIndex + (bothYearOnly ? SAME_YEAR_MONTHS : 1), lastCountable);
  }

  return { start: startIndex, end: endIndex };
}

/** Merges overlapping or touching intervals. */
export function unionIntervals(intervals: MonthInterval[]): MonthInterval[] {
  const sorted = [...intervals].sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: MonthInterval[] = [];
  for (const interval of sorted) {
    const last = merged.at(-1);
    if (last && interval.start <= last.end) {
      last.end = Math.max(last.end, interval.end);
    } else {
      merged.push({ ...interval });
    }
  }
  return merged;
}

/** Total months covered, counting overlapping months once. Null if there's nothing to count. */
export function totalMonths(intervals: (MonthInterval | null)[]): number | null {
  const known = intervals.filter((i): i is MonthInterval => i !== null);
  if (known.length === 0) return null;
  return unionIntervals(known).reduce((sum, i) => sum + (i.end - i.start), 0);
}

/** Months two intervals share. */
export function overlapMonths(a: MonthInterval, b: MonthInterval): number {
  return Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));
}
