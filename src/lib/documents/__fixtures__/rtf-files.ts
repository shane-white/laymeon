/**
 * Builds RTF test files that copy what TextEdit and Word write. Paragraphs
 * and cells are RTF snippets, so tests can use escapes like `\'e9` and `\uN`.
 */

export interface RtfOptions {
  app: "textedit" | "word";
  /** One RTF snippet per paragraph. */
  paragraphs: string[];
  /** Word only: page header and footer text. */
  header?: string;
  footer?: string;
  /** The declared `\ansicpgN`. Defaults to 1252; null leaves it out. */
  codepage?: number | null;
  /** Word only: the page count in the document info (`\nofpagesN`). Defaults to 1; null leaves it out. */
  pages?: number | null;
  /** Word only: text columns in the section (`\colsN`). */
  columns?: number;
}

export function makeRtf(options: RtfOptions): Buffer {
  const rtf = options.app === "textedit" ? textEdit(options) : word(options);
  return Buffer.from(rtf, "latin1");
}

function ansicpg(codepage: number | null | undefined): string {
  return codepage === null ? "" : `\\ansicpg${codepage ?? 1252}`;
}

// TextEdit ends each paragraph with a backslash and a newline, and writes
// characters outside the code page as \uc0\uN with no fallback.
function textEdit({ paragraphs, codepage }: RtfOptions): string {
  return [
    `{\\rtf1\\ansi${ansicpg(codepage)}\\cocoartf2761`,
    "\\cocoatextscaling0\\cocoaplatform0{\\fonttbl\\f0\\fswiss\\fcharset0 Helvetica;\\f1\\fswiss\\fcharset0 Helvetica-Bold;}",
    "{\\colortbl;\\red255\\green255\\blue255;}",
    "{\\*\\expandedcolortbl;;}",
    "\\paperw11900\\paperh16840\\margl1440\\margr1440\\vieww11520\\viewh8400\\viewkind0",
    "\\pard\\tx720\\tx1440\\tx2160\\tx2880\\tx3600\\tx4320\\tx5040\\tx5760\\tx6480\\tx7200\\tx7920\\tx8640\\pardirnatural\\partightenfactor0",
    "",
    "\\f0\\fs24 \\cf0 \\expnd0\\expndtw0\\kerning0",
    paragraphs.join("\\\n") + "}",
  ].join("\n");
}

const RUN = "{\\rtlch\\fcs1 \\af31507 \\ltrch\\fcs0 \\insrsid2298573 ";
const PARA = "\\pard\\plain \\ltrpar\\ql \\li0\\ri0\\sa160\\sl259\\slmult1\\widctlpar\\wrapdefault\\aspalpha\\aspnum\\faauto\\adjustright\\rin0\\lin0\\itap0 \\rtlch\\fcs1 \\af31507\\afs22\\alang1025 \\ltrch\\fcs0 \\f31506\\fs22\\lang1033\\langfe1033\\cgrid\\langnp1033\\langfenp1033 ";
const CELL_PARA = PARA.replace("\\widctlpar", "\\widctlpar\\intbl");
const ROW_DEF =
  "\\trowd \\irow0\\irowband0\\ltrrow\\ts11\\trgaph108\\trleft-108\\trbrdrt\\brdrs\\brdrw10 \\trftsWidth1\\trpaddl108\\trpaddr108\\tblrsid2298573\\tblind0\\tblindtype3 \\clvertalt\\clbrdrt\\brdrs\\brdrw10 \\cltxlrtb\\clftsWidth3\\clwWidth4680\\clshdrawnil \\cellx4572\\clvertalt\\clbrdrt\\brdrs\\brdrw10 \\cltxlrtb\\clftsWidth3\\clwWidth4680\\clshdrawnil \\cellx9252";

/** Word only: a table row, one RTF snippet per cell. */
export function rtfTableRow(cells: string[]): string {
  return `${ROW_DEF}${CELL_PARA}${RUN}${cells.join("\\cell ")}\\cell }${CELL_PARA}${RUN}${ROW_DEF}\\row }`;
}

// Word writes font, style and revision tables, document info with \upr
// (ANSI text with a Unicode copy in \*\ud), runs tagged with \rsid numbers,
// and headers and footers as groups before the body.
function word({ paragraphs, header, footer, codepage, pages, columns }: RtfOptions): string {
  const part = (kind: string, text: string) =>
    `{\\${kind} \\ltrpar ${PARA}${RUN}${text}}${RUN}\\par }}`;
  // Table rows and frames carry their own paragraph properties.
  const body = paragraphs.map((p) =>
    p.startsWith("\\trowd") || p.startsWith("\\pard") ? p : `${PARA}${RUN}${p}}${RUN}\\par }`,
  );
  const nofpages = pages === null ? "" : `{\\nofpages${pages ?? 1}}`;
  const cols = columns ? `\\cols${columns}\\colsx720` : "";
  return [
    `{\\rtf1\\adeflang1025\\ansi${ansicpg(codepage)}\\uc1\\adeff31507\\deff0\\stshfdbch31505\\stshfloch31506\\stshfhich31506\\stshfbi31507\\deflang1033\\deflangfe1033\\themelang1033\\themelangfe0\\themelangcs0{\\fonttbl{\\f0\\fbidi \\froman\\fcharset0\\fprq2{\\*\\panose 02020603050405020304}Times New Roman;}{\\f3\\fbidi \\froman\\fcharset2\\fprq2{\\*\\panose 05050102010706020507}Symbol;}{\\f31506\\fbidi \\fswiss\\fcharset0\\fprq2{\\*\\panose 020f0502020204030204}Calibri;}}`,
    "{\\colortbl;\\red0\\green0\\blue0;\\red0\\green0\\blue255;}",
    "{\\*\\defchp \\f31506\\fs22 }{\\*\\defpap \\ql \\li0\\ri0\\sa160\\sl259\\slmult1 }",
    "{\\stylesheet{\\ql \\li0\\ri0\\sa160\\sl259\\slmult1\\widctlpar \\snext0 \\sqformat \\spriority0 Normal;}{\\*\\cs10 \\additive \\ssemihidden \\sunhideused \\spriority1 Default Paragraph Font;}}",
    "{\\*\\rsidtbl \\rsid1080000\\rsid2298573}",
    "{\\mmathPr\\mmathFont34\\mbrkBin0\\mbrkBinSub0\\msmallFrac0\\mdispDef1\\mlMargin0\\mrMargin0}",
    `{\\info{\\upr{\\title R\\'e9sum\\'e9}{\\*\\ud{\\title R\\u233\\'e9sum\\u233\\'e9}}}{\\author Jane Doe}{\\operator Jane Doe}{\\creatim\\yr2026\\mo11\\dy20\\hr9\\min5}{\\version2}{\\edmins1}${nofpages}{\\nofwords120}{\\nofchars700}{\\vern121}}`,
    "{\\*\\xmlnstbl {\\xmlns1 http://schemas.microsoft.com/office/word/2003/wordml}}",
    "{\\*\\generator Microsoft Word 16.0;}",
    "\\paperw12240\\paperh15840\\margl1440\\margr1440\\margt1440\\margb1440\\gutter0\\ltrsect",
    "\\widowctrl\\ftnbj\\aenddoc\\trackmoves0\\trackformatting1\\donotembedsysfont1\\relyonvml0\\donotembedlingdata0",
    `\\sectd \\ltrsect\\linex0${cols}\\endnhere\\sectlinegrid360\\sectdefaultcl\\sftnbj`,
    header === undefined ? "" : part("header", header),
    footer === undefined ? "" : part("footer", footer),
    "{\\*\\pnseclvl1\\pnucrm\\pnstart1\\pnindent720\\pnhang {\\pntxta .}}",
    ...body,
    "{\\*\\themedata 504b030414000600080000002100e9de0fbfff0000001c020000130000005b436f6e74656e745f54797065735d2e786d6cac}",
    "{\\*\\datastore 01050000020000001800000057006f00720064002e0044006f00630075006d0065006e0074002e0038000000}}",
  ].join("\n");
}

/** Word only: a bullet paragraph, as Word writes list items with a Symbol bullet. */
export function rtfBullet(text: string): string {
  return `{\\listtext\\pard\\plain\\ltrpar \\rtlch\\fcs1 \\af31507 \\ltrch\\fcs0 \\f3\\insrsid2298573 \\loch\\af3\\dbch\\af31505\\hich\\f3 \\'b7\\tab}${text}`;
}

/**
 * Word only: a text box, as Word writes one: a shape whose text is in
 * `\shptxt`, plus a drawing-object copy in `\shprslt` for older readers.
 */
export function rtfTextBox(lines: string[]): string {
  const paras = lines.map((l) => `${PARA}${RUN}${l}}${RUN}\\par }`).join("");
  return [
    "{\\shp{\\*\\shpinst\\shpleft0\\shptop0\\shpright2880\\shpbottom1440\\shpfhdr0\\shpbxcolumn\\shpbxignore\\shpbypara\\shpbyignore\\shpwr3\\shpwrk0\\shpfblwtxt0\\shpz0\\shplid1026",
    "{\\sp{\\sn shapeType}{\\sv 202}}{\\sp{\\sn fFlipH}{\\sv 0}}{\\sp{\\sn fFlipV}{\\sv 0}}{\\sp{\\sn lTxid}{\\sv 65536}}",
    `{\\shptxt \\ltrpar ${paras}}`,
    "{\\sp{\\sn fLayoutInCell}{\\sv 1}}}",
    `{\\shprslt{\\*\\do\\dobxcolumn\\dobypara\\dodhgt8192\\dptxbx\\dptxlrtb{\\dptxbxtext\\ltrpar ${paras}}\\dpx0\\dpy0\\dpxsize2880\\dpysize1440\\dpfillfgcr255\\dpfillbgcr255\\dpfillpat1\\dplinew15}}}`,
  ].join("");
}

/** Word only: a paragraph in a text frame, positioned on the page (`\posx`, `\absw`). */
export function rtfFrame(text: string): string {
  const framed = PARA.replace(
    "\\widctlpar",
    "\\widctlpar\\phmrg\\posx7200\\posy0\\absw2880\\dxfrtext180\\dfrmtxtx180\\dfrmtxty0\\wraparound",
  );
  return `${framed}${RUN}${text}}${RUN}\\par }`;
}

/**
 * Word only: an inline picture, as Word writes one: a PNG in `\shppict`, and
 * a metafile copy in `\nonshppict` for older readers. Sizes are in twips
 * (1440 per inch, 15 per pixel) before scaling by `scale` percent.
 */
export function rtfPicture(widthTwips: number, heightTwips: number, scale = 100): string {
  const sizes = `\\picscalex${scale}\\picscaley${scale}\\piccropl0\\piccropr0\\piccropt0\\piccropb0\\picw${widthTwips}\\pich${heightTwips}\\picwgoal${widthTwips}\\pichgoal${heightTwips}`;
  return `{\\*\\shppict{\\pict{\\*\\picprop\\shplid1025{\\sp{\\sn shapeType}{\\sv 75}}{\\sp{\\sn fLayoutInCell}{\\sv 1}}}${sizes}\\pngblip\\bliptag-1{\\*\\blipuid 00000000000000000000000000000000}89504e470d0a1a0a0000000d49484452}}{\\nonshppict{\\pict${sizes}\\wmetafile8\\bliptag-1 010009000003}}`;
}
