import { beforeEach, describe, expect, it, vi } from "vitest";

// Claude is the boundary: record what it's sent and answer with fixed text.
const create = vi.fn();
vi.mock("@/lib/anthropic/client", () => ({
  anthropic: { messages: { create } },
  CLAUDE_MODEL: "test",
  getResponseText: (response: { content: { text: string }[] }) => response.content[0].text,
}));

const { claudeSteps } = await import("./claude-steps");
import type { SuggestionRequest } from "./tailoring";

const answer = (text: string) => create.mockResolvedValueOnce({ content: [{ type: "text", text }] });

beforeEach(() => create.mockReset());

describe("structureResume", () => {
  it("sends the Resume's text and returns Claude's Markdown", async () => {
    answer("## Experience\n\n### Product Manager · Ledgerly\n2020 – 2024\n\n- Shipped billing");

    const markdown = await claudeSteps.structureResume("Product Manager, Ledgerly 2020-2024\nShipped billing");

    expect(markdown).toBe("## Experience\n\n### Product Manager · Ledgerly\n2020 – 2024\n\n- Shipped billing");
    expect(JSON.stringify(create.mock.calls[0][0].messages)).toContain("Shipped billing");
  });

  it("drops a code fence Claude wraps the Markdown in", async () => {
    answer("```markdown\n## Skills\n\n- SQL\n```");
    expect(await claudeSteps.structureResume("Skills: SQL")).toBe("## Skills\n\n- SQL");
  });
});

describe("writeSuggestions", () => {
  const MARKDOWN = "## Experience\n\n- Shipped billing\n\n## Skills\n\n- SQL";
  const requests: SuggestionRequest[] = [
    {
      itemId: "item-a",
      target: { kind: "requirement", text: "Payments experience", importance: "must_have", category: "experience", match: "missing" },
      basis: "career_story",
      sources: [{ label: "Built ACH payouts", quotes: ["Built ACH payouts for invoice payments"] }],
    },
    {
      itemId: "item-b",
      target: { kind: "requirement", text: "Data analysis", importance: "nice_to_have", category: "skill", match: "partial" },
      basis: "resume",
      sources: [],
    },
  ];
  const json = (suggestions: object[]) => JSON.stringify({ suggestions });
  const entry = (item: number, fields: object) => ({ item, kind: "rewrite", quote: "", section: "", text: "New", why: "Why", ...fields });

  it("sends the Markdown and the items, and gives each Suggestion its item's ID", async () => {
    answer(
      json([
        entry(1, { kind: "add", quote: "Shipped billing", text: "- Built ACH payouts" }),
        entry(2, { quote: "SQL", text: "SQL for weekly reporting" }),
      ]),
    );

    const written = await claudeSteps.writeSuggestions(MARKDOWN, requests);

    expect(written).toEqual([
      { itemId: "item-a", kind: "add", quote: "Shipped billing", section: "", text: "- Built ACH payouts", why: "Why" },
      { itemId: "item-b", kind: "rewrite", quote: "SQL", section: "", text: "SQL for weekly reporting", why: "Why" },
    ]);
    const sent = JSON.stringify(create.mock.calls[0][0].messages);
    expect(sent).toContain("Shipped billing");
    expect(sent).toContain("Payments experience");
    expect(sent).toContain("Built ACH payouts for invoice payments");
    expect(sent).toContain("Only reword");
  });

  it("sends an Example Work the user wrote for a gap as the item's only source", async () => {
    answer(json([entry(1, { kind: "add", section: "Experience", text: "- Moved services onto Kubernetes" })]));

    const written = await claudeSteps.writeSuggestions(MARKDOWN, [
      {
        itemId: "item-k",
        target: { kind: "requirement", text: "Kubernetes", importance: "must_have", category: "skill", match: "missing" },
        basis: "example_work",
        sources: [{ label: "Cluster migration", quotes: ["I moved our services onto Kubernetes. Deploys went from an hour to ten minutes."] }],
      },
    ]);

    expect(written).toMatchObject([{ itemId: "item-k", kind: "add", section: "Experience" }]);
    const sent = create.mock.calls[0][0].messages[0].content as string;
    expect(sent).toContain("Example Work");
    expect(sent).toContain("Cluster migration");
    expect(sent).toContain("I moved our services onto Kubernetes. Deploys went from an hour to ten minutes.");
    expect(sent).not.toContain("Only reword");
  });

  it("asks once more when a quote or section isn't in the Markdown, or an item is unknown or repeated", async () => {
    answer(json([entry(1, { quote: "Shipped invoicing" }), entry(1, { quote: "SQL" }), entry(3, { quote: "SQL" }), entry(2, { kind: "add", section: "Projects" })]));
    answer(json([entry(1, { quote: "Shipped billing" })]));

    const written = await claudeSteps.writeSuggestions(MARKDOWN, requests);

    expect(written).toMatchObject([{ itemId: "item-a", quote: "Shipped billing" }]);
    const retry = JSON.stringify(create.mock.calls[1][0].messages);
    expect(retry).toContain("Shipped invoicing");
    expect(retry).toContain("Projects");
    expect(retry).toContain("more than one Suggestion");
  });

  it("keeps a second answer that still has problems, without unknown or repeated items", async () => {
    answer(json([entry(1, { quote: "Shipped invoicing" })]));
    answer(json([entry(1, { quote: "Shipped invoicing" }), entry(1, { quote: "SQL" }), entry(7, { quote: "SQL" })]));

    expect(await claudeSteps.writeSuggestions(MARKDOWN, requests)).toMatchObject([{ itemId: "item-a", quote: "Shipped invoicing" }]);
  });

  it("fails when Claude's answer isn't in the expected format twice", async () => {
    answer("not json");
    answer(json([{ item: "one" }]));
    await expect(claudeSteps.writeSuggestions(MARKDOWN, requests)).rejects.toThrow();
  });
});
