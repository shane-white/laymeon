import { beforeEach, describe, expect, it, vi } from "vitest";
import { ODT_MIME, RTF_MIME } from "@/lib/documents/file-format";
import { makeOdt } from "@/lib/documents/__fixtures__/odt-files";
import { makeRtf } from "@/lib/documents/__fixtures__/rtf-files";

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

/** The text of the first user message Claude was sent. */
function sentText(call: { messages: { content: unknown }[] }): string {
  const content = call.messages[0].content;
  return typeof content === "string" ? content : (content as { text: string }[]).map((c) => c.text).join("\n");
}

beforeEach(() => {
  create.mockReset();
  stream.mockReset();
});

// Each file holds "Checkout redesign", a line break, then "Acme", a tab and "2023".
const FORMATS = [
  {
    name: ".odt",
    mimeType: ODT_MIME,
    extension: "odt",
    make: () =>
      makeOdt({
        body: '<text:p text:style-name="Standard">Checkout redesign<text:line-break/>Acme<text:tab/>2023</text:p>',
      }),
    makeEmpty: () => makeOdt({ body: "<text:p/>" }),
  },
  {
    name: ".rtf",
    mimeType: RTF_MIME,
    extension: "rtf",
    make: async () => makeRtf({ app: "word", paragraphs: [String.raw`Checkout redesign\line Acme\tab 2023`] }),
    makeEmpty: async () => makeRtf({ app: "word", paragraphs: [] }),
  },
];

describe.each(FORMATS)("uploading an $name", ({ mimeType, extension, make, makeEmpty }) => {
  it("sends its text, with line breaks and tabs, to Claude to convert to markdown", async () => {
    create.mockResolvedValue({ content: [{ type: "text", text: "## Checkout redesign" }] });
    const result = await parseDocument(await make(), mimeType, `resume.${extension}`);
    expect(result).toEqual({ markdown: "## Checkout redesign" });
    expect(sentText(create.mock.calls[0][0])).toContain(`Filename: resume.${extension}\n\nCheckout redesign\nAcme\t2023`);
  });

  it("splits a project file by its text", async () => {
    const projects = { projects: [{ title: "Checkout redesign", description: "At Acme in 2023." }] };
    stream.mockReturnValue({
      finalMessage: async () => ({ stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(projects) }] }),
    });
    const result = await splitProjects(await make(), mimeType, `projects.${extension}`);
    expect(result).toEqual(projects.projects);
    expect(sentText(stream.mock.calls[0][0])).toBe(`Filename: projects.${extension}\n\nCheckout redesign\nAcme\t2023`);
  });

  it("is unreadable when it has no text", async () => {
    await expect(parseDocument(await makeEmpty(), mimeType, `empty.${extension}`)).rejects.toMatchObject({
      name: "UnreadableFileError",
    });
    await expect(splitProjects(await makeEmpty(), mimeType, `empty.${extension}`)).rejects.toMatchObject({
      name: "UnreadableFileError",
    });
    expect(create).not.toHaveBeenCalled();
    expect(stream).not.toHaveBeenCalled();
  });
});
