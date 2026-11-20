import { beforeEach, describe, expect, it, vi } from "vitest";
import { ODT_MIME } from "@/lib/documents/file-format";
import { makeOdt } from "@/lib/resume-review/__fixtures__/files";

// Claude is the boundary: record what it's sent and answer with fixed text.
const create = vi.fn();
const stream = vi.fn();
vi.mock("@/lib/anthropic/client", () => ({
  anthropic: { messages: { create, stream } },
  CLAUDE_MODEL: "test",
  getResponseText: (response: { content: { text: string }[] }) => response.content[0].text,
}));

const { parseDocument } = await import("./parse-document");
const { splitProjects } = await import("./split-projects");

const BODY =
  '<text:p text:style-name="Standard">Checkout redesign<text:line-break/>Acme<text:tab/>2023</text:p>';

/** The text of the first user message Claude was sent. */
function sentText(call: { messages: { content: unknown }[] }): string {
  const content = call.messages[0].content;
  return typeof content === "string" ? content : (content as { text: string }[]).map((c) => c.text).join("\n");
}

beforeEach(() => {
  create.mockReset();
  stream.mockReset();
});

describe("uploading an .odt", () => {
  it("sends its text, with line breaks and tabs, to Claude to convert to markdown", async () => {
    create.mockResolvedValue({ content: [{ type: "text", text: "## Checkout redesign" }] });
    const result = await parseDocument(await makeOdt({ body: BODY }), ODT_MIME, "resume.odt");
    expect(result).toEqual({ markdown: "## Checkout redesign" });
    expect(sentText(create.mock.calls[0][0])).toContain("Filename: resume.odt\n\nCheckout redesign\nAcme\t2023");
  });

  it("splits a project file by its text", async () => {
    const projects = { projects: [{ title: "Checkout redesign", description: "At Acme in 2023." }] };
    stream.mockReturnValue({
      finalMessage: async () => ({ stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(projects) }] }),
    });
    const result = await splitProjects(await makeOdt({ body: BODY }), ODT_MIME, "projects.odt");
    expect(result).toEqual(projects.projects);
    expect(sentText(stream.mock.calls[0][0])).toBe("Filename: projects.odt\n\nCheckout redesign\nAcme\t2023");
  });

  it("is unreadable when it has no text", async () => {
    await expect(parseDocument(await makeOdt({ body: "<text:p/>" }), ODT_MIME, "empty.odt")).rejects.toMatchObject({
      name: "UnreadableFileError",
    });
    expect(create).not.toHaveBeenCalled();
  });
});
