import { describe, expect, it } from "vitest";
import type { Decision, Suggestion, Tailoring, TailoringItem } from "@/lib/tailoring/tailoring";
import { allowedDecisions } from "@/lib/tailoring/decisions";
import { acceptedCount, resumeView, stepItem, withDecision, type ViewBlock, type ViewInline } from "./view";

const MARKDOWN = [
  "# Jane Doe",
  "",
  "## Experience",
  "",
  "### Product Manager, Ledgerly",
  "- Shipped **billing** to 40 customers",
  "- Ran weekly user interviews",
  "",
  "## Skills",
  "",
  "SQL, Figma",
].join("\n");

function item(id: string, overrides: Partial<TailoringItem> = {}): TailoringItem {
  return {
    id,
    target: { kind: "requirement", text: `Requirement ${id}`, importance: "must_have", category: "skill", match: "missing" },
    careerStory: [],
    suggestion: null,
    gap: false,
    decision: { status: "undecided" },
    ...overrides,
  };
}

const rewrite = (quote: string, text: string): Suggestion => ({ kind: "rewrite", quote, text, why: "Why", evidence: [] });
const addAfter = (quote: string, text: string): Suggestion => ({
  kind: "add",
  anchor: { type: "after", quote },
  text,
  why: "Why",
  evidence: [],
});
const addIn = (heading: string, text: string): Suggestion => ({
  kind: "add",
  anchor: { type: "section", heading },
  text,
  why: "Why",
  evidence: [],
});

function tailoring(items: TailoringItem[], markdown = MARKDOWN): Tailoring {
  return {
    id: "t-1",
    jobId: "job-1",
    resumeId: "resume-1",
    version: 1,
    markdown,
    items,
    matchReportGeneratedAt: "2026-11-02T00:00:00.000Z",
    resumeContentHash: "hash-1",
    createdAt: "2026-11-03T00:00:00.000Z",
    updatedAt: "2026-11-03T00:00:00.000Z",
  };
}

const decided = (decision: Decision) => ({ decision });

function inlines(block: ViewBlock): ViewInline[] {
  if (block.kind === "add") throw new Error("Expected a block of the Resume's text, not an Add");
  return block.inlines;
}

describe("resumeView", () => {
  it("shows the Markdown as headings, bullets and paragraphs, without Markdown marks", () => {
    expect(resumeView(tailoring([])).blocks).toEqual([
      { kind: "heading", level: 1, inlines: [{ kind: "text", text: "Jane Doe" }] },
      { kind: "heading", level: 2, inlines: [{ kind: "text", text: "Experience" }] },
      { kind: "heading", level: 3, inlines: [{ kind: "text", text: "Product Manager, Ledgerly" }] },
      { kind: "bullet", inlines: [{ kind: "text", text: "Shipped billing to 40 customers" }] },
      { kind: "bullet", inlines: [{ kind: "text", text: "Ran weekly user interviews" }] },
      { kind: "heading", level: 2, inlines: [{ kind: "text", text: "Skills" }] },
      { kind: "paragraph", inlines: [{ kind: "text", text: "SQL, Figma" }] },
    ]);
  });

  it("highlights the text a Rewrite would change, numbered in the items' order", () => {
    const view = resumeView(
      tailoring([
        item("a", { suggestion: rewrite("Ran weekly user interviews", "Ran 60 user interviews") }),
        item("b", { suggestion: rewrite("40 customers", "40 enterprise customers") }),
      ]),
    );
    expect(inlines(view.blocks[3])).toEqual([
      { kind: "text", text: "Shipped billing to " },
      { kind: "rewrite", itemId: "b", number: 2, text: "40 customers", status: "undecided" },
    ]);
    expect(inlines(view.blocks[4])).toEqual([
      { kind: "rewrite", itemId: "a", number: 1, text: "Ran weekly user interviews", status: "undecided" },
    ]);
  });

  it("shows accepted text in place of the highlight, using edited and own text", () => {
    const view = resumeView(
      tailoring([
        item("a", { suggestion: rewrite("Ran weekly user interviews", "Ran 60 user interviews"), ...decided({ status: "accepted" }) }),
        item("b", { suggestion: rewrite("40 customers", "40 enterprise customers"), ...decided({ status: "edited", text: "40 big customers" }) }),
        item("c", { suggestion: rewrite("SQL", "Advanced SQL"), ...decided({ status: "own_text", text: "PostgreSQL" }) }),
      ]),
    );
    expect(inlines(view.blocks[4])).toEqual([
      { kind: "rewrite", itemId: "a", number: 1, text: "Ran 60 user interviews", status: "accepted" },
    ]);
    expect(inlines(view.blocks[3])[1]).toMatchObject({ itemId: "b", text: "40 big customers", status: "edited" });
    expect(inlines(view.blocks[6])[0]).toMatchObject({ itemId: "c", text: "PostgreSQL", status: "own_text" });
  });

  it("keeps the Resume's text for a rejected Rewrite", () => {
    const view = resumeView(
      tailoring([item("a", { suggestion: rewrite("Ran weekly user interviews", "Ran 60"), ...decided({ status: "rejected" }) })]),
    );
    expect(inlines(view.blocks[4])).toEqual([
      { kind: "rewrite", itemId: "a", number: 1, text: "Ran weekly user interviews", status: "rejected" },
    ]);
  });

  it("shows an accepted Rewrite across two lines once, on its first line", () => {
    const quote = "Shipped **billing** to 40 customers\n- Ran weekly user interviews";
    const view = resumeView(
      tailoring([item("a", { suggestion: rewrite(quote, "Shipped billing and ran interviews"), ...decided({ status: "accepted" }) })]),
    );
    expect(view.blocks.slice(3, 5)).toEqual([
      {
        kind: "bullet",
        inlines: [{ kind: "rewrite", itemId: "a", number: 1, text: "Shipped billing and ran interviews", status: "accepted" }],
      },
      { kind: "heading", level: 2, inlines: [{ kind: "text", text: "Skills" }] },
    ]);
  });

  it("puts a placeholder for an Add after the line holding its quote", () => {
    const view = resumeView(tailoring([item("a", { suggestion: addAfter("40 customers", "- Led a pricing change") })]));
    expect(view.blocks[4]).toEqual({ kind: "add", itemId: "a", number: 1, text: null, status: "undecided", bullet: true });
    expect(inlines(view.blocks[5])).toEqual([{ kind: "text", text: "Ran weekly user interviews" }]);
  });

  it("puts a placeholder for an Add in a section at that section's end, before the next section", () => {
    const view = resumeView(
      tailoring([
        item("a", { suggestion: addIn("Experience", "- Led a pricing change") }),
        item("b", { suggestion: addIn("Skills", "Python") }),
      ]),
    );
    expect(view.blocks[5]).toMatchObject({ kind: "add", itemId: "a", bullet: true });
    expect(view.blocks[6]).toMatchObject({ kind: "heading", inlines: [{ text: "Skills" }] });
    expect(view.blocks[8]).toMatchObject({ kind: "add", itemId: "b", bullet: false });
  });

  it("shows an accepted Add's text in its placeholder, without a list mark", () => {
    const view = resumeView(
      tailoring([item("a", { suggestion: addAfter("Ran weekly", "- Led a pricing change"), ...decided({ status: "accepted" }) })]),
    );
    expect(view.blocks[5]).toMatchObject({ kind: "add", text: "Led a pricing change", status: "accepted" });
  });

  it("marks gaps, which have no place in the Resume, apart from it", () => {
    const view = resumeView(
      tailoring([
        item("a", { gap: true, ...decided({ status: "skipped" }) }),
        item("b", { gap: true, suggestion: rewrite("SQL", "SQL and dbt") }),
        item("c", { gap: true }),
      ]),
    );
    expect(view.markers).toEqual([
      { itemId: "a", number: 1, label: "Requirement a", status: "skipped" },
      { itemId: "c", number: 3, label: "Requirement c", status: "undecided" },
    ]);
    expect(inlines(view.blocks[6])[0]).toMatchObject({ kind: "rewrite", itemId: "b" });
  });

  it("marks a Rewrite apart when an earlier one already highlights its text", () => {
    const view = resumeView(
      tailoring([
        item("a", { suggestion: rewrite("Ran weekly user interviews", "Ran 60 user interviews") }),
        item("b", { suggestion: rewrite("weekly user", "monthly user") }),
      ]),
    );
    expect(inlines(view.blocks[4])).toEqual([
      { kind: "rewrite", itemId: "a", number: 1, text: "Ran weekly user interviews", status: "undecided" },
    ]);
    expect(view.markers).toEqual([{ itemId: "b", number: 2, label: "Requirement b", status: "undecided" }]);
  });
});

describe("stepItem", () => {
  const items = [item("a"), item("b"), item("c")];

  it("goes to the next and previous item in the Tailoring's order", () => {
    expect(stepItem(items, "b", "next")).toBe("c");
    expect(stepItem(items, "b", "previous")).toBe("a");
  });

  it("starts at the first item when none is selected", () => {
    expect(stepItem(items, null, "next")).toBe("a");
    expect(stepItem(items, null, "previous")).toBe("a");
  });

  it("has nowhere to go past either end", () => {
    expect(stepItem(items, "c", "next")).toBeNull();
    expect(stepItem(items, "a", "previous")).toBeNull();
    expect(stepItem([], null, "next")).toBeNull();
  });
});

describe("acceptedCount", () => {
  it("counts accepted, edited and own text out of the items with a Suggestion", () => {
    const suggestion = rewrite("SQL", "PostgreSQL");
    expect(
      acceptedCount([
        item("a", { suggestion, ...decided({ status: "accepted" }) }),
        item("b", { suggestion, ...decided({ status: "edited", text: "x" }) }),
        item("c", { suggestion, ...decided({ status: "own_text", text: "y" }) }),
        item("d", { suggestion, ...decided({ status: "rejected" }) }),
        item("e", { gap: true, ...decided({ status: "skipped" }) }),
        item("f", { suggestion }),
        item("g", { gap: true, suggestion }),
      ]),
    ).toEqual({ accepted: 3, total: 6 });
  });
});

describe("withDecision", () => {
  it("records the decision on the one item, leaving the others", () => {
    const before = tailoring([item("a"), item("b", { suggestion: rewrite("SQL", "PostgreSQL") })]);
    const after = withDecision(before, "b", { status: "accepted" });
    expect(after.items.map((i) => i.decision)).toEqual([{ status: "undecided" }, { status: "accepted" }]);
    expect(before.items[1].decision).toEqual({ status: "undecided" });
  });
});

describe("allowedDecisions", () => {
  it("lets a Suggestion be accepted, edited or rejected", () => {
    expect(allowedDecisions(item("a", { suggestion: rewrite("SQL", "PostgreSQL") }))).toEqual(["accepted", "edited", "rejected"]);
  });

  it("lets a gap only be skipped, and a partial item with a rewording Suggestion both", () => {
    expect(allowedDecisions(item("a", { gap: true }))).toEqual(["skipped"]);
    expect(allowedDecisions(item("b", { gap: true, suggestion: rewrite("SQL", "PostgreSQL") }))).toEqual([
      "accepted",
      "edited",
      "rejected",
      "skipped",
    ]);
  });
});
