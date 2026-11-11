import { z } from "zod";

// Keep these lists in sync with the check constraints on public.job_listings.
export const workArrangementSchema = z.enum(["on_site", "hybrid", "remote"]);
export const seniorityLevelSchema = z.enum([
  "intern",
  "junior",
  "mid",
  "senior",
  "staff",
  "principal",
  "lead",
  "manager",
  "director",
  "vp",
  "executive",
]);

export type WorkArrangement = z.infer<typeof workArrangementSchema>;
export type SeniorityLevel = z.infer<typeof seniorityLevelSchema>;

export const workArrangementLabels: Record<WorkArrangement, string> = {
  on_site: "On-site",
  hybrid: "Hybrid",
  remote: "Remote",
};

export const seniorityLevelLabels: Record<SeniorityLevel, string> = {
  intern: "Intern",
  junior: "Junior",
  mid: "Mid-level",
  senior: "Senior",
  staff: "Staff",
  principal: "Principal",
  lead: "Lead",
  manager: "Manager",
  director: "Director",
  vp: "VP",
  executive: "Executive",
};

interface LocationFields {
  location: string | null;
  work_arrangement: string | null;
}

/**
 * The location line for the job header, e.g. "Austin, TX · Hybrid" or "Remote".
 * Returns null when the posting gave neither. Unknown arrangement values are ignored.
 */
export function formatLocation({ location, work_arrangement }: LocationFields): string | null {
  const arrangement =
    work_arrangement && work_arrangement in workArrangementLabels
      ? workArrangementLabels[work_arrangement as WorkArrangement]
      : null;
  const place = location?.trim() || null;
  if (place && arrangement) {
    // Avoid "Remote · Remote" when the posting's location is just "Remote".
    if (place.toLowerCase() === arrangement.toLowerCase()) return arrangement;
    return `${place} · ${arrangement}`;
  }
  return place ?? arrangement;
}

/** The display label for a stored level, or null when it's missing or unknown. */
export function formatSeniorityLevel(level: string | null): string | null {
  if (!level || !(level in seniorityLevelLabels)) return null;
  return seniorityLevelLabels[level as SeniorityLevel];
}
