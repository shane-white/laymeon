import { JOB_STATUSES, isJobStatus, type JobStatus } from "@/lib/jobs/statuses";

export const STATUS_FILTER_STORAGE_KEY = "job-status-filter";

export const DEFAULT_STATUS_FILTER: readonly JobStatus[] = [
  "interested",
  "applied",
  "interviewing",
];

/** Keeps statuses in their canonical order and drops duplicates. */
function normalize(statuses: Iterable<JobStatus>): JobStatus[] {
  const set = new Set(statuses);
  return JOB_STATUSES.map((s) => s.value).filter((v) => set.has(v));
}

/**
 * Reads a stored filter. Falls back to the default when the value is missing,
 * malformed, or selects no known status.
 */
export function parseStatusFilter(raw: string | null): JobStatus[] {
  if (!raw) return [...DEFAULT_STATUS_FILTER];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const statuses = normalize(parsed.filter(isJobStatus));
      if (statuses.length > 0) return statuses;
    }
  } catch {}
  return [...DEFAULT_STATUS_FILTER];
}

export function isDefaultStatusFilter(filter: readonly JobStatus[]): boolean {
  const normalized = normalize(filter);
  return (
    normalized.length === DEFAULT_STATUS_FILTER.length &&
    normalized.every((s, i) => s === DEFAULT_STATUS_FILTER[i])
  );
}

/**
 * Turns a status on or off. The last selected status can't be turned off,
 * so the filter is returned unchanged in that case.
 */
export function toggleStatus(
  filter: readonly JobStatus[],
  status: JobStatus,
): JobStatus[] {
  if (filter.includes(status)) {
    if (filter.length === 1) return [...filter];
    return normalize(filter.filter((s) => s !== status));
  }
  return normalize([...filter, status]);
}

export function addStatus(
  filter: readonly JobStatus[],
  status: JobStatus,
): JobStatus[] {
  return normalize([...filter, status]);
}

export function matchesStatusFilter(
  status: string,
  filter: readonly JobStatus[],
): boolean {
  return (filter as readonly string[]).includes(status);
}

export function countByStatus(
  jobs: readonly { status: string }[],
): Record<JobStatus, number> {
  const counts = Object.fromEntries(
    JOB_STATUSES.map((s) => [s.value, 0]),
  ) as Record<JobStatus, number>;
  for (const job of jobs) {
    if (isJobStatus(job.status)) counts[job.status]++;
  }
  return counts;
}
