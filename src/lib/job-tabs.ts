import type { AnalysisType, UserJob } from "@/hooks/use-jobs";

/**
 * "resume_suggestions" is the Tailoring view and "interview_suggestions" is
 * Interview Prep; the keys stay so tabs saved in localStorage still open.
 */
export type TabKey = "description" | AnalysisType | "resume_suggestions" | "notes";

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
  if (hasText(job.interview_suggestions) || job.has_interview_prep) tabs.push("interview_suggestions");
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
