/**
 * Builds .odt test files laid out the way LibreOffice Writer saves them, with
 * paragraphs, tables, text boxes and images given as ODF XML snippets.
 */
import JSZip from "jszip";

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
