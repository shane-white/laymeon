export const JOB_STATUSES = [
  { value: "interested", label: "Interested" },
  { value: "applied", label: "Applied" },
  { value: "interviewing", label: "Interviewing" },
  { value: "closed", label: "Closed" },
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number]["value"];

const statusValues: readonly string[] = JOB_STATUSES.map((s) => s.value);

export function isJobStatus(value: unknown): value is JobStatus {
  return typeof value === "string" && statusValues.includes(value);
}

export function statusLabel(status: string): string {
  return JOB_STATUSES.find((s) => s.value === status)?.label ?? status;
}

export const statusColors: Record<string, string> = {
  interested: "bg-green-500/20 text-green-400",
  applied: "bg-yellow-500/20 text-yellow-400",
  interviewing: "bg-blue-500/20 text-blue-400",
  closed: "bg-muted text-muted-foreground",
};

/** Solid dot color per status, for compact indicators such as menu rows. */
export const statusDotColors: Record<string, string> = {
  interested: "bg-green-500",
  applied: "bg-yellow-500",
  interviewing: "bg-blue-500",
  closed: "bg-muted-foreground",
};
