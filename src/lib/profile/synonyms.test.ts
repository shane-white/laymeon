import { describe, expect, it, vi } from "vitest";

// Only the pure parts are tested; the module also creates the Anthropic client.
vi.mock("@/lib/anthropic/client", () => ({ anthropic: {}, CLAUDE_MODEL: "test", getResponseText: vi.fn() }));

const { synonymsHash, toSynonymMap } = await import("./synonyms");
const { buildProfile } = await import("./build");

const skill = (name: string, category: "hard_skill" | "tool" = "hard_skill") => ({ name, aliases: [], category });

describe("toSynonymMap", () => {
  const skills = [skill("User Research"), skill("UX Research"), skill("Customer Interviews"), skill("User Interviews"), skill("SQL")];

  it("maps each member to the group's first skill in list order", () => {
    expect(toSynonymMap([{ names: ["UX Research", "User Research"] }], skills)).toEqual({ "uxresearch": "userresearch" });
  });

  it("drops names that aren't skills, repeats, and groups of one", () => {
    expect(
      toSynonymMap(
        [
          { names: ["User Interviews", "Customer Interviews", "Made Up"] },
          { names: ["Customer Interviews", "SQL"] },
          { names: ["SQL", "SQL"] },
        ],
        skills,
      ),
    ).toEqual({ userinterviews: "customerinterviews" });
  });
});

describe("synonymsHash", () => {
  it("doesn't depend on order, but does on the names", () => {
    expect(synonymsHash([skill("A"), skill("B")])).toBe(synonymsHash([skill("B"), skill("A")]));
    expect(synonymsHash([skill("A"), skill("B")])).not.toBe(synonymsHash([skill("A"), skill("C")]));
  });
});

describe("buildProfile with synonyms", () => {
  const markdown = `**UX Researcher** — Fieldnote (2017-01 – 2018-12)
**Product Manager** — Lumen (2019-01 – 2020-12)
User Research, UX Research`;
  const position = (employer: string, title: string, start: string, end: string, skills: string[]) => ({
    employer,
    title,
    titleFamily: title,
    location: "",
    employmentType: "unknown" as const,
    start,
    end,
    peopleManaged: 0,
    achievements: [],
    skills,
    evidence: "",
  });
  const docs = [
    {
      document: { id: "r", name: "Résumé", type: "resume" as const, markdown, asOf: "2026-11-01T00:00:00Z", targetRole: null },
      extraction: {
        headline: "",
        seniority: "experienced" as const,
        positions: [
          position("Lumen", "Product Manager", "2019-01", "2020-12", ["User Research"]),
          position("Fieldnote", "UX Researcher", "2017-01", "2018-12", ["UX Research"]),
        ],
        skills: [
          { name: "User Research", canonicalName: "User Research", category: "hard_skill" as const, evidence: "User Research" },
          { name: "UX Research", canonicalName: "UX Research", category: "hard_skill" as const, evidence: "UX Research" },
        ],
        education: [],
        certifications: [],
        languages: [],
      },
    },
  ];

  it("folds a group into one skill, with the other names as aliases and both jobs' years", () => {
    const profile = buildProfile(docs, "2026-11-13T00:00:00Z", {
      skillSynonyms: { hash: "h", map: { uxresearch: "userresearch" } },
    });
    expect(profile.skills).toHaveLength(1);
    expect(profile.skills[0]).toMatchObject({ key: "user-research", name: "User Research", aliases: ["UX Research"], months: 48 });
    expect(profile.skillSynonyms?.hash).toBe("h");
  });

  it("keeps them apart without synonyms", () => {
    expect(buildProfile(docs, "2026-11-13T00:00:00Z").skills).toHaveLength(2);
  });
});
