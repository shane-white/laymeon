/**
 * Builds RTF test files that copy what TextEdit and Word write. Paragraphs
 * and cells are RTF snippets, so tests can use escapes like `\'e9` and `舗`.
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
function word({ paragraphs, header, footer, codepage }: RtfOptions): string {
  const part = (kind: string, text: string) =>
    `{\\${kind} \\ltrpar ${PARA}${RUN}${text}}${RUN}\\par }}`;
  const body = paragraphs.map((p) => (p.startsWith("\\trowd") ? p : `${PARA}${RUN}${p}}${RUN}\\par }`));
  return [
    `{\\rtf1\\adeflang1025\\ansi${ansicpg(codepage)}\\uc1\\adeff31507\\deff0\\stshfdbch31505\\stshfloch31506\\stshfhich31506\\stshfbi31507\\deflang1033\\deflangfe1033\\themelang1033\\themelangfe0\\themelangcs0{\\fonttbl{\\f0\\fbidi \\froman\\fcharset0\\fprq2{\\*\\panose 02020603050405020304}Times New Roman;}{\\f3\\fbidi \\froman\\fcharset2\\fprq2{\\*\\panose 05050102010706020507}Symbol;}{\\f31506\\fbidi \\fswiss\\fcharset0\\fprq2{\\*\\panose 020f0502020204030204}Calibri;}}`,
    "{\\colortbl;\\red0\\green0\\blue0;\\red0\\green0\\blue255;}",
    "{\\*\\defchp \\f31506\\fs22 }{\\*\\defpap \\ql \\li0\\ri0\\sa160\\sl259\\slmult1 }",
    "{\\stylesheet{\\ql \\li0\\ri0\\sa160\\sl259\\slmult1\\widctlpar \\snext0 \\sqformat \\spriority0 Normal;}{\\*\\cs10 \\additive \\ssemihidden \\sunhideused \\spriority1 Default Paragraph Font;}}",
    "{\\*\\rsidtbl \\rsid1080000\\rsid2298573}",
    "{\\mmathPr\\mmathFont34\\mbrkBin0\\mbrkBinSub0\\msmallFrac0\\mdispDef1\\mlMargin0\\mrMargin0}",
    "{\\info{\\upr{\\title R\\'e9sum\\'e9}{\\*\\ud{\\title R\\u233\\'e9sum\\u233\\'e9}}}{\\author Jane Doe}{\\operator Jane Doe}{\\creatim\\yr2026\\mo11\\dy20\\hr9\\min5}{\\version2}{\\edmins1}{\\nofpages1}{\\nofwords120}{\\nofchars700}{\\vern121}}",
    "{\\*\\xmlnstbl {\\xmlns1 http://schemas.microsoft.com/office/word/2003/wordml}}",
    "{\\*\\generator Microsoft Word 16.0;}",
    "\\paperw12240\\paperh15840\\margl1440\\margr1440\\margt1440\\margb1440\\gutter0\\ltrsect",
    "\\widowctrl\\ftnbj\\aenddoc\\trackmoves0\\trackformatting1\\donotembedsysfont1\\relyonvml0\\donotembedlingdata0",
    "\\sectd \\ltrsect\\linex0\\endnhere\\sectlinegrid360\\sectdefaultcl\\sftnbj",
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
