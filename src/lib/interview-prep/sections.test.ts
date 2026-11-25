import { describe, expect, it } from "vitest";
import { emptySection, emptySections, hasAnyResult, initialSection } from "./sections";
import { sampleData } from "./testing";
import type { InterviewPrep } from "./interview-prep";

function prep(sections: Partial<InterviewPrep["sections"]>): InterviewPrep {
  return { jobId: "job-1", version: 1, updatedAt: "", sections: { ...emptySections(), ...sections } };
}

describe("initialSection", () => {
  it("opens on Process when there's no Interview Prep", () => {
    expect(initialSection(null)).toBe("process");
  });

  it("opens on Process while Practice has no cards yet", () => {
    expect(initialSection(prep({ practice: { ...emptySection(), status: "researching", startedAt: "x" } }))).toBe("process");
  });

  it("opens on Practice once it exists, even while it's refreshing", () => {
    expect(
      initialSection(prep({ practice: { ...emptySection(), status: "researching", data: sampleData.practice, researchedAt: "x" } })),
    ).toBe("practice");
  });
});

describe("hasAnyResult", () => {
  it("is false until a section has a result, even if one failed", () => {
    expect(hasAnyResult(null)).toBe(false);
    expect(hasAnyResult(prep({ process: { ...emptySection(), status: "failed", failure: { reason: "error", message: "x" } } }))).toBe(false);
  });

  it("is true once any section has a result", () => {
    expect(hasAnyResult(prep({ company: { ...emptySection(), status: "ready", data: sampleData.company, researchedAt: "x" } }))).toBe(true);
  });
});
