/**
 * Recomputes the profile's derived values from its own fields: position
 * months, skill years and last use, experience by role, and the summary's
 * totals. Used after the user's changes, so an edited date or a newly linked
 * skill updates the numbers. On a profile fresh from buildProfile it changes
 * nothing.
 */
import { formatMonth, monthOfIsoDate, rangeToInterval, totalMonths, type MonthIndex, type MonthInterval } from "./dates";
import { roleKey } from "./keys";
import type { CareerProfile } from "./schema";

/** "present" means as of the newest document, or of the build when there are none. */
export function presentMonth(profile: Pick<CareerProfile, "sources" | "builtAt">): MonthIndex {
  return profile.sources.length
    ? Math.max(...profile.sources.map((s) => monthOfIsoDate(s.asOf)))
    : monthOfIsoDate(profile.builtAt);
}

function comparePositions(
  a: { interval: MonthInterval | null; index: number },
  b: { interval: MonthInterval | null; index: number },
): number {
  if (a.interval && b.interval) {
    return b.interval.end - a.interval.end || b.interval.start - a.interval.start || a.index - b.index;
  }
  if (a.interval) return -1;
  if (b.interval) return 1;
  return a.index - b.index;
}

export function recomputeDerived(profile: CareerProfile): CareerProfile {
  const present = presentMonth(profile);

  // Positions: months, and most recent first.
  const withIntervals = profile.positions.map((p, index) => ({
    p,
    index,
    interval: rangeToInterval(p.start, p.end, present),
  }));
  withIntervals.sort(comparePositions);
  const intervalOf = new Map(withIntervals.map(({ p, interval }) => [p.key, interval]));
  const positionKeys = new Set(withIntervals.map(({ p }) => p.key));
  const positionOrder = new Map(withIntervals.map(({ p }, i) => [p.key, i]));

  // Skills are the source of truth for which jobs used them.
  const skills = profile.skills
    .map((s) => {
      const linked = s.positionKeys
        .filter((k) => positionKeys.has(k))
        .sort((a, b) => positionOrder.get(a)! - positionOrder.get(b)!);
      const intervals = linked.map((k) => intervalOf.get(k) ?? null);
      const months = s.monthsOverride ?? totalMonths(intervals);
      const ends = intervals.filter((i) => i !== null).map((i) => i.end);
      const current = linked.some((k) => profile.positions.find((p) => p.key === k)?.end === "present");
      const lastUsed = current ? "present" : ends.length ? formatMonth(Math.max(...ends) - 1) : null;
      return { ...s, positionKeys: linked, months, lastUsed };
    })
    .sort(
      (a, b) =>
        (b.months ?? -1) - (a.months ?? -1) ||
        b.evidence.length - a.evidence.length ||
        a.key.localeCompare(b.key),
    );

  const positions = withIntervals.map(({ p, interval }) => ({
    ...p,
    isCurrent: p.end === "present",
    months: interval ? interval.end - interval.start : null,
    skillKeys: skills
      .filter((s) => s.positionKeys.includes(p.key))
      .map((s) => s.key)
      .sort(),
  }));

  // Experience by role.
  const roleMap = new Map<string, { titleFamily: string; positionKeys: string[] }>();
  for (const p of positions) {
    const key = roleKey(p.titleFamily);
    const role = roleMap.get(key) ?? { titleFamily: p.titleFamily, positionKeys: [] };
    role.positionKeys.push(p.key);
    roleMap.set(key, role);
  }
  const roles = [...roleMap.entries()]
    .map(([key, role]) => ({
      key,
      titleFamily: role.titleFamily,
      months: totalMonths(role.positionKeys.map((k) => intervalOf.get(k) ?? null)),
      positionKeys: role.positionKeys,
    }))
    .sort((a, b) => (b.months ?? -1) - (a.months ?? -1) || a.key.localeCompare(b.key));

  // Accomplishments of a job that's gone go with it.
  const accomplishments = profile.accomplishments.filter(
    (a) => !a.positionKey || positionKeys.has(a.positionKey),
  );

  return {
    ...profile,
    summary: {
      ...profile.summary,
      currentTitle: positions.find((p) => p.isCurrent)?.title ?? null,
      totalMonths: totalMonths(
        positions.filter((p) => p.employmentType !== "volunteer").map((p) => intervalOf.get(p.key) ?? null),
      ),
    },
    positions,
    skills,
    roles,
    accomplishments,
  };
}
