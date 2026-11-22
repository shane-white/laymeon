import { describe, expect, it } from "vitest";
import { buildMatchReport } from "./build";
import { matchReportSchema, type ModelReport } from "./schema";

const model: ModelReport = {
  overall: { reason: "", topFixes: [] },
  screeners: [
    { item: "On-site in Austin, TX", kind: "location", shown: false, evidence: null, careerStoryIds: [] },
    { item: "Bachelor's degree", kind: "degree", shown: true, evidence: "BS in Computer Science", careerStoryIds: [] },
  ],
  requirements: [],
  searchWords: [],
  firstImpression: "",
  nextSteps: [],
};

describe("a Match Report's Screeners", () => {
  it("keep the kind Claude gave them", () => {
    const report = buildMatchReport(model, "Jane Doe. BS in Computer Science.");
    expect(report.screeners.map((s) => [s.item, s.kind])).toEqual([
      ["On-site in Austin, TX", "location"],
      ["Bachelor's degree", "degree"],
    ]);
  });

  it("have no kind in Match Reports made before Screeners had one", () => {
    const report = buildMatchReport(model, "Jane Doe. BS in Computer Science.");
    const older = { ...report, screeners: report.screeners.map((s) => ({ ...s, kind: undefined })) };
    expect(matchReportSchema.parse(older).screeners.map((s) => s.kind)).toEqual([undefined, undefined]);
  });
});
