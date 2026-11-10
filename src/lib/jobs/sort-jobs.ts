import type { UserJob } from "@/hooks/use-jobs";
import { displayCompany, displayTitle } from "@/lib/jobs/display";
import { compareSortOrder } from "@/lib/jobs/sort-order";

export const SORT_STORAGE_KEY = "job-sort";

export const JOB_SORTS = [
  { value: "custom", label: "Custom" },
  { value: "newest", label: "Newest added" },
  { value: "oldest", label: "Oldest added" },
  { value: "company", label: "Company A–Z" },
  { value: "title", label: "Job title A–Z" },
  { value: "status", label: "Status" },
  { value: "match", label: "Match strength" },
] as const;

export type JobSort = (typeof JOB_SORTS)[number]["value"];

export const DEFAULT_SORT: JobSort = "custom";

export function parseSort(raw: string | null): JobSort {
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    const match = JOB_SORTS.find((s) => s.value === parsed);
    if (match) return match.value;
  } catch {}
  return DEFAULT_SORT;
}

/** Pipeline order: furthest along first. */
const STATUS_RANK: Record<string, number> = {
  interviewing: 0,
  applied: 1,
  interested: 2,
  closed: 3,
};

const MATCH_RANK: Record<string, number> = { strong: 0, partial: 1, weak: 2 };

type SortableJob = Pick<
  UserJob,
  | "sort_order"
  | "created_at"
  | "status"
  | "match_report"
  | "custom_job_title"
  | "custom_job_company"
> & {
  job_listing: Pick<
    UserJob["job_listing"],
    "extracted_job_title" | "extracted_company_name"
  >;
};

const compareText = (a: string, b: string) =>
  a.localeCompare(b, undefined, { sensitivity: "base", numeric: true });

/** Missing values (null) sort last. */
function compareNullable<T>(
  a: T | null,
  b: T | null,
  compare: (a: T, b: T) => number,
) {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return compare(a, b);
}

const rank = (map: Record<string, number>, key: string | undefined) =>
  key !== undefined && key in map ? map[key] : null;

function comparatorFor(
  sort: JobSort,
): ((a: SortableJob, b: SortableJob) => number) | null {
  switch (sort) {
    case "custom":
      return null;
    case "newest":
      return (a, b) => b.created_at.localeCompare(a.created_at);
    case "oldest":
      return (a, b) => a.created_at.localeCompare(b.created_at);
    case "company":
      return (a, b) =>
        compareNullable(
          displayCompany(a) || null,
          displayCompany(b) || null,
          compareText,
        );
    case "title":
      return (a, b) => compareText(displayTitle(a), displayTitle(b));
    case "status":
      return (a, b) =>
        compareNullable(
          rank(STATUS_RANK, a.status),
          rank(STATUS_RANK, b.status),
          (x, y) => x - y,
        );
    case "match":
      return (a, b) =>
        compareNullable(
          rank(MATCH_RANK, a.match_report?.overall?.label),
          rank(MATCH_RANK, b.match_report?.overall?.label),
          (x, y) => x - y,
        );
  }
}

/** Returns a new array in the given sort. Ties keep the custom order. */
export function sortJobs<T extends SortableJob>(
  jobs: readonly T[],
  sort: JobSort,
): T[] {
  const compare = comparatorFor(sort);
  return [...jobs].sort(
    (a, b) => compare?.(a, b) || 0 || compareSortOrder(a, b),
  );
}
