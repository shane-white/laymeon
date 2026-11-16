import { describe, expect, it } from "vitest";
import { makeDocx, makePdf, para, table, textBox } from "./__fixtures__/files";
import { DOCX, PDF } from "./__fixtures__/helpers";
import { readAsSoftware } from "./software-view";

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
    expect(view?.docx).toEqual({ tables: 1, textBoxes: 1, columns: 2, headerFooterText: "jane@example.com" });
    expect(view?.images).toEqual([]);
    expect(view?.text).toContain("Jane Doe");
  });

  it("has no page count when the file doesn't record one", async () => {
    const view = await readAsSoftware(await makeDocx({ body: para("Jane Doe") }), DOCX);
    expect(view?.pageCount).toBeNull();
    expect(view?.docx).toEqual({ tables: 0, textBoxes: 0, columns: 1, headerFooterText: "" });
  });
});

it("returns null for file types it can't read", async () => {
  expect(await readAsSoftware(Buffer.from("x"), "application/msword")).toBeNull();
});
