import { describe, expect, it } from "vitest";
import { classifySearchWord, createResumeMatcher, tokenize } from "./search-words";

const RESUME = createResumeMatcher(`# Sam Rivera

**Backend Engineer** — Acme (2020–2024)

- Built data pipelines in Python and JavaScript on Postgres
- Set up CI/CD with GitHub Actions; deployed services to Kubernetes
- Maintained C\\+\\+ and C# libraries; wrote unit tests
- Led on-time payments project; managed REST APIs
`);

describe("tokenize", () => {
  it("lowercases and splits on punctuation", () => {
    expect(tokenize("CI/CD")).toEqual(["ci", "cd"]);
    expect(tokenize("CI-CD")).toEqual(["ci", "cd"]);
    expect(tokenize("Node.js")).toEqual(["node", "js"]);
  });

  it("keeps + and # on words", () => {
    expect(tokenize("C++ and C#")).toEqual(["c++", "and", "c#"]);
    expect(tokenize("C\\+\\+")).toEqual(["c++"]);
  });

  it("strips simple plurals", () => {
    expect(tokenize("pipelines libraries processes APIs")).toEqual([
      "pipeline",
      "library",
      "process",
      "api",
    ]);
    expect(tokenize("analysis status access")).toEqual(["analysis", "status", "access"]);
  });
});

describe("createResumeMatcher", () => {
  it("ignores case, punctuation and plurals", () => {
    expect(RESUME.contains("python")).toBe(true);
    expect(RESUME.contains("Data Pipeline")).toBe(true);
    expect(RESUME.contains("REST API")).toBe(true);
    expect(RESUME.contains("unit testing")).toBe(false);
  });

  it("matches acronyms with or without separators", () => {
    expect(RESUME.contains("CI/CD")).toBe(true);
    expect(RESUME.contains("CI-CD")).toBe(true);
    expect(RESUME.contains("CICD")).toBe(true);
    expect(RESUME.contains("GitHub Actions")).toBe(true);
    expect(RESUME.contains("Github-Actions")).toBe(true);
  });

  it("matches whole words only", () => {
    expect(RESUME.contains("Java")).toBe(false);
    expect(RESUME.contains("JavaScript")).toBe(true);
    expect(RESUME.contains("C")).toBe(false);
    expect(RESUME.contains("C++")).toBe(true);
    expect(RESUME.contains("C#")).toBe(true);
    expect(RESUME.contains("Go")).toBe(false);
  });

  it("requires words to be consecutive", () => {
    expect(RESUME.contains("payments project")).toBe(true);
    expect(RESUME.contains("payments APIs")).toBe(false);
  });

  it("never matches an empty phrase", () => {
    expect(RESUME.contains("")).toBe(false);
    expect(RESUME.contains("—")).toBe(false);
  });
});

describe("classifySearchWord", () => {
  it("is found when the posting's term is in the resume", () => {
    expect(classifySearchWord("Python", [], RESUME)).toEqual({
      term: "Python",
      status: "found",
      resumeWording: null,
      similarity: null,
    });
  });

  it("is similar wording (same thing) for PostgreSQL vs Postgres", () => {
    expect(
      classifySearchWord("PostgreSQL", [{ wording: "Postgres", similarity: "same_meaning" }], RESUME),
    ).toEqual({
      term: "PostgreSQL",
      status: "similar",
      resumeWording: "Postgres",
      similarity: "same_meaning",
    });
  });

  it("is similar wording (related) for ETL vs data pipelines", () => {
    expect(
      classifySearchWord("ETL", [{ wording: "data pipelines", similarity: "related" }], RESUME),
    ).toMatchObject({ status: "similar", resumeWording: "data pipelines", similarity: "related" });
  });

  it("uses the first proposed wording that's really in the resume", () => {
    expect(
      classifySearchWord(
        "Container orchestration",
        [
          { wording: "Docker Swarm", similarity: "same_meaning" },
          { wording: "Kubernetes", similarity: "related" },
        ],
        RESUME,
      ),
    ).toMatchObject({ status: "similar", resumeWording: "Kubernetes", similarity: "related" });
  });

  it("is not found when a proposed wording isn't in the resume", () => {
    expect(
      classifySearchWord("Java", [{ wording: "Java 17", similarity: "same_meaning" }], RESUME),
    ).toEqual({ term: "Java", status: "not_found", resumeWording: null, similarity: null });
  });
});
