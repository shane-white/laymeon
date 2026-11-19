import { describe, expect, it } from "vitest";
import { computeOverallLabel, countMissingConsidered } from "./label";

type Match = "strong" | "partial" | "missing";
const must = (match: Match) => ({ importance: "must_have", match }) as const;
const nice = (match: Match) => ({ importance: "nice_to_have", match }) as const;
const musts = (counts: Partial<Record<Match, number>>) =>
  (["strong", "partial", "missing"] as const).flatMap((m) =>
    Array.from({ length: counts[m] ?? 0 }, () => must(m)),
  );

describe("computeOverallLabel", () => {
  it("is perfect when every must-have is strong", () => {
    expect(computeOverallLabel([must("strong"), must("strong"), nice("missing")])).toBe("perfect");
  });

  it("is strong with under 17% missing and over 60% of the rest strong", () => {
    // 1 of 6 missing (16.7%), 4 of 5 strong.
    expect(computeOverallLabel(musts({ strong: 4, partial: 1, missing: 1 }))).toBe("strong");
    // Nothing missing, 2 of 3 strong.
    expect(computeOverallLabel(musts({ strong: 2, partial: 1 }))).toBe("strong");
  });

  it("drops to partial with under 17% missing but 60% or fewer of the rest strong", () => {
    expect(computeOverallLabel(musts({ strong: 3, partial: 2 }))).toBe("partial");
    expect(computeOverallLabel(musts({ strong: 1, partial: 1 }))).toBe("partial");
  });

  it("is partial with 17–30% missing and at least 20% of the rest strong", () => {
    // 1 of 5 missing (20%), 1 of 4 strong.
    expect(computeOverallLabel(musts({ strong: 1, partial: 3, missing: 1 }))).toBe("partial");
    // 3 of 10 missing (exactly 30%), all of the rest strong.
    expect(computeOverallLabel(musts({ strong: 7, missing: 3 }))).toBe("partial");
  });

  it("drops to weak with 17–30% missing and under 20% of the rest strong", () => {
    expect(computeOverallLabel(musts({ partial: 4, missing: 1 }))).toBe("weak");
  });

  it("is weak with over 30% missing, however many of the rest are strong", () => {
    expect(computeOverallLabel(musts({ strong: 2, missing: 1 }))).toBe("weak");
    expect(computeOverallLabel(musts({ missing: 2 }))).toBe("weak");
  });

  it("ignores nice-to-haves when there are must-haves", () => {
    expect(
      computeOverallLabel([must("strong"), nice("missing"), nice("missing"), nice("missing")]),
    ).toBe("perfect");
  });

  it("falls back to all requirements when there are no must-haves", () => {
    expect(computeOverallLabel([nice("strong"), nice("strong")])).toBe("perfect");
    expect(computeOverallLabel([nice("missing"), nice("missing")])).toBe("weak");
  });

  it("is partial when there are no requirements", () => {
    expect(computeOverallLabel([])).toBe("partial");
  });
});

describe("countMissingConsidered", () => {
  it("counts missing must-haves only", () => {
    expect(countMissingConsidered([must("missing"), must("strong"), nice("missing")])).toBe(1);
  });

  it("counts all requirements when there are no must-haves", () => {
    expect(countMissingConsidered([nice("missing"), nice("missing"), nice("strong")])).toBe(2);
  });
});
