/** Display helpers for the Career Story page. */
import type { CareerProfile, SeniorityLevel } from "./schema";

type Skill = CareerProfile["skills"][number];
type SkillCategory = Skill["category"];

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** 14 → "1 yr 2 mos", 24 → "2 yrs", 8 → "8 mos". Null for no duration. */
export function formatDuration(months: number | null): string | null {
  if (months == null || months <= 0) return null;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  if (years === 0) return plural(rest, "mo");
  if (rest === 0) return plural(years, "yr");
  return `${plural(years, "yr")} ${plural(rest, "mo")}`;
}

/** Shorter, for chips: 8 → "8 mos", 14 → "1 yr", 30 → "2.5 yrs", 55 → "4.5 yrs". */
export function formatDurationShort(months: number | null): string | null {
  if (months == null || months <= 0) return null;
  if (months < 12) return plural(months, "mo");
  const years = Math.round((months / 12) * 2) / 2;
  return `${years} ${years === 1 ? "yr" : "yrs"}`;
}

/** "2021-03" → "Mar 2021", "2019" → "2019", "present" → "Present". */
export function formatProfileDate(value: string | null): string | null {
  if (!value) return null;
  if (value === "present") return "Present";
  const [year, month] = value.split("-");
  return month ? `${MONTH_NAMES[Number(month) - 1]} ${year}` : year;
}

/** "Mar 2021 – Present", "2019 – 2022", or just one end if the other is missing. */
export function formatDateRange(start: string | null, end: string | null): string | null {
  const from = formatProfileDate(start);
  const to = formatProfileDate(end);
  if (from && to) return from === to ? from : `${from} – ${to}`;
  return from ?? to;
}

/** "3 yrs" or "3 yrs, until 2021", for a skill. */
export function describeSkillUse(skill: Pick<Skill, "months" | "lastUsed">): string | null {
  const duration = formatDurationShort(skill.months);
  if (!skill.lastUsed || skill.lastUsed === "present") return duration;
  const until = `until ${skill.lastUsed.slice(0, 4)}`;
  return duration ? `${duration}, ${until}` : until;
}

export const SENIORITY_LABELS: Record<SeniorityLevel, string> = {
  entry: "Early career",
  experienced: "Experienced",
  senior: "Senior",
  manager: "Manager",
  senior_manager: "Senior manager",
  executive: "Executive",
  senior_executive: "Senior executive",
};

/** Skill groups in page order. Tools get their own section. */
export const SKILL_GROUPS: { category: SkillCategory; title: string }[] = [
  { category: "hard_skill", title: "Skills" },
  { category: "domain", title: "Industries and fields" },
  { category: "method", title: "Ways of working" },
  { category: "soft_skill", title: "Working with people" },
];

/** Skills in a category, most experience first (the profile's order). */
export function skillsIn(profile: CareerProfile, category: SkillCategory): Skill[] {
  return profile.skills.filter((s) => s.category === category);
}

/** The skills to feature at the top: the most experienced ones that aren't soft skills. */
export function topSkills(profile: CareerProfile, count = 6): Skill[] {
  return profile.skills.filter((s) => s.category !== "soft_skill" && s.months).slice(0, count);
}

/**
 * True when the user's documents changed after the profile was built: one was
 * added, edited or deleted.
 */
export function isProfileStale(
  profile: CareerProfile,
  documents: { id: string; updated_at: string }[],
): boolean {
  const built = new Set(profile.sources.map((s) => s.documentId));
  const current = new Set(documents.map((d) => d.id));
  if (built.size !== current.size) return true;
  const builtAt = Date.parse(profile.builtAt);
  return documents.some((d) => !built.has(d.id) || Date.parse(d.updated_at) > builtAt);
}
