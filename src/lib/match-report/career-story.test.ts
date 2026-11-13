import { describe, expect, it } from "vitest";
import { buildProfile } from "@/lib/profile/build";
import { applyUserChanges } from "@/lib/profile/changes";
import { formatCareerStoryForPrompt } from "@/lib/profile/for-prompt";
import { buildMatchReport, resolveCareerStoryRefs } from "./build";
import type { ModelReport } from "./schema";

const MARKDOWN = `**Product Manager** — Ledgerly (2021-01 – present)
- Built ACH payouts for invoice payments
Skills: SQL, Payments`;

const base = buildProfile(
  [
    {
      document: { id: "d", name: "Résumé", type: "resume", markdown: MARKDOWN, asOf: "2026-11-01T00:00:00Z", targetRole: null },
      extraction: {
        headline: "",
        seniority: "experienced",
        positions: [
          {
            employer: "Ledgerly",
            title: "Product Manager",
            titleFamily: "Product Manager",
            location: "",
            employmentType: "unknown",
            start: "2021-01",
            end: "present",
            peopleManaged: 0,
            achievements: [{ text: "Built ACH payouts for invoice payments", metric: "", evidence: "Built ACH payouts for invoice payments" }],
            skills: ["Payments"],
            evidence: "Product Manager** — Ledgerly",
          },
        ],
        skills: [
          { name: "SQL", canonicalName: "SQL", category: "hard_skill", evidence: "SQL" },
          { name: "Payments", canonicalName: "Payments", category: "domain", evidence: "Payments" },
        ],
        education: [],
        certifications: [],
        languages: [],
      },
    },
  ],
  "2026-11-13T00:00:00Z",
);

const profile = applyUserChanges(base, [
  { id: "c1", section: "certification", kind: "add", targetKey: null, fields: { name: "PCI Professional" }, baseSnapshot: null, mergedKeys: null },
]).profile;

const context = formatCareerStoryForPrompt(profile);

describe("formatCareerStoryForPrompt", () => {
  it("gives every item an ID and marks what the candidate stated", () => {
    expect(context.text).toContain("[P1] Product Manager at Ledgerly · Jan 2021 – Present · 5 yrs 11 mos");
    expect(context.text).toContain("[R1] Product Manager · 5 yrs 11 mos");
    expect(context.text).toMatch(/\[S\d\] Payments · 5 yrs 11 mos · used in P1/);
    expect(context.text).toContain("[A1] Built ACH payouts for invoice payments (in P1)");
    expect(context.text).toContain("[C1] PCI Professional (stated by the candidate)");
    expect(context.refs.get("C1")).toMatchObject({ section: "certification", byUser: true });
    expect(context.refs.get("R1")).toMatchObject({ section: "role", label: "Product Manager · 5 yrs 11 mos" });
  });
});

describe("resolveCareerStoryRefs", () => {
  it("keeps real IDs, in order, and drops made-up ones and repeats", () => {
    expect(resolveCareerStoryRefs(["A1", "[c1]", "Z9", "A1"], context).map((r) => r.label)).toEqual([
      "Built ACH payouts for invoice payments",
      "PCI Professional",
    ]);
    expect(resolveCareerStoryRefs(["A1"], undefined)).toEqual([]);
  });
});

describe("buildMatchReport with a Career Story", () => {
  const requirement = (text: string, match: "strong" | "partial" | "missing", evidence: string | null, ids: string[]) => ({
    text,
    importance: "must_have" as const,
    category: "experience" as const,
    match,
    evidence,
    action: match === "strong" ? null : "If true, add it",
    careerStoryIds: ids,
  });
  const model: ModelReport = {
    overall: { reason: "", topFixes: [] },
    screeners: [
      { item: "5+ years of product management", shown: false, evidence: null, careerStoryIds: ["R1"] },
      { item: "SQL", shown: true, evidence: "SQL", careerStoryIds: ["S1"] },
    ],
    requirements: [
      requirement("Payments products", "missing", null, ["A1", "S2"]),
      requirement("SQL", "strong", "SQL", ["S1"]),
    ],
    searchWords: [],
    firstImpression: "",
    nextSteps: [],
  };
  const resume = "Product Manager. SQL.";

  it("adds Career Story items only where the resume falls short", () => {
    const report = buildMatchReport(model, resume, context);
    expect(report.requirements[0].careerStory.map((r) => r.section)).toEqual(["accomplishment", "skill"]);
    expect(report.requirements[1].careerStory).toEqual([]);
    expect(report.screeners[0].careerStory.map((r) => r.label)).toEqual(["Product Manager · 5 yrs 11 mos"]);
    expect(report.screeners[1].careerStory).toEqual([]);
  });

  it("doesn't change the label", () => {
    expect(buildMatchReport(model, resume, context).overall.label).toBe(buildMatchReport(model, resume).overall.label);
  });

  it("adds nothing without a Career Story", () => {
    const report = buildMatchReport(model, resume);
    expect(report.requirements.every((r) => r.careerStory.length === 0)).toBe(true);
  });
});
