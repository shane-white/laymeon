import { describe, expect, it } from "vitest";
import { emptySection, emptySections, hasAnyResult, initialSection, withSectionsInFlight } from "./sections";
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

describe("withSectionsInFlight", () => {
  const researching = { ...emptySection<never>(), status: "researching" as const, startedAt: "2026-11-25T18:00:00.000Z" };
  const shown = prep({ process: researching, company: researching, practice: researching });

  it("keeps the fetched Interview Prep when no section request is in flight", () => {
    const fetched = prep({});
    expect(withSectionsInFlight(fetched, shown, [])).toBe(fetched);
    expect(withSectionsInFlight(null, shown, [])).toBeNull();
  });

  it("keeps what's shown when the server hasn't saved anything yet but sections are being researched", () => {
    expect(withSectionsInFlight(null, shown, ["process", "company", "practice"])).toBe(shown);
  });

  it("keeps the shown state of sections in flight and takes the rest from the server", () => {
    const company = { ...emptySection(), status: "ready" as const, data: sampleData.company, researchedAt: "x" };
    const fetched = prep({ company });
    const result = withSectionsInFlight(fetched, shown, ["process", "practice"]);
    expect(result?.sections.process).toBe(researching);
    expect(result?.sections.practice).toBe(researching);
    expect(result?.sections.company).toBe(company);
  });

  it("takes the server's Interview Prep when nothing is shown yet", () => {
    const fetched = prep({});
    expect(withSectionsInFlight(fetched, null, ["process"])).toBe(fetched);
  });
});
