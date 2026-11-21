import { describe, expect, it } from "vitest";
import { copyPrompt, downloadName, tailoredMarkdown } from "./outputs";
import type { Decision, Suggestion, Tailoring, TailoringItem } from "./tailoring";

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

let nextId = 1;
function item(suggestion: Suggestion | null, decision: Decision = { status: "accepted" }): TailoringItem {
  return {
    id: `item-${nextId++}`,
    target: { kind: "requirement", text: "A Requirement", importance: "must_have", category: "skill", match: "missing" },
    careerStory: [],
    suggestion,
    gap: suggestion === null,
    decision,
  };
}

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

describe("tailoredMarkdown", () => {
  it("replaces an accepted Rewrite's quote with its text", () => {
    const result = tailoredMarkdown(tailoring([item(rewrite("Ran weekly user interviews", "Ran 60 user interviews a quarter"))]));
    expect(result).toBe(MARKDOWN.replace("Ran weekly user interviews", "Ran 60 user interviews a quarter"));
  });

  it("uses the user's text for an edited or own-text decision", () => {
    const result = tailoredMarkdown(
      tailoring([
        item(rewrite("Ran weekly user interviews", "Ran interviews"), { status: "edited", text: "Ran 60 interviews" }),
        item(rewrite("SQL, Figma", "SQL, Figma, Python"), { status: "own_text", text: "SQL, Python, dbt" }),
      ]),
    );
    expect(result).toContain("- Ran 60 interviews\n");
    expect(result.endsWith("\nSQL, Python, dbt")).toBe(true);
  });

  it("leaves out rejected, undecided and skipped items", () => {
    const items = [
      item(rewrite("Ran weekly user interviews", "Rejected"), { status: "rejected" }),
      item(rewrite("SQL, Figma", "Undecided"), { status: "undecided" }),
      item(addIn("Skills", "Undecided add"), { status: "undecided" }),
      item(null, { status: "skipped" }),
    ];
    expect(tailoredMarkdown(tailoring(items))).toBe(MARKDOWN);
  });

  it("replaces a quote that spans Markdown emphasis", () => {
    const result = tailoredMarkdown(tailoring([item(rewrite("Shipped billing to 40 customers", "Shipped billing to 400 customers"))]));
    expect(result).toContain("\n- Shipped billing to 400 customers\n");
  });

  it("puts an Add after the line holding its quote, as a bullet when that line is one", () => {
    const result = tailoredMarkdown(tailoring([item(addAfter("billing to 40", "Led the pricing launch"))]));
    expect(result).toContain("- Shipped **billing** to 40 customers\n- Led the pricing launch\n- Ran weekly user interviews");
  });

  it("keeps an Add's own list mark rather than adding another", () => {
    const result = tailoredMarkdown(tailoring([item(addAfter("Ran weekly user interviews", "- Led the pricing launch"))]));
    expect(result).toContain("- Ran weekly user interviews\n- Led the pricing launch\n");
  });

  it("puts an Add in a section at the end of that section, before the next heading", () => {
    const result = tailoredMarkdown(tailoring([item(addIn("Experience", "Led the pricing launch"))]));
    expect(result).toContain("- Ran weekly user interviews\n- Led the pricing launch\n\n## Skills");
  });

  it("puts an Add after a paragraph as a paragraph of its own", () => {
    const result = tailoredMarkdown(tailoring([item(addIn("Skills", "Certified Scrum Product Owner"))]));
    expect(result.endsWith("\nSQL, Figma\n\nCertified Scrum Product Owner")).toBe(true);
  });

  it("keeps a blank line between an Add after a heading and the text below it", () => {
    const markdown = "## Summary\nProduct manager.";
    const result = tailoredMarkdown(tailoring([item(addAfter("Summary", "Eight years in fintech."))], markdown));
    expect(result).toBe("## Summary\n\nEight years in fintech.\n\nProduct manager.");
  });

  it("puts several Adds at one place in the Tailoring's order", () => {
    const result = tailoredMarkdown(
      tailoring([item(addIn("Experience", "First")), item(addAfter("Ran weekly user interviews", "Second"))]),
    );
    expect(result).toContain("- Ran weekly user interviews\n- First\n- Second\n\n## Skills");
  });

  it("makes a Rewrite and an Add on the same line", () => {
    const result = tailoredMarkdown(
      tailoring([
        item(rewrite("Ran weekly user interviews", "Ran 60 interviews")),
        item(addAfter("Ran weekly user interviews", "Led the pricing launch")),
      ]),
    );
    expect(result).toContain("- Ran 60 interviews\n- Led the pricing launch\n\n## Skills");
  });

  it("continues a numbered list", () => {
    const markdown = "## Highlights\n1. Shipped billing\n2. Ran interviews";
    const result = tailoredMarkdown(tailoring([item(addIn("Highlights", "Led pricing"))], markdown));
    expect(result).toBe("## Highlights\n1. Shipped billing\n2. Ran interviews\n3. Led pricing");
  });
});

/** The prompt's numbered list of edits. */
const editLines = (prompt: string) => prompt.split("\n").filter((line) => /^\d+\. /.test(line));

describe("copyPrompt", () => {
  it("tells the other AI to make only the listed edits to the attached file, keep its layout and return the same format", () => {
    const prompt = copyPrompt(tailoring([item(rewrite("SQL, Figma", "SQL, Figma, Python"))]));
    expect(prompt).toMatch(/attached/i);
    expect(prompt).toMatch(/only the edits listed/i);
    expect(prompt).toMatch(/layout, fonts/i);
    expect(prompt).toMatch(/same format/i);
  });

  it("lists each accepted edit as a numbered instruction, in the Tailoring's order", () => {
    const prompt = copyPrompt(
      tailoring([
        item(rewrite("Ran weekly user interviews", "Ran 60 user interviews a quarter")),
        item(addAfter("Ran weekly user interviews", "Led the pricing launch")),
        item(addIn("Skills", "Python")),
      ]),
    );
    expect(editLines(prompt)).toEqual([
      '1. Replace "Ran weekly user interviews" with "Ran 60 user interviews a quarter".',
      '2. Add "Led the pricing launch" after "Ran weekly user interviews".',
      '3. Add "Python" in the "Skills" section.',
    ]);
  });

  it("uses the user's text for edited and own-text decisions", () => {
    const prompt = copyPrompt(
      tailoring([
        item(rewrite("SQL, Figma", "SQL, Figma, Python"), { status: "edited", text: "SQL, Python" }),
        item(addIn("Skills", "Python"), { status: "own_text", text: "dbt" }),
      ]),
    );
    expect(editLines(prompt)).toEqual(['1. Replace "SQL, Figma" with "SQL, Python".', '2. Add "dbt" in the "Skills" section.']);
  });

  it("leaves out rejected, undecided and skipped items", () => {
    const prompt = copyPrompt(
      tailoring([
        item(rewrite("Ran weekly user interviews", "Rejected"), { status: "rejected" }),
        item(rewrite("SQL, Figma", "Accepted")),
        item(addIn("Skills", "Undecided"), { status: "undecided" }),
        item(null, { status: "skipped" }),
      ]),
    );
    expect(editLines(prompt)).toEqual(['1. Replace "SQL, Figma" with "Accepted".']);
  });

  it("leaves out the reasons, Evidence and the Job", () => {
    const suggestion: Suggestion = {
      ...rewrite("SQL, Figma", "SQL, Figma, Python"),
      why: "The Job asks for Python",
      evidence: [{ source: "resume", quote: "Evidence quote" }],
    };
    const prompt = copyPrompt(tailoring([{ ...item(suggestion), target: { kind: "screener", text: "Knows Python" } }]));
    expect(prompt).not.toContain("The Job asks for Python");
    expect(prompt).not.toContain("Evidence quote");
    expect(prompt).not.toContain("Knows Python");
  });

  it("quotes the Resume's text without Markdown marks or list marks", () => {
    const prompt = copyPrompt(
      tailoring([
        item(rewrite("Shipped **billing** to 40 customers", "Shipped **billing** to 400 customers")),
        item(addAfter("Shipped **billing** to 40 customers", "- Led the pricing launch")),
      ]),
    );
    expect(editLines(prompt)).toEqual([
      '1. Replace "Shipped billing to 40 customers" with "Shipped billing to 400 customers".',
      '2. Add "Led the pricing launch" after "Shipped billing to 40 customers".',
    ]);
  });

  it("says when there are no edits yet", () => {
    const prompt = copyPrompt(tailoring([item(rewrite("SQL, Figma", "Undecided"), { status: "undecided" })]));
    expect(editLines(prompt)).toEqual([]);
    expect(prompt).toMatch(/no edits/i);
  });
});

describe("downloadName", () => {
  it("names the file after the Resume and the company", () => {
    expect(downloadName("PM Resume", "Acme")).toBe("PM Resume – Acme.md");
  });

  it("drops the Resume's file extension and characters files can't have", () => {
    expect(downloadName("PM Resume v2.pdf", 'Acme / "Labs"')).toBe("PM Resume v2 – Acme Labs.md");
    expect(downloadName("PM: Resume", "Acme\\Labs")).toBe("PM Resume – Acme Labs.md");
  });

  it("falls back when the Resume name or company is unknown", () => {
    expect(downloadName(null, null)).toBe("Resume.md");
    expect(downloadName("PM Resume", null)).toBe("PM Resume.md");
    expect(downloadName(null, "Acme")).toBe("Resume – Acme.md");
  });
});
