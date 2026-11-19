import { describe, expect, it } from "vitest";
import mammoth from "mammoth";
import { makeDocx, para } from "@/lib/resume-review/__fixtures__/files";
import { readWordText } from "./word-text";
import { readWordXmlText, textOfWordXml } from "./word-xml";

/** A paragraph with a soft line break (Shift+Enter) and a tab inside it. */
const SOFT_BREAKS =
  '<w:p><w:pPr><w:tabs><w:tab w:val="right" w:pos="9000"/></w:tabs></w:pPr><w:r><w:t>4 Newton St</w:t><w:br/><w:t>Portland, ME</w:t><w:tab/><w:t>2020</w:t></w:r></w:p>';

describe("textOfWordXml", () => {
  it("keeps line breaks and tabs, but not tab stop settings", () => {
    expect(textOfWordXml(SOFT_BREAKS)).toBe("4 Newton St\nPortland, ME\t2020");
  });

  it("joins runs, decodes entities and skips empty paragraphs", () => {
    expect(
      textOfWordXml('<w:p><w:r><w:t>R&amp;D</w:t></w:r><w:r><w:t xml:space="preserve"> lead &#x2013; 5</w:t></w:r></w:p><w:p></w:p>'),
    ).toBe("R&D lead – 5");
  });
});

describe("extracting text from an uploaded .docx", () => {
  it("keeps soft line breaks, which mammoth's raw text joins together", async () => {
    const file = await makeDocx({ body: SOFT_BREAKS });
    // The bug (LAY-73): mammoth runs the two lines together.
    expect((await mammoth.extractRawText({ buffer: file })).value).toContain("StPortland");
    expect(await readWordText(file)).toBe("4 Newton St\nPortland, ME\t2020");
  });

  it("includes the header, where contact details often are", async () => {
    const file = await makeDocx({ body: para("Experience"), header: ["jane@example.com · (512) 555-0147"] });
    expect(await readWordXmlText(file)).toBe("jane@example.com · (512) 555-0147\n\nExperience");
  });

  it("falls back to mammoth for a file that isn't a .docx zip", async () => {
    await expect(readWordText(Buffer.from("not a zip"))).rejects.toThrow();
  });
});
