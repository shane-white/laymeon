import { describe, expect, it } from "vitest";
import { assembleModelReport } from "./assemble";
import type { ListedReport, WriteUp } from "./schema";

const listed: ListedReport = {
  screeners: [{ item: "Bachelor's degree", kind: "degree", shown: false, evidence: null }],
  requirements: [
    { text: "PostgreSQL", importance: "must_have", category: "tool" },
    { text: "Kubernetes", importance: "must_have", category: "tool" },
    { text: "Rust", importance: "nice_to_have", category: "skill" },
  ],
  searchWords: [{ term: "PostgreSQL", resumeWordings: [{ wording: "Postgres", similarity: "same_meaning" }] }],
  firstImpression: "A backend engineer.",
};

const writeUp: WriteUp = {
  overall: { reason: "Close match.", topFixes: ["Name Kubernetes"] },
  // Out of order on purpose: entries are matched by index, not position.
  requirements: [
    { index: 2, evidence: null, action: "If true, add Rust", careerStoryIds: [] },
    { index: 0, evidence: "Postgres", action: null, careerStoryIds: [] },
    { index: 1, evidence: "GKE", action: "If true, name Kubernetes", careerStoryIds: ["S1"] },
  ],
  screeners: [{ index: 0, careerStoryIds: ["E1"] }],
  nextSteps: [{ text: "If true, add Rust", relatesTo: "Rust" }],
};

describe("assembleModelReport", () => {
  it("puts each Requirement's rating and write-up together in the listed order", () => {
    const report = assembleModelReport(listed, ["strong", "partial", "missing"], writeUp);

    expect(report.requirements).toEqual([
      { text: "PostgreSQL", importance: "must_have", category: "tool", match: "strong", evidence: "Postgres", action: null, careerStoryIds: [] },
      { text: "Kubernetes", importance: "must_have", category: "tool", match: "partial", evidence: "GKE", action: "If true, name Kubernetes", careerStoryIds: ["S1"] },
      { text: "Rust", importance: "nice_to_have", category: "skill", match: "missing", evidence: null, action: "If true, add Rust", careerStoryIds: [] },
    ]);
    expect(report.screeners).toEqual([{ item: "Bachelor's degree", kind: "degree", shown: false, evidence: null, careerStoryIds: ["E1"] }]);
    expect(report.overall).toEqual(writeUp.overall);
    expect(report.nextSteps).toEqual(writeUp.nextSteps);
    expect(report.searchWords).toEqual(listed.searchWords);
    expect(report.firstImpression).toBe("A backend engineer.");
  });

  it("refuses a write-up that skips, repeats or invents a Requirement or Screener", () => {
    const bad: WriteUp = {
      ...writeUp,
      requirements: [writeUp.requirements[1], writeUp.requirements[1], { ...writeUp.requirements[0], index: 7 }],
      screeners: [],
    };
    expect(() => assembleModelReport(listed, ["strong", "partial", "missing"], bad)).toThrow(
      "requirement 0 appears 2 times; requirement 1 is missing; requirement 2 is missing; requirement 7 isn't in the list; screener 0 is missing",
    );
  });

  it("refuses ratings that don't match the Requirements one to one", () => {
    expect(() => assembleModelReport(listed, ["strong", "partial"], writeUp)).toThrow(/3 Requirements but 2 ratings/);
  });
});
