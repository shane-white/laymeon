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

// --- ODT ---------------------------------------------------------------------

// The namespaces LibreOffice Writer declares on content.xml and styles.xml.
const ODF_NS =
  'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0" office:version="1.2"';

function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** A paragraph in LibreOffice Writer's default style. */
export function odtPara(text: string): string {
  return `<text:p text:style-name="Standard">${escapeXml(text)}</text:p>`;
}

/** A table, as LibreOffice writes one: one paragraph per cell. */
export function odtTable(rows: string[][]): string {
  const columns = Math.max(...rows.map((r) => r.length));
  const cell = (text: string) =>
    `<table:table-cell table:style-name="Table1.A1" office:value-type="string">${odtPara(text)}</table:table-cell>`;
  return `<table:table table:name="Table1" table:style-name="Table1"><table:table-column table:style-name="Table1.A" table:number-columns-repeated="${columns}"/>${rows
    .map((cells) => `<table:table-row>${cells.map(cell).join("")}</table:table-row>`)
    .join("")}</table:table>`;
}

/** A text box: a frame anchored to a paragraph, with paragraphs inside. */
export function odtTextBox(lines: string[]): string {
  return `<text:p text:style-name="Standard"><draw:frame draw:style-name="fr1" draw:name="Frame1" text:anchor-type="paragraph" svg:width="5cm" draw:z-index="0"><draw:text-box fo:min-height="2cm">${lines.map(odtPara).join("")}</draw:text-box></draw:frame></text:p>`;
}

/** An image anchored to a paragraph, sized the way LibreOffice writes it ("3cm", "1.5in"). */
export function odtImage(width: string, height: string): string {
  return `<text:p text:style-name="Standard"><draw:frame draw:style-name="fr2" draw:name="Image1" text:anchor-type="paragraph" svg:width="${width}" svg:height="${height}" draw:z-index="1"><draw:image xlink:href="Pictures/photo.png" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad" draw:mime-type="image/png"/></draw:frame></text:p>`;
}

interface OdtOptions {
  /** The XML inside <office:text>. */
  body: string;
  header?: string[];
  footer?: string[];
  /** The page count LibreOffice records in meta.xml. */
  pages?: number;
  /** Text columns, set in the page style. */
  columns?: number;
}

/** An .odt file laid out the way LibreOffice Writer saves one. */
export async function makeOdt(options: OdtOptions): Promise<Buffer> {
  const zip = new JSZip();
  // The mimetype comes first and uncompressed, so tools can recognise the file.
  zip.file("mimetype", "application/vnd.oasis.opendocument.text", { compression: "STORE" });
  zip.file(
    "META-INF/manifest.xml",
    `<?xml version="1.0" encoding="UTF-8"?><manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2"><manifest:file-entry manifest:full-path="/" manifest:version="1.2" manifest:media-type="application/vnd.oasis.opendocument.text"/><manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/><manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/><manifest:file-entry manifest:full-path="meta.xml" manifest:media-type="text/xml"/></manifest:manifest>`,
  );
  zip.file(
    "content.xml",
    `<?xml version="1.0" encoding="UTF-8"?><office:document-content ${ODF_NS}><office:scripts/><office:automatic-styles/><office:body><office:text><text:sequence-decls><text:sequence-decl text:display-outline-level="0" text:name="Illustration"/><text:sequence-decl text:display-outline-level="0" text:name="Table"/></text:sequence-decls>${options.body}</office:text></office:body></office:document-content>`,
  );
  const header = options.header?.length ? `<style:header>${options.header.map(odtPara).join("")}</style:header>` : "";
  const footer = options.footer?.length ? `<style:footer>${options.footer.map(odtPara).join("")}</style:footer>` : "";
  zip.file(
    "styles.xml",
    `<?xml version="1.0" encoding="UTF-8"?><office:document-styles ${ODF_NS}><office:styles><style:style style:name="Standard" style:family="paragraph" style:class="text"/></office:styles><office:automatic-styles><style:page-layout style:name="pm1"><style:page-layout-properties fo:page-width="21.001cm" fo:page-height="29.7cm">${options.columns ? `<style:columns fo:column-count="${options.columns}" fo:column-gap="0.5cm"/>` : ""}</style:page-layout-properties><style:header-style/><style:footer-style/></style:page-layout></office:automatic-styles><office:master-styles><style:master-page style:name="Standard" style:page-layout-name="pm1">${header}${footer}</style:master-page></office:master-styles></office:document-styles>`,
  );
  zip.file(
    "meta.xml",
    `<?xml version="1.0" encoding="UTF-8"?><office:document-meta ${ODF_NS} xmlns:ooo="http://openoffice.org/2004/office"><office:meta><meta:generator>LibreOffice/7.6</meta:generator>${options.pages ? `<meta:document-statistic meta:page-count="${options.pages}" meta:paragraph-count="1" meta:word-count="1" meta:character-count="1"/>` : ""}</office:meta></office:document-meta>`,
  );
  return zip.generateAsync({ type: "nodebuffer" });
}
