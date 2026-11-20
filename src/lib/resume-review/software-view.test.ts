import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { makeRtf, rtfFrame, rtfPicture, rtfTableRow, rtfTextBox } from "@/lib/documents/__fixtures__/rtf-files";
import {
  makeOdt,
  odtColumnsStyle,
  odtImage,
  odtPara,
  odtSection,
  odtTable,
  odtTextBox,
} from "@/lib/documents/__fixtures__/odt-files";
import { ODT_MIME, RTF_MIME } from "@/lib/documents/file-format";
import { makeDocx, makePdf, para, table, textBox } from "./__fixtures__/files";
import { DOCX, PDF } from "./__fixtures__/helpers";
import { readAsSoftware } from "./software-view";

const sample = (name: string) =>
  readFileSync(new URL(`../documents/__fixtures__/samples/${name}`, import.meta.url));

describe("readAsSoftware: PDF", () => {
  it("reads the text, pages and images", async () => {
    const view = await readAsSoftware(
      makePdf({ pages: [["Jane Doe", "Experience"], ["Education"]], image: { width: 200, height: 200 } }),
      PDF,
    );
    expect(view?.format).toBe("pdf");
    expect(view?.pageCount).toBe(2);
    expect(view?.pages?.map((p) => p.trim())).toEqual(["Jane Doe\nExperience", "Education"]);
    expect(view?.images).toEqual([{ page: 1, width: 200, height: 200 }]);
  });

  it("merges side-by-side columns into one line, like an ATS", async () => {
    const view = await readAsSoftware(makePdf({ pages: [["Summary"]], rightColumn: ["Skills"] }), PDF);
    expect(view?.text.replace(/\s+/g, " ").trim()).toBe("Summary Skills");
  });

  it("finds no text in a scanned PDF", async () => {
    const view = await readAsSoftware(makePdf({ pages: [["Jane Doe"]], scanned: true }), PDF);
    expect(view?.text.trim()).toBe("");
    expect(view?.images).toHaveLength(1);
  });
});

describe("readAsSoftware: DOCX", () => {
  it("finds tables, text boxes, columns and header text", async () => {
    const view = await readAsSoftware(
      await makeDocx({
        body: [para("Jane Doe"), textBox(["Sidebar"]), table([["Skills", "Python"]])].join(""),
        header: ["jane@example.com"],
        columns: 2,
        pages: 2,
      }),
      DOCX,
    );
    expect(view?.format).toBe("docx");
    expect(view?.pageCount).toBe(2);
    // The text box's fallback copy isn't counted twice, and isn't an image.
    expect(view?.layout).toEqual({ tables: 1, textBoxes: 1, columns: 2, headerFooterText: "jane@example.com" });
    expect(view?.images).toEqual([]);
    expect(view?.text).toContain("Jane Doe");
  });

  it("has no page count when the file doesn't record one", async () => {
    const view = await readAsSoftware(await makeDocx({ body: para("Jane Doe") }), DOCX);
    expect(view?.pageCount).toBeNull();
    expect(view?.layout).toEqual({ tables: 0, textBoxes: 0, columns: 1, headerFooterText: "" });
  });
});

it("returns null for file types it can't read", async () => {
  expect(await readAsSoftware(Buffer.from("x"), "application/msword")).toBeNull();
});

describe("readAsSoftware: ODT", () => {
  it("finds tables, text boxes, columns, header and footer text, and the page count", async () => {
    const view = await readAsSoftware(
      await makeOdt({
        body: [odtPara("Jane Doe"), odtTextBox(["Sidebar"]), odtTable([["Skills", "Python"]])].join(""),
        header: ["jane@example.com"],
        footer: ["Page 1"],
        columns: 2,
        pages: 2,
      }),
      ODT_MIME,
    );
    expect(view?.format).toBe("odt");
    expect(view?.pageCount).toBe(2);
    expect(view?.pages).toBeNull();
    expect(view?.layout).toEqual({
      tables: 1,
      textBoxes: 1,
      columns: 2,
      headerFooterText: "jane@example.com\nPage 1",
    });
    expect(view?.images).toEqual([]);
    // The body only: software that skips headers and footers reads just this.
    expect(view?.text).toBe("Jane Doe\nSidebar\nSkills\nPython");
  });

  it("finds columns in a section of the body", async () => {
    const view = await readAsSoftware(
      await makeOdt({
        body: odtPara("Jane Doe") + odtSection("Sect1", ["Python", "Figma"]),
        styles: [odtColumnsStyle("Sect1", "section", 2), odtColumnsStyle("Sect2", "section", 3)],
      }),
      ODT_MIME,
    );
    // Sect2 isn't used.
    expect(view?.layout?.columns).toBe(2);
  });

  it("doesn't count columns inside a text box as the page's columns", async () => {
    const view = await readAsSoftware(
      await makeOdt({ body: odtPara("Jane Doe") + odtTextBox(["Python", "Figma"]), styles: [odtColumnsStyle("fr1", "graphic", 2)] }),
      ODT_MIME,
    );
    expect(view?.layout).toMatchObject({ textBoxes: 1, columns: 1 });
  });

  it("finds images bigger than an icon, in pixels", async () => {
    const view = await readAsSoftware(
      await makeOdt({ body: [odtPara("Jane Doe"), odtImage("1.5in", "2in"), odtImage("0.4cm", "0.4cm")].join("") }),
      ODT_MIME,
    );
    expect(view?.images).toEqual([{ page: null, width: 144, height: 192 }]);
  });

  it("has no page count or layout elements in a plain file without statistics", async () => {
    const view = await readAsSoftware(await makeOdt({ body: odtPara("Jane Doe") }), ODT_MIME);
    expect(view?.pageCount).toBeNull();
    expect(view?.layout).toEqual({ tables: 0, textBoxes: 0, columns: 1, headerFooterText: "" });
  });

  it("reads a Google Docs file: its skills table, page number footer and page count", async () => {
    const view = await readAsSoftware(sample("google-docs.odt"), ODT_MIME);
    expect(view?.format).toBe("odt");
    expect(view?.pageCount).toBe(1);
    expect(view?.layout).toEqual({ tables: 1, textBoxes: 0, columns: 1, headerFooterText: "Page 1" });
    expect(view?.text).toContain("Experience");
  });
});

describe("readAsSoftware: RTF", () => {
  it("finds tables, text boxes and frames, columns, header and footer text, and the page count", async () => {
    const view = await readAsSoftware(
      makeRtf({
        app: "word",
        header: "jane@example.com",
        footer: "Page 1",
        columns: 2,
        pages: 2,
        paragraphs: [
          "Jane Doe",
          rtfTextBox(["Sidebar"]),
          rtfTableRow(["Skills", "Python"]),
          rtfTableRow(["Tools", "dbt"]),
          "Experience",
          rtfTableRow(["Acme", "2020"]),
          rtfFrame("Pull quote"),
          rtfFrame("More of the quote"),
          "Education",
        ],
      }),
      RTF_MIME,
    );
    expect(view?.format).toBe("rtf");
    expect(view?.pageCount).toBe(2);
    expect(view?.pages).toBeNull();
    // Two tables (two rows, then one), a text box and a frame of two paragraphs.
    expect(view?.layout).toEqual({
      tables: 2,
      textBoxes: 2,
      columns: 2,
      headerFooterText: "jane@example.com\nPage 1",
    });
    expect(view?.images).toEqual([]);
    expect(view?.text.split("\n")[0]).toBe("Jane Doe");
    expect(view?.text).not.toContain("jane@example.com");
  });

  it("finds pictures bigger than an icon, counting Word's copy for older readers once", async () => {
    const view = await readAsSoftware(
      makeRtf({ app: "word", paragraphs: ["Jane Doe", rtfPicture(2880, 4320, 50), rtfPicture(300, 300)] }),
      RTF_MIME,
    );
    expect(view?.images).toEqual([{ page: null, width: 96, height: 144 }]);
  });

  it("has no page count or layout elements in a plain TextEdit file", async () => {
    const view = await readAsSoftware(makeRtf({ app: "textedit", paragraphs: ["Jane Doe", "Experience"] }), RTF_MIME);
    expect(view?.pageCount).toBeNull();
    expect(view?.layout).toEqual({ tables: 0, textBoxes: 0, columns: 1, headerFooterText: "" });
    expect(view?.text).toBe("Jane Doe\nExperience");
  });

  it("reads a WordPad file and its skills table", async () => {
    const view = await readAsSoftware(sample("wordpad.rtf"), RTF_MIME);
    expect(view?.format).toBe("rtf");
    expect(view?.layout?.tables).toBe(1);
    expect(view?.text).toContain("Experience");
  });
});
