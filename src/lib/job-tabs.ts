import type { UserJob } from "@/hooks/use-jobs";

export const TAB_KEYS = [
  "description",
  "match_analysis",
  // The Tailoring view; the key stays so tabs saved in localStorage still open.
  "resume_suggestions",
  "cover_letter_suggestions",
  "interview_prep",
  "notes",
] as const;

export type TabKey = (typeof TAB_KEYS)[number];

/** Tab keys saved in localStorage before a tab was renamed, and the tab each one is now. */
const RENAMED_TABS: Record<string, TabKey> = { interview_suggestions: "interview_prep" };

type JobContent = Pick<
  UserJob,
  | "match_analysis"
  | "match_report"
  | "cover_letter_suggestions"
  | "interview_suggestions"
  | "has_interview_prep"
  | "notes"
>;

function hasText(value: string | null | undefined): boolean {
  return !!value && value.trim().length > 0;
}

/** Tabs whose saved content should show even if never opened in this browser, in tab-menu order. */
export function getTabsWithContent(job: JobContent): TabKey[] {
  const tabs: TabKey[] = [];
  if (hasText(job.match_analysis) || job.match_report) tabs.push("match_analysis");
  if (hasText(job.cover_letter_suggestions)) tabs.push("cover_letter_suggestions");
  if (hasText(job.interview_suggestions) || job.has_interview_prep) tabs.push("interview_prep");
  if (hasText(job.notes)) tabs.push("notes");
  return tabs;
}

/**
 * Open tabs for a job: Description first, then the tabs remembered in this
 * browser (in their stored order), then any tab with saved content not already open.
 */
export function getInitialTabs(job: JobContent, storedTabs: TabKey[] | null): TabKey[] {
  const tabs: TabKey[] = ["description"];
  for (const tab of [...(storedTabs ?? []), ...getTabsWithContent(job)]) {
    if (!tabs.includes(tab)) tabs.push(tab);
  }
  return tabs;
}

/**
 * The tabs saved in this browser for a Job (as stored in localStorage), or
 * null when there are none or they can't be read. A tab saved under an older
 * key opens as the tab it is now; unknown tabs are dropped.
 */
export function parseStoredTabs(stored: string | null): TabKey[] | null {
  if (!stored) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(stored);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || !parsed.includes("description")) return null;
  return parsed
    .map((tab) => (typeof tab === "string" ? (RENAMED_TABS[tab] ?? tab) : null))
    .filter((tab): tab is TabKey => (TAB_KEYS as readonly unknown[]).includes(tab));
}
