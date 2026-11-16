/**
 * Reads a resume file the way resume-reading software (an ATS parser) does:
 * plain text extraction, no understanding of the layout.
 *
 * The resume's `parsed_markdown` comes from Claude reading the page, which
 * copes with columns and text in images. So it hides exactly the problems an
 * ATS runs into. Comparing the two shows them.
 */
import { readWordParts, textOfWordXml } from "@/lib/parsers/word-xml";
import type { SoftwareView } from "./types";

const PDF = "application/pdf";
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

// DOCX sizes are in EMUs: 914400 per inch, 96 px per inch.
const EMU_PER_PIXEL = 9525;

/** Null for file types this can't read (such as the old .doc format). */
export async function readAsSoftware(buffer: Buffer, mimeType: string): Promise<SoftwareView | null> {
  if (mimeType === PDF) return readPdf(buffer);
  if (mimeType === DOCX) return readDocx(buffer);
  return null;
}

async function readPdf(buffer: Buffer): Promise<SoftwareView> {
  // Loaded on demand: pdf.js is large, and only this path needs it. The
  // worker import sets up pdf.js for Node and serverless (pdf-parse's docs).
  await import("pdf-parse/worker");
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const text = await parser.getText({ pageJoiner: "" });
    // Images bigger than 60px either way: photos, logos and text saved as an image, not icons.
    const images = await parser.getImage({ imageBuffer: false, imageDataUrl: false, imageThreshold: 60 });
    const pages = text.pages.map((p) => p.text);
    return {
      format: "pdf",
      text: pages.join("\n"),
      pages,
      pageCount: text.total,
      images: images.pages.flatMap((p) =>
        p.images.map((img) => ({ page: p.pageNumber, width: img.width, height: img.height })),
      ),
      docx: null,
    };
  } finally {
    await parser.destroy();
  }
}

async function readDocx(buffer: Buffer): Promise<SoftwareView> {
  const { documentXml, headers, footers, appXml } = await readWordParts(buffer);
  const headerFooterText = [...headers, ...footers].map(textOfWordXml).filter(Boolean).join("\n");

  const columns = Math.max(
    1,
    ...[...documentXml.matchAll(/<w:cols\b[^>]*\bw:num="(\d+)"/g)].map((m) => Number(m[1])),
  );

  // Drawings with a picture in them. Text boxes and shapes are drawings too, without one.
  const images = [...documentXml.matchAll(/<w:drawing>([\s\S]*?)<\/w:drawing>/g)]
    .map((m) => m[1])
    .filter((drawing) => /<pic:pic\b|<a:blip\b/.test(drawing))
    .map((drawing) => /<wp:extent\b[^>]*\bcx="(\d+)"[^>]*\bcy="(\d+)"/.exec(drawing))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => ({
      page: null,
      width: Math.round(Number(m[1]) / EMU_PER_PIXEL),
      height: Math.round(Number(m[2]) / EMU_PER_PIXEL),
    }))
    .filter((img) => img.width > 60 && img.height > 60);

  // Word records the page count when it saves; other editors may not.
  const pagesMatch = /<Pages>(\d+)<\/Pages>/.exec(appXml);
  const pageCount = pagesMatch ? Number(pagesMatch[1]) : null;

  return {
    format: "docx",
    // The body only: software that skips headers and footers reads just this.
    text: textOfWordXml(documentXml),
    pages: null,
    pageCount: pageCount && pageCount > 0 ? pageCount : null,
    images,
    docx: {
      tables: documentXml.match(/<w:tbl>/g)?.length ?? 0,
      textBoxes: documentXml.match(/<w:txbxContent\b/g)?.length ?? 0,
      columns,
      headerFooterText,
    },
  };
}
