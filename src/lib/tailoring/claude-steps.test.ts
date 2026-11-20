import { beforeEach, describe, expect, it, vi } from "vitest";

// Claude is the boundary: record what it's sent and answer with fixed text.
const create = vi.fn();
vi.mock("@/lib/anthropic/client", () => ({
  anthropic: { messages: { create } },
  CLAUDE_MODEL: "test",
  getResponseText: (response: { content: { text: string }[] }) => response.content[0].text,
}));

const { claudeSteps } = await import("./claude-steps");

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
