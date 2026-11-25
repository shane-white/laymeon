/**
 * News dates. News search gives dates as text, often relative to when the
 * search ran ("3 months ago"), so they're turned into ISO dates (YYYY-MM-DD)
 * when the search runs. A relative date is approximate, which is fine for the
 * month shown.
 */

const UNIT_DAYS: Record<string, number> = { minute: 0, hour: 0, day: 1, week: 7 };

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function monthsBefore(now: Date, months: number): Date {
  const date = new Date(now);
  date.setUTCMonth(date.getUTCMonth() - months);
  return date;
}

/** The news date as an ISO date, or null when the text isn't a date. */
export function newsDate(text: string | null | undefined, now: Date): string | null {
  const trimmed = text?.trim().toLowerCase();
  if (!trimmed) return null;

  const relative = trimmed.match(/^(\d+|an?|one)\s+(minute|hour|day|week|month|year)s?\s+ago$/);
  if (relative) {
    const count = /^\d+$/.test(relative[1]) ? Number(relative[1]) : 1;
    const unit = relative[2];
    if (unit === "month") return isoDate(monthsBefore(now, count));
    if (unit === "year") return isoDate(monthsBefore(now, count * 12));
    return isoDate(new Date(now.getTime() - count * UNIT_DAYS[unit] * 24 * 60 * 60 * 1000));
  }

  // Absolute dates: "Nov 3, 2026", "3 Nov 2026", "2026-10-01". Only text with a
  // four-digit year, so a stray number isn't read as a date.
  if (!/\b\d{4}\b/.test(trimmed)) return null;
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const parsed = iso ? new Date(`${iso[0]}T00:00:00Z`) : new Date(`${trimmed} UTC`);
  return Number.isNaN(parsed.getTime()) ? null : isoDate(parsed);
}

/** True when the ISO date is no more than `months` before now. */
export function withinMonths(date: string, months: number, now: Date): boolean {
  return date >= isoDate(monthsBefore(now, months));
}
