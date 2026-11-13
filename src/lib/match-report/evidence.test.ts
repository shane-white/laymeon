import { describe, expect, it } from "vitest";
import { normalizeText, quoteInResume, verifyEvidence } from "./evidence";
import type { ModelReport } from "./schema";

const RESUME = `# Jane Doe

**Senior Software Engineer** — Acme Corp (2019–2024)

- Led migration of billing services to *PostgreSQL*, cutting query time by 40%
- Built CI/CD pipelines with GitHub Actions
- Wrote C\\+\\+ tooling for “real-time” data ingestion

Authorized to work in the US.
`;

describe("normalizeText", () => {
  it("lowercases, strips markdown and collapses whitespace", () => {
    expect(normalizeText("**Senior**   Software\n_Engineer_")).toBe("senior software engineer");
  });

  it("unifies smart quotes and dashes", () => {
    expect(normalizeText("“real-time” 2019–2024")).toBe('"real-time" 2019-2024');
  });

  it("removes markdown escapes", () => {
    expect(normalizeText("C\\+\\+")).toBe("c++");
  });
});

describe("quoteInResume", () => {
  it("finds a verbatim quote", () => {
    expect(quoteInResume("Built CI/CD pipelines with GitHub Actions", RESUME)).toBe(true);
  });

  it("ignores markdown, case and quote style", () => {
    expect(quoteInResume("led migration of billing services to PostgreSQL", RESUME)).toBe(true);
    expect(quoteInResume('C++ tooling for "real-time" data', RESUME)).toBe(true);
    expect(quoteInResume("Senior Software Engineer - Acme Corp", RESUME)).toBe(true);
  });

  it("ignores surrounding quote marks and trailing punctuation", () => {
    expect(quoteInResume('"Authorized to work in the US."', RESUME)).toBe(true);
  });

  it("accepts ellipses when the parts appear in order", () => {
    expect(quoteInResume("Led migration ... cutting query time by 40%", RESUME)).toBe(true);
    expect(quoteInResume("cutting query time by 40% ... Led migration", RESUME)).toBe(false);
  });

  it("rejects paraphrases", () => {
    expect(quoteInResume("Migrated billing to Postgres", RESUME)).toBe(false);
    expect(quoteInResume("", RESUME)).toBe(false);
  });
});

describe("verifyEvidence", () => {
  const base: ModelReport = {
    overall: { reason: "", topFixes: [] },
    screeners: [],
    requirements: [],
    searchWords: [],
    firstImpression: "",
    nextSteps: [],
  };
  const req = (
    match: "strong" | "partial" | "missing",
    evidence: string | null,
  ): ModelReport["requirements"][number] => ({
    text: "req",
    importance: "must_have",
    category: "skill",
    match,
    evidence,
    action: null,
    careerStoryIds: [],
  });

  it("keeps verified evidence", () => {
    const { requirements } = verifyEvidence(
      { ...base, requirements: [req("strong", "Built CI/CD pipelines")] },
      RESUME,
    );
    expect(requirements[0]).toMatchObject({ match: "strong", evidence: "Built CI/CD pipelines" });
  });

  it("drops unverified evidence and downgrades strong to partial", () => {
    const { requirements } = verifyEvidence(
      { ...base, requirements: [req("strong", "10 years of Kubernetes")] },
      RESUME,
    );
    expect(requirements[0]).toMatchObject({ match: "partial", evidence: null });
  });

  it("drops unverified evidence on partial without changing the match", () => {
    const { requirements } = verifyEvidence(
      { ...base, requirements: [req("partial", "made up")] },
      RESUME,
    );
    expect(requirements[0]).toMatchObject({ match: "partial", evidence: null });
  });

  it("never keeps evidence on missing requirements", () => {
    const { requirements } = verifyEvidence(
      { ...base, requirements: [req("missing", "Built CI/CD pipelines")] },
      RESUME,
    );
    expect(requirements[0]).toMatchObject({ match: "missing", evidence: null });
  });

  it("marks screeners not shown when their quote isn't in the resume", () => {
    const { screeners } = verifyEvidence(
      {
        ...base,
        screeners: [
          { item: "US work authorization", shown: true, evidence: "Authorized to work in the US", careerStoryIds: [] },
          { item: "Bachelor's degree", shown: true, evidence: "BS in Computer Science", careerStoryIds: [] },
        ],
      },
      RESUME,
    );
    expect(screeners).toEqual([
      { item: "US work authorization", shown: true, evidence: "Authorized to work in the US", careerStoryIds: [] },
      { item: "Bachelor's degree", shown: false, evidence: null, careerStoryIds: [] },
    ]);
  });
});
