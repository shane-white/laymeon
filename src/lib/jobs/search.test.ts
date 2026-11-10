import { describe, expect, it } from "vitest";
import { findMatch, foldQuery, foldText } from "@/lib/jobs/search";

function match(text: string, query: string) {
  const range = findMatch(foldText(text), foldQuery(query));
  return range && text.slice(range[0], range[1]);
}

describe("search matching", () => {
  it("matches any part, ignoring case", () => {
    expect(match("Senior Engineer", "eng")).toBe("Eng");
    expect(match("Senior Engineer", "NIOR E")).toBe("nior E");
  });

  it("ignores accents on either side", () => {
    expect(match("Café Co", "cafe")).toBe("Café");
    expect(match("Cafe Co", "café")).toBe("Cafe");
  });

  it("maps back correctly when the original uses combining marks", () => {
    const decomposed = "Café Co"; // e + combining acute
    expect(match(decomposed, "cafe co")).toBe(decomposed);
    expect(match(decomposed, "co")).toBe("Co");
  });

  it("handles characters before the match that change length when folded", () => {
    expect(match("Ærø Ölgaard", "olg")).toBe("Ölg");
  });

  it("returns null for no match or an empty query", () => {
    expect(match("Senior Engineer", "xyz")).toBeNull();
    expect(match("Senior Engineer", "   ")).toBeNull();
  });
});
