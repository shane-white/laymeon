/**
 * Reads a resume file the way resume-reading software (an ATS parser) does:
 * plain text extraction, no understanding of the layout.
 *
 * The resume's `parsed_markdown` comes from Claude reading the page, which
 * copes with columns and text in images. So it hides exactly the problems an
 * ATS runs into. Comparing the two shows them.
 */
import { distinctTexts } from "@/lib/documents/document-text";
import { DOCX_MIME, kindOf } from "@/lib/documents/file-format";
import { readOdtParts, textOfOdtXml } from "@/lib/documents/odt-text";
import { readRtfParts } from "@/lib/documents/rtf-text";
import { readWordParts, textOfWordXml } from "@/lib/documents/word-xml";
import type { SoftwareView } from "./types";

// DOCX sizes are in EMUs: 914400 per inch, 96 px per inch.
const EMU_PER_PIXEL = 9525;

// Images bigger than 60px either way: photos, logos and text saved as an image, not icons.
const MIN_IMAGE_PIXELS = 60;

type Image = SoftwareView["images"][number];

const notAnIcon = (img: Image) => img.width > MIN_IMAGE_PIXELS && img.height > MIN_IMAGE_PIXELS;

/** Null for file types this can't read (such as the old .doc format). */
export async function readAsSoftware(buffer: Buffer, mimeType: string): Promise<SoftwareView | null> {
  const kind = kindOf(mimeType);
  if (kind === "pdf") return readPdf(buffer);
  // Only .docx has the XML this reads; an old .doc is Word too, but not readable here.
  if (mimeType === DOCX_MIME) return readDocx(buffer);
  if (kind === "odt") return readOdt(buffer);
  if (kind === "rtf") return readRtf(buffer);
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
    const images = await parser.getImage({ imageBuffer: false, imageDataUrl: false, imageThreshold: MIN_IMAGE_PIXELS });
    const pages = text.pages.map((p) => p.text);
    return {
      format: "pdf",
      text: pages.join("\n"),
      pages,
      pageCount: text.total,
      images: images.pages.flatMap((p) =>
        p.images.map((img) => ({ page: p.pageNumber, width: img.width, height: img.height })),
      ),
      layout: null,
    };
  } finally {
    await parser.destroy();
  }
}

/** A recorded page count, or null when it's missing or zero. */
function pageCountFrom(match: RegExpExecArray | null): number | null {
  const count = match ? Number(match[1]) : 0;
  return count > 0 ? count : null;
}

/** The most text columns any of the numbers found says, and at least one. */
function mostColumns(counts: Iterable<RegExpMatchArray>): number {
  return Math.max(1, ...[...counts].map((m) => Number(m[1])));
}

async function readDocx(buffer: Buffer): Promise<SoftwareView> {
  const { documentXml, headers, footers, appXml } = await readWordParts(buffer);
  const headerFooterText = distinctTexts([...headers, ...footers].map(textOfWordXml)).join("\n");

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
    .filter(notAnIcon);

  return {
    format: "docx",
    // The body only: software that skips headers and footers reads just this.
    text: textOfWordXml(documentXml),
    pages: null,
    // Word records the page count when it saves; other editors may not.
    pageCount: pageCountFrom(/<Pages>(\d+)<\/Pages>/.exec(appXml)),
    images,
    layout: {
      tables: documentXml.match(/<w:tbl>/g)?.length ?? 0,
      textBoxes: documentXml.match(/<w:txbxContent\b/g)?.length ?? 0,
      columns: mostColumns(documentXml.matchAll(/<w:cols\b[^>]*\bw:num="(\d+)"/g)),
      headerFooterText,
    },
  };
}

// CSS pixels per unit of an ODF length, at 96 px per inch.
const PIXELS_PER_UNIT: Record<string, number> = { in: 96, cm: 96 / 2.54, mm: 96 / 25.4, pt: 96 / 72, pc: 16, px: 1 };

/** An ODF length such as "3.2cm" in pixels, or 0 if it isn't an absolute length. */
function odfPixels(length: string | undefined): number {
  const m = /^\s*([\d.]+)\s*([a-z]+)\s*$/.exec(length ?? "");
  return m && m[2] in PIXELS_PER_UNIT ? Math.round(Number(m[1]) * PIXELS_PER_UNIT[m[2]]) : 0;
}

async function readOdt(buffer: Buffer): Promise<SoftwareView> {
  const { contentXml, headers, footers, stylesXml, metaXml } = await readOdtParts(buffer);
  const headerFooterText = distinctTexts([...headers, ...footers].map(textOfOdtXml)).join("\n");

  // A frame holding a picture, up to the next frame tag: text boxes are frames too, and can hold image frames.
  const images = [...contentXml.matchAll(/<draw:frame\b([^>]*)>((?:(?!<\/?draw:frame\b)[\s\S])*)/g)]
    .filter((m) => /<draw:image\b/.test(m[2]))
    .map((m) => ({
      page: null,
      width: odfPixels(/\bsvg:width="([^"]*)"/.exec(m[1])?.[1]),
      height: odfPixels(/\bsvg:height="([^"]*)"/.exec(m[1])?.[1]),
    }))
    .filter(notAnIcon);

  return {
    format: "odt",
    text: textOfOdtXml(contentXml),
    pages: null,
    // LibreOffice and Google Docs record the page count when they save.
    pageCount: pageCountFrom(/\bmeta:page-count="(\d+)"/.exec(metaXml)),
    images,
    layout: {
      tables: contentXml.match(/<table:table[\s>]/g)?.length ?? 0,
      textBoxes: contentXml.match(/<draw:text-box\b/g)?.length ?? 0,
      // Page styles (styles.xml) and sections (content.xml) can both set columns.
      columns: mostColumns((contentXml + stylesXml).matchAll(/\bfo:column-count="(\d+)"/g)),
      headerFooterText,
    },
  };
}

function readRtf(buffer: Buffer): SoftwareView {
  const { body, headers, footers, tables, textBoxes, columns, pageCount, images } = readRtfParts(buffer);
  return {
    format: "rtf",
    text: body,
    pages: null,
    pageCount,
    images: images.map((img) => ({ page: null, ...img })).filter(notAnIcon),
    layout: {
      tables,
      textBoxes,
      columns,
      headerFooterText: distinctTexts([...headers, ...footers]).join("\n"),
    },
  };
}
