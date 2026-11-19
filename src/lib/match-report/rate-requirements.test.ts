import { describe, expect, it } from "vitest";
import { JEV_MODEL, rateRequirements, type JevClient } from "./rate-requirements";

const requirements = [
  { text: "Experience with PostgreSQL", importance: "must_have" as const, category: "tool" as const },
  { text: "Experience mentoring other engineers", importance: "nice_to_have" as const, category: "experience" as const },
];

/** Answers each question with the given level probabilities (missing, partial, strong), or leaves it out. */
function fakeClient(answers: Record<string, [number, number, number] | undefined>) {
  const requests: Parameters<JevClient["systemOne"]>[0][] = [];
  const client: JevClient = {
    async systemOne(request) {
      requests.push(request);
      const entries = Object.entries(answers)
        .filter((e): e is [string, [number, number, number]] => e[1] !== undefined)
        .map(([id, [missing, partial, strong]]) => [
          id,
          { type: "score", score: partial + 2 * strong, confidence: 0.5, legend: {}, probabilities: { 0: missing, 1: partial, 2: strong } },
        ]);
      return { model: "jev-1.14.0", answers: Object.fromEntries(entries), usage: { input_tokens: 900, output_tokens: 20 } } as never;
    },
  };
  return { client, requests };
}

describe("rateRequirements", () => {
  it("rates each Requirement with its most likely level, in the listed order", async () => {
    const { client } = fakeClient({ requirement_0: [0.05, 0.15, 0.8], requirement_1: [0.3, 0.6, 0.1] });

    const result = await rateRequirements({ resume: "Postgres", jobTitle: "Backend Engineer", requirements }, client);

    expect(result.ratings).toEqual([
      { match: "strong", probabilities: { missing: 0.05, partial: 0.15, strong: 0.8 } },
      { match: "partial", probabilities: { missing: 0.3, partial: 0.6, strong: 0.1 } },
    ]);
    expect(result.model).toBe("jev-1.14.0");
  });

  it("asks one Score per Requirement about the resume and the Job title only, on the pinned model", async () => {
    const { client, requests } = fakeClient({ requirement_0: [0, 0, 1], requirement_1: [1, 0, 0] });

    await rateRequirements({ resume: "Postgres", jobTitle: "Backend Engineer", requirements }, client);

    expect(requests).toHaveLength(1);
    expect(requests[0].model).toBe(JEV_MODEL);
    expect(requests[0].state).toEqual({ resume: "Postgres", job_title: "Backend Engineer" });
    expect(Object.keys(requests[0].questions)).toEqual(["requirement_0", "requirement_1"]);
    expect(requests[0].questions.requirement_1).toMatchObject({ type: "score" });
    expect(JSON.stringify(requests[0].questions.requirement_1.instructions)).toContain("Experience mentoring other engineers");
  });

  it("throws when a Requirement comes back without an answer, rather than calling it missing", async () => {
    const { client } = fakeClient({ requirement_0: [0, 0, 1], requirement_1: undefined });

    await expect(
      rateRequirements({ resume: "Postgres", jobTitle: "Backend Engineer", requirements }, client),
    ).rejects.toThrow(/Experience mentoring other engineers/);
  });

  it("doesn't call Jev when there's nothing to rate", async () => {
    const { client, requests } = fakeClient({});

    const result = await rateRequirements({ resume: "Postgres", jobTitle: "Backend Engineer", requirements: [] }, client);

    expect(result.ratings).toEqual([]);
    expect(requests).toHaveLength(0);
  });
});
