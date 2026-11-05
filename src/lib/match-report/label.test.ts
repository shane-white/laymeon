import { describe, expect, it } from "vitest";
import { computeOverallLabel } from "./label";

const must = (match: "strong" | "partial" | "missing") =>
  ({ importance: "must_have", match }) as const;
const nice = (match: "strong" | "partial" | "missing") =>
  ({ importance: "nice_to_have", match }) as const;

describe("computeOverallLabel", () => {
  it("is strong when every must-have is strong", () => {
    expect(computeOverallLabel([must("strong"), must("strong"), nice("missing")])).toBe("strong");
  });

  it("is partial when a must-have is only partial", () => {
    expect(computeOverallLabel([must("strong"), must("partial")])).toBe("partial");
  });

  it("is partial with exactly one missing must-have", () => {
    expect(computeOverallLabel([must("strong"), must("missing"), must("partial")])).toBe("partial");
  });

  it("is weak with two or more missing must-haves", () => {
    expect(computeOverallLabel([must("strong"), must("missing"), must("missing")])).toBe("weak");
  });

  it("ignores nice-to-haves when there are must-haves", () => {
    expect(
      computeOverallLabel([must("strong"), nice("missing"), nice("missing"), nice("missing")]),
    ).toBe("strong");
  });

  it("falls back to all requirements when there are no must-haves", () => {
    expect(computeOverallLabel([nice("strong"), nice("strong")])).toBe("strong");
    expect(computeOverallLabel([nice("missing"), nice("missing")])).toBe("weak");
  });

  it("is partial when there are no requirements", () => {
    expect(computeOverallLabel([])).toBe("partial");
  });
});
