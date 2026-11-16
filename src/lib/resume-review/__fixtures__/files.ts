/**
 * Builds example resume files for the tests: PDFs with jsPDF, DOCX files by
 * hand with JSZip, and a small PNG. Only the tests import this.
 */
import { deflateSync } from "node:zlib";
import { jsPDF } from "jspdf";
import JSZip from "jszip";

const LINE_HEIGHT = 7;
const TOP = 15;

interface PdfOptions {
  /** One array of lines per page. */
  pages: string[][];
  /** Lines printed in a second column, beside the first page's lines. */
  rightColumn?: string[];
  /** Lines printed in white, so people can't see them. */
  hidden?: string[];
  /** An image on the first page, in pixels. */
  image?: { width: number; height: number };
  /** Print the lines as an image only, like a scan (no text layer). */
  scanned?: boolean;
}

export function makePdf(options: PdfOptions): Buffer {
  const doc = new jsPDF();
  doc.setFontSize(10);
  options.pages.forEach((lines, pageIndex) => {
    if (pageIndex > 0) doc.addPage();
    if (options.scanned) {
      doc.addImage(makePng(600, 800), "PNG", 0, 0, 210, 297);
      return;
    }
    lines.forEach((line, i) => {
      doc.text(line, 10, TOP + i * LINE_HEIGHT);
      const right = pageIndex === 0 ? options.rightColumn?.[i] : undefined;
      if (right) doc.text(right, 120, TOP + i * LINE_HEIGHT);
    });
    if (pageIndex === 0 && options.image) {
      doc.addImage(makePng(options.image.width, options.image.height), "PNG", 160, 10, 30, 30);
    }
    if (pageIndex === 0 && options.hidden) {
      doc.setTextColor(255, 255, 255);
      options.hidden.forEach((line, i) => doc.text(line, 10, 280 - i * 4));
      doc.setTextColor(0, 0, 0);
    }
  });
  return Buffer.from(doc.output("arraybuffer"));
}

// --- PNG ---------------------------------------------------------------------

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(data: Buffer): number {
  let c = 0xffffffff;
  for (const byte of data) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** A grey RGB PNG. */
export function makePng(width: number, height: number): Uint8Array {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // RGB
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, 0x88)]);
  const pixels = deflateSync(Buffer.concat(Array.from({ length: height }, () => row)));
  return new Uint8Array(
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk("IHDR", header),
      chunk("IDAT", pixels),
      chunk("IEND", Buffer.alloc(0)),
    ]),
  );
}

// --- DOCX --------------------------------------------------------------------

const W_NS =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

export function para(text: string): string {
  const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<w:p><w:r><w:t xml:space="preserve">${escaped}</w:t></w:r></w:p>`;
}

export function table(rows: string[][]): string {
  return `<w:tbl>${rows
    .map((cells) => `<w:tr>${cells.map((c) => `<w:tc>${para(c)}</w:tc>`).join("")}</w:tr>`)
    .join("")}</w:tbl>`;
}

/** A text box, saved the way Word does: the modern shape plus a fallback copy. */
export function textBox(lines: string[]): string {
  const content = `<w:txbxContent>${lines.map(para).join("")}</w:txbxContent>`;
  return `<w:p><w:r><mc:AlternateContent><mc:Choice Requires="wps"><w:drawing><wp:anchor><wp:extent cx="1828800" cy="914400"/><wps:wsp><wps:txbx>${content}</wps:txbx></wps:wsp></wp:anchor></w:drawing></mc:Choice><mc:Fallback><w:pict>${content}</w:pict></mc:Fallback></mc:AlternateContent></w:r></w:p>`;
}

interface DocxOptions {
  body: string;
  header?: string[];
  columns?: number;
  pages?: number;
}

export async function makeDocx(options: DocxOptions): Promise<Buffer> {
  const zip = new JSZip();
  const hasHeader = Boolean(options.header?.length);
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>${hasHeader ? '<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>' : ""}</Types>`,
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
  );
  if (hasHeader) {
    zip.file(
      "word/_rels/document.xml.rels",
      `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdH1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/></Relationships>`,
    );
    zip.file("word/header1.xml", `<?xml version="1.0" encoding="UTF-8"?><w:hdr ${W_NS}>${options.header!.map(para).join("")}</w:hdr>`);
  }
  const sectPr = `<w:sectPr>${hasHeader ? '<w:headerReference w:type="default" r:id="rIdH1"/>' : ""}${options.columns ? `<w:cols w:num="${options.columns}"/>` : ""}</w:sectPr>`;
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8"?><w:document ${W_NS}><w:body>${options.body}${sectPr}</w:body></w:document>`,
  );
  if (options.pages) {
    zip.file("docProps/app.xml", `<?xml version="1.0" encoding="UTF-8"?><Properties><Pages>${options.pages}</Pages></Properties>`);
  }
  return zip.generateAsync({ type: "nodebuffer" });
}
