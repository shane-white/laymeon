import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { UnreadableFileError } from "./document";
import { makeRtf, rtfBullet, rtfFrame, rtfPicture, rtfTableRow, rtfTextBox } from "./__fixtures__/rtf-files";
import { readRtfText } from "./rtf-text";

const sample = (name: string) => readFileSync(new URL(`./__fixtures__/samples/${name}`, import.meta.url));
// An RTF Unicode escape (backslash, u, decimal code), built so it is never read as a JavaScript one.
const u = (n: number) => String.fromCharCode(92) + "u" + n;

describe("reading the text of an RTF file", () => {
  it("reads a WordPad file: accents, dashes, curly quotes, line breaks, tabs, bullets and a table", () => {
    expect(readRtfText(sample("wordpad.rtf"))).toBe(
      [
        "Zoë Müller-Ortiz — Résumé",
        "Zoë Müller-Ortiz",
        "12 Rue de l’Église, Montréal, QC",
        "zoe@example.com    (555) 010-2030",
        "Experience",
        "Senior Product Designer, Café Lumière\t2021 – 2024",
        "•\tLed the “Checkout 2.0” redesign; conversion rose 18 %.",
        "•\tRan 40+ user interviews in Español and Français.",
        "Designer, Naïve Labs\t\t2018 – 2021",
        "•\tBuilt a design system used by 3 teams.",
        "Skills",
        "Research\tInterviews, usability tests",
        "Prototyping\tFigma, Framer",
      ].join("\n"),
    );
  });

  it("reads a TextEdit file: paragraphs ending in a backslash, and \\uc0 curly quotes with no fallback", () => {
    const file = makeRtf({
      app: "textedit",
      paragraphs: [
        String.raw`\f1\b Jane O\uc0${u(8217)} Neil\f0\b0 `,
        "Portland, ME\t2020",
        "",
        String.raw`Led the \uc0${u(8220)} Atlas${u(8221)}  migration \uc0${u(8594)}  40% faster \'97 caf\'e9`,
      ],
    });
    expect(readRtfText(file)).toBe("Jane O’Neil\nPortland, ME\t2020\nLed the “Atlas” migration → 40% faster — café");
  });

  it("reads a Word file: header and footer around the body, bullets, a table, and \\u fallbacks skipped", () => {
    const file = makeRtf({
      app: "word",
      header: String.raw`jane@example.com \'b7 (512) 555-0147`,
      footer: String.raw`Page {\field{\*\fldinst {\rtlch PAGE }}{\fldrslt {\rtlch\lang1024 1}}}`,
      paragraphs: [
        "Jane Doe",
        String.raw`Experience\line Acme Corp\tab 2020\endash 2024`,
        rtfBullet(String.raw`Cut costs 20% ${u(8594)}\'3f saved $1M`),
        rtfTableRow(["Research", "Interviews"]),
        rtfTableRow(["Prototyping", "Figma"]),
      ],
    });
    expect(readRtfText(file)).toBe(
      [
        "jane@example.com · (512) 555-0147",
        "",
        "Jane Doe",
        "Experience",
        "Acme Corp\t2020–2024",
        "•\tCut costs 20% → saved $1M",
        "Research\tInterviews",
        "Prototyping\tFigma",
        "",
        "Page 1",
      ].join("\n"),
    );
  });

  it("decodes \\'hh with the declared code page, and with Windows-1252 when there is none", () => {
    const cyrillic = makeRtf({ app: "word", codepage: 1251, paragraphs: [String.raw`\'cf\'f0\'e8\'e2\'e5\'f2`] });
    expect(readRtfText(cyrillic)).toBe("Привет");
    const undeclared = makeRtf({ app: "textedit", codepage: null, paragraphs: [String.raw`Caf\'e9 \'93Lumi\'e8re\'94`] });
    expect(readRtfText(undeclared)).toBe("Café “Lumière”");
    const unknown = makeRtf({ app: "textedit", codepage: 99999, paragraphs: [String.raw`Caf\'e9`] });
    expect(readRtfText(unknown)).toBe("Café");
  });

  it("decodes multi-byte code pages", () => {
    const japanese = makeRtf({ app: "textedit", codepage: 932, paragraphs: [String.raw`\'93\'fa\'96\'7b`] });
    expect(readRtfText(japanese)).toBe("日本");
  });

  it("reads a text box's text once and a frame's text in place, and nothing from a picture", () => {
    const file = makeRtf({
      app: "word",
      paragraphs: ["Jane Doe", rtfTextBox(["Skills", "Python"]), rtfFrame("Framed note"), rtfPicture(1440, 1440), "Experience"],
    });
    expect(readRtfText(file)).toBe(["Jane Doe", "Skills", "Python", "Framed note", "Experience"].join("\n"));
  });

  it("fails as unreadable for a file that isn't RTF", () => {
    expect(() => readRtfText(Buffer.from("Just some text"))).toThrow(UnreadableFileError);
  });
});
