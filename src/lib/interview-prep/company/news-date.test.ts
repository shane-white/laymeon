import { describe, expect, it } from "vitest";
import { newsDate, withinMonths } from "./news-date";

const NOW = new Date("2026-11-25T12:00:00.000Z");

describe("newsDate", () => {
  it.each([
    ["1 day ago", "2026-11-24"],
    ["3 hours ago", "2026-11-25"],
    ["2 weeks ago", "2026-11-11"],
    ["3 months ago", "2026-08-25"],
    ["1 year ago", "2025-11-25"],
    ["Nov 3, 2026", "2026-11-03"],
    ["3 Nov 2026", "2026-11-03"],
    ["2026-10-01", "2026-10-01"],
  ])("reads %j as %s", (text, expected) => {
    expect(newsDate(text, NOW)).toBe(expected);
  });

  it.each([undefined, "", "sometime", "yesterday-ish"])("gives null for %j", (text) => {
    expect(newsDate(text, NOW)).toBeNull();
  });
});

describe("withinMonths", () => {
  it("keeps dates from the last 6 months and drops older ones", () => {
    expect(withinMonths("2026-06-01", 6, NOW)).toBe(true);
    expect(withinMonths("2026-05-24", 6, NOW)).toBe(false);
  });
});
