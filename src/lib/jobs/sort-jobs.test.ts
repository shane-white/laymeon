import { describe, expect, it } from "vitest";
import { DEFAULT_SORT, parseSort, sortJobs } from "@/lib/jobs/sort-jobs";

interface JobInput {
  id: string;
  sort_order: number;
  created_at?: string;
  status?: string;
  title?: string;
  company?: string | null;
  customTitle?: string | null;
  customCompany?: string | null;
  match?: "strong" | "partial" | "weak" | null;
}

function job(input: JobInput) {
  return {
    id: input.id,
    sort_order: input.sort_order,
    created_at: input.created_at ?? "2026-01-01T00:00:00Z",
    status: input.status ?? "interested",
    custom_job_title: input.customTitle ?? null,
    custom_job_company: input.customCompany ?? null,
    match_report: input.match
      ? ({ overall: { label: input.match } } as never)
      : null,
    job_listing: {
      extracted_job_title: input.title ?? "Job",
      extracted_company_name:
        input.company === undefined ? "Co" : input.company,
    },
  };
}

const ids = (list: { id: string }[]) => list.map((j) => j.id);

describe("parseSort", () => {
  it("accepts known sorts and falls back to custom", () => {
    expect(parseSort('"company"')).toBe("company");
    expect(parseSort('"recent"')).toBe(DEFAULT_SORT);
    expect(parseSort("{bad")).toBe(DEFAULT_SORT);
    expect(parseSort(null)).toBe(DEFAULT_SORT);
  });
});

describe("sortJobs", () => {
  it("keeps the custom order and doesn't change the input", () => {
    const jobs = [
      job({ id: "b", sort_order: 2 }),
      job({ id: "a", sort_order: 1 }),
    ];
    expect(ids(sortJobs(jobs, "custom"))).toEqual(["a", "b"]);
    expect(ids(jobs)).toEqual(["b", "a"]);
  });

  it("sorts by date added", () => {
    const jobs = [
      job({ id: "old", sort_order: 1, created_at: "2026-01-01T00:00:00Z" }),
      job({ id: "new", sort_order: 2, created_at: "2026-03-01T00:00:00Z" }),
    ];
    expect(ids(sortJobs(jobs, "newest"))).toEqual(["new", "old"]);
    expect(ids(sortJobs(jobs, "oldest"))).toEqual(["old", "new"]);
  });

  it("sorts by shown company, ignoring case, with no company last", () => {
    const jobs = [
      job({ id: "none", sort_order: 1, company: null }),
      job({ id: "zeta", sort_order: 2, company: "zeta" }),
      job({
        id: "custom",
        sort_order: 3,
        company: "Zulu",
        customCompany: "Acme",
      }),
      job({ id: "beta", sort_order: 4, company: "Beta" }),
    ];
    expect(ids(sortJobs(jobs, "company"))).toEqual([
      "custom",
      "beta",
      "zeta",
      "none",
    ]);
  });

  it("sorts by shown title", () => {
    const jobs = [
      job({ id: "z", sort_order: 1, title: "Zookeeper" }),
      job({ id: "a", sort_order: 2, title: "Zed", customTitle: "Analyst" }),
    ];
    expect(ids(sortJobs(jobs, "title"))).toEqual(["a", "z"]);
  });

  it("sorts by pipeline status", () => {
    const jobs = ["closed", "interested", "interviewing", "applied"].map(
      (status, i) => job({ id: status, sort_order: i, status }),
    );
    expect(ids(sortJobs(jobs, "status"))).toEqual([
      "interviewing",
      "applied",
      "interested",
      "closed",
    ]);
  });

  it("sorts by match strength with no report last", () => {
    const jobs = [
      job({ id: "none", sort_order: 1, match: null }),
      job({ id: "weak", sort_order: 2, match: "weak" }),
      job({ id: "strong", sort_order: 3, match: "strong" }),
      job({ id: "partial", sort_order: 4, match: "partial" }),
    ];
    expect(ids(sortJobs(jobs, "match"))).toEqual([
      "strong",
      "partial",
      "weak",
      "none",
    ]);
  });

  it("breaks ties with the custom order", () => {
    const jobs = [
      job({ id: "second", sort_order: 2, status: "applied" }),
      job({ id: "first", sort_order: 1, status: "applied" }),
    ];
    expect(ids(sortJobs(jobs, "status"))).toEqual(["first", "second"]);
  });
});
