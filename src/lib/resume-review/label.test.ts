import { describe, expect, it } from "vitest";
import { CHECK_PRIORITY, computeOverallLabel, orderFixes } from "./label";
import type { CheckLabel, CheckId } from "./types";
import { CHECK_IDS } from "./types";

// Each check gets its own ID, so none of them overlap.
const labels = (...list: CheckLabel[]) => list.map((label, i) => ({ label, id: CHECK_IDS[i % 30] }));
const repeat = (label: CheckLabel, n: number) => Array<CheckLabel>(n).fill(label);

describe("computeOverallLabel", () => {
  it("is Ready to send with no Fix this and up to 5 Could improve", () => {
    expect(computeOverallLabel(labels("good", "good"))).toBe("ready");
    expect(computeOverallLabel(labels(...repeat("could_improve", 5), "good"))).toBe("ready");
  });

  it("is A few fixes with one Fix this, or more than 5 Could improve", () => {
    expect(computeOverallLabel(labels("fix", "good"))).toBe("few_fixes");
    expect(computeOverallLabel(labels(...repeat("could_improve", 6)))).toBe("few_fixes");
    expect(computeOverallLabel(labels("fix", "fix", ...repeat("could_improve", 9)))).toBe("few_fixes");
  });

  it("is Needs work with 3 Fix this, or 12 problems in all", () => {
    expect(computeOverallLabel(labels(...repeat("fix", 3)))).toBe("needs_work");
    expect(computeOverallLabel(labels("fix", ...repeat("could_improve", 11)))).toBe("needs_work");
  });

  it("counts overlapping checks once, with the worse label", () => {
    const sameWeakness = [
      { id: "bullets.numbers" as const, label: "fix" as const },
      { id: "bullets.achievements" as const, label: "fix" as const },
      { id: "writing.typos" as const, label: "fix" as const },
    ];
    expect(computeOverallLabel(sameWeakness)).toBe("few_fixes");
    expect(computeOverallLabel([{ id: "bullets.numbers", label: "good" }, { id: "bullets.achievements", label: "fix" }])).toBe(
      "few_fixes",
    );
  });

  it("never counts Information", () => {
    expect(computeOverallLabel(labels(...repeat("info", 20)))).toBe("ready");
  });
});

describe("orderFixes", () => {
  const check = (id: CheckId, label: CheckLabel) => ({ id, label, summary: id });

  it("puts Fix this first, then orders by priority, and leaves out Good and Information", () => {
    const fixes = orderFixes([
      check("writing.cliches", "could_improve"),
      check("bullets.numbers", "fix"),
      check("readability.reading_order", "could_improve"),
      check("readability.text_layer", "fix"),
      check("questions.gaps", "info"),
      check("basics.contact", "good"),
    ]);
    expect(fixes.map((f) => f.checkId)).toEqual([
      "readability.text_layer",
      "bullets.numbers",
      "readability.reading_order",
      "writing.cliches",
    ]);
  });
});

it("every check that can be a problem has a priority", () => {
  const informationOnly = ["questions.gaps", "questions.short_jobs"];
  const missing = CHECK_IDS.filter((id) => !informationOnly.includes(id) && !CHECK_PRIORITY.includes(id));
  expect(missing).toEqual([]);
});
