import { describe, expect, it } from "vitest";
import {
  DEFAULT_STATUS_FILTER,
  addStatus,
  countByStatus,
  isDefaultStatusFilter,
  matchesStatusFilter,
  parseStatusFilter,
  toggleStatus,
} from "@/lib/jobs/status-filter";

describe("parseStatusFilter", () => {
  it("returns the default when nothing is stored", () => {
    expect(parseStatusFilter(null)).toEqual(DEFAULT_STATUS_FILTER);
  });

  it("returns the default for malformed JSON or non-arrays", () => {
    expect(parseStatusFilter("{nope")).toEqual(DEFAULT_STATUS_FILTER);
    expect(parseStatusFilter('"closed"')).toEqual(DEFAULT_STATUS_FILTER);
  });

  it("drops unknown statuses and keeps canonical order", () => {
    expect(parseStatusFilter('["closed","bogus","interested","closed"]')).toEqual([
      "interested",
      "closed",
    ]);
  });

  it("returns the default when no known status remains", () => {
    expect(parseStatusFilter('["bogus"]')).toEqual(DEFAULT_STATUS_FILTER);
    expect(parseStatusFilter("[]")).toEqual(DEFAULT_STATUS_FILTER);
  });
});

describe("toggleStatus", () => {
  it("adds and removes statuses", () => {
    expect(toggleStatus(["interested"], "closed")).toEqual(["interested", "closed"]);
    expect(toggleStatus(["interested", "closed"], "closed")).toEqual(["interested"]);
  });

  it("never removes the last selected status", () => {
    expect(toggleStatus(["applied"], "applied")).toEqual(["applied"]);
  });
});

describe("isDefaultStatusFilter", () => {
  it("ignores order", () => {
    expect(isDefaultStatusFilter(["interviewing", "interested", "applied"])).toBe(true);
    expect(isDefaultStatusFilter(["interested", "applied"])).toBe(false);
    expect(isDefaultStatusFilter(addStatus(DEFAULT_STATUS_FILTER, "closed"))).toBe(false);
  });
});

describe("matchesStatusFilter and countByStatus", () => {
  it("filters and counts jobs by status", () => {
    const jobs = [
      { status: "interested" },
      { status: "closed" },
      { status: "closed" },
      { status: "applied" },
    ];
    expect(jobs.filter((j) => matchesStatusFilter(j.status, DEFAULT_STATUS_FILTER))).toHaveLength(2);
    expect(countByStatus(jobs)).toEqual({
      interested: 1,
      applied: 1,
      interviewing: 0,
      closed: 2,
    });
  });
});
