import { describe, expect, it } from "vitest";
import { practiceCard } from "../testing";
import { hasEarlierHint, markCounts } from "./cards";

describe("markCounts", () => {
  it("counts each mark, leaving out the ones with none", () => {
    const cards = [
      practiceCard({ id: "a", mark: "feels_good" }),
      practiceCard({ id: "b", mark: "feels_good" }),
      practiceCard({ id: "c", mark: "practice_more" }),
      practiceCard({ id: "d" }),
      practiceCard({ id: "e", mark: "feels_good" }),
      practiceCard({ id: "f", mark: "feels_good" }),
      practiceCard({ id: "g", mark: "practice_more" }),
    ];
    expect(markCounts(cards)).toBe("4 feel good · 2 to practice more · 1 not tried yet");
    expect(markCounts([practiceCard({ mark: "feels_good" }), practiceCard({ id: "b" }), practiceCard({ id: "c" })])).toBe(
      "1 feels good · 2 not tried yet",
    );
  });

  it("is empty for no cards", () => {
    expect(markCounts([])).toBe("");
  });
});

describe("hasEarlierHint", () => {
  it("is true for a hint built from a Career Story other than the one now", () => {
    expect(hasEarlierHint(practiceCard({ hintBasis: "old" }), "new")).toBe(true);
  });

  it("is false for a hint built from the Career Story now", () => {
    expect(hasEarlierHint(practiceCard({ hintBasis: "new" }), "new")).toBe(false);
  });

  it("is false for a card with no hint yet, or one being written again", () => {
    expect(hasEarlierHint(practiceCard({ hint: null, hintBasis: null, hintStatus: "failed" }), "new")).toBe(false);
    expect(hasEarlierHint(practiceCard({ hintBasis: "old", hintStatus: "writing" }), "new")).toBe(false);
  });

  it("is false when there's no Career Story to compare with", () => {
    expect(hasEarlierHint(practiceCard({ hintBasis: "old" }), null)).toBe(false);
  });
});
