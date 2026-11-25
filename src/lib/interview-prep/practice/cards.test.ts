import { describe, expect, it } from "vitest";
import { practiceCard } from "../testing";
import { markCounts } from "./cards";

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
