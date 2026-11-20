import { readFile } from "node:fs/promises";
import { join } from "node:path";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { makeOdt, odtPara } from "./__fixtures__/odt-files";
import { readOdtText } from "./odt-text";

/** A paragraph with a line break (Shift+Enter), a tab and repeated spaces, as LibreOffice saves them. */
const BREAKS =
  '<text:p text:style-name="Standard">4 Newton St<text:line-break/>Portland, ME<text:tab/>2020 <text:s text:c="3"/>(555) 010-2030</text:p>';

describe("reading the text of an uploaded .odt", () => {
  it("keeps line breaks, tabs and repeated spaces", async () => {
    const file = await makeOdt({ body: BREAKS });
    expect(await readOdtText(file)).toBe("4 Newton St\nPortland, ME\t2020    (555) 010-2030");
  });

  it("puts headings, list items and table cells on lines of their own", async () => {
    const file = await makeOdt({
      body:
        '<text:h text:style-name="Heading_20_1" text:outline-level="1">Experience</text:h>' +
        '<text:list text:style-name="L1"><text:list-item><text:p text:style-name="P1">Led the <text:span text:style-name="T1">redesign</text:span></text:p></text:list-item><text:list-item><text:p text:style-name="P1">R&amp;D lead</text:p></text:list-item></text:list>' +
        '<text:p text:style-name="Standard"/>' +
        '<table:table table:name="Table1"><table:table-column/><table:table-row><table:table-cell office:value-type="string"><text:p>Research</text:p></table:table-cell><table:table-cell office:value-type="string"><text:p>Figma</text:p></table:table-cell></table:table-row></table:table>',
    });
    expect(await readOdtText(file)).toBe("Experience\nLed the redesign\nR&D lead\nResearch\nFigma");
  });

  it("collapses whitespace in the XML the way ODF readers show it", async () => {
    const file = await makeOdt({ body: "<text:p>\n  Product\n   Designer  </text:p>" });
    expect(await readOdtText(file)).toBe("Product Designer ");
  });

  it("includes the header and footer, where contact details often are", async () => {
    const file = await makeOdt({
      body: odtPara("Experience"),
      header: ["jane@example.com · (512) 555-0147"],
      footer: ["Portland, ME"],
    });
    expect(await readOdtText(file)).toBe("jane@example.com · (512) 555-0147\n\nExperience\n\nPortland, ME");
  });

  it("leaves out deleted tracked changes and comments", async () => {
    const file = await makeOdt({
      body:
        '<text:tracked-changes><text:changed-region text:id="ct1"><text:deletion><office:change-info><dc:creator>Jane</dc:creator></office:change-info><text:p>Old title</text:p></text:deletion></text:changed-region></text:tracked-changes>' +
        '<text:p><text:change text:change-id="ct1"/>Designer<office:annotation><dc:creator>Jane</dc:creator><text:p>Say senior?</text:p></office:annotation></text:p>',
    });
    expect(await readOdtText(file)).toBe("Designer");
  });

  it("reads a file saved by Google Docs", async () => {
    const file = await readFile(join(__dirname, "__fixtures__/samples/google-docs.odt"));
    expect(await readOdtText(file)).toBe(
      [
        "Zoë Müller-Ortiz — Résumé",
        "Zoë Müller-Ortiz",
        "12 Rue de l’Église, Montréal, QC",
        "zoe@example.com    (555) 010-2030",
        "Experience",
        "Senior Product Designer, Café Lumière\t2021 – 2024",
        "Led the “Checkout 2.0” redesign; conversion rose 18 %.",
        "Ran 40+ user interviews in Español and Français.",
        "Designer, Naïve Labs\t\t2018 – 2021",
        "Built a design system used by 3 teams.",
        "Skills",
        "Research",
        "Interviews, usability tests",
        "Prototyping",
        "Figma, Framer",
        "",
        "Page 1",
      ].join("\n"),
    );
  });

  it("fails for a file that isn't an .odt zip", async () => {
    await expect(readOdtText(Buffer.from("not a zip"))).rejects.toThrow();
  });

  it("fails for a password-protected file, whose XML is encrypted", async () => {
    const zip = await JSZip.loadAsync(await makeOdt({ body: odtPara("Secret") }));
    zip.file(
      "META-INF/manifest.xml",
      '<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0"><manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"><manifest:encryption-data manifest:checksum-type="SHA1/1K" manifest:checksum="x"/></manifest:file-entry></manifest:manifest>',
    );
    zip.file("content.xml", "\u0007ÿ garbled bytes");
    await expect(readOdtText(await zip.generateAsync({ type: "nodebuffer" }))).rejects.toThrow(/password/);
  });
});
