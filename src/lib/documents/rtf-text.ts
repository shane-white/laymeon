/**
 * Reads the text of an RTF file (a file whose `kindOf` is "rtf"), as saved by
 * WordPad, TextEdit and Word. A small tokenizer of our own: it keeps
 * paragraphs, line breaks, tabs and table cells, decodes accented letters
 * and other special characters, reads text boxes once (not the copies Word
 * keeps for older readers), and skips everything else that isn't text (font
 * and colour tables, styles, document info, pictures, field codes). It also
 * notes the layout resume-reading software stumbles on: tables, text boxes
 * and frames, columns, pictures and the recorded page count.
 */
import { UnreadableFileError } from "./document";
import { joinDocumentText } from "./document-text";

/** The text of an RTF file's parts, each one line per paragraph or line break, without blank lines. */
export interface RtfParts {
  body: string;
  /** Page header text. Word keeps separate ones for the first page and left and right pages. */
  headers: string[];
  footers: string[];
  /** Tables in the body: runs of rows (`\trowd` … `\row`) with no other paragraph between them. */
  tables: number;
  /** Text boxes (`\shptxt` in a shape) and text frames (paragraphs positioned with `\posx`, `\absw` and the like) in the body. */
  textBoxes: number;
  /** The most text columns (`\colsN`) any section uses. */
  columns: number;
  /** The page count in the document info (`\nofpagesN`), or null when it isn't recorded. Word records it; WordPad and TextEdit don't. */
  pageCount: number | null;
  /** Pictures in the body, in pixels as shown (`\picwgoal`/`\pichgoal`, scaled). */
  images: { width: number; height: number }[];
}

/**
 * All the text of an RTF file: headers, then the body, then footers, like the
 * Word reader. Repeated headers and footers are kept once. Throws
 * `UnreadableFileError` if the file isn't RTF.
 */
export function readRtfText(buffer: Buffer): string {
  return joinDocumentText(readRtfParts(buffer));
}

// Copies of shapes and pictures for readers that don't understand \shp and \shppict.
const COPIES = ["shprslt", "nonshppict"];
// Groups that hold no text for the reader. Groups starting with \* are skipped too.
const SKIPPED = new Set([
  "fonttbl",
  "colortbl",
  "stylesheet",
  "info",
  "pict",
  "object",
  "fldinst",
  "listtable",
  "listoverridetable",
  "revtbl",
  "filetbl",
  "pn",
  "footnote",
  "xe",
  "tc",
  ...COPIES,
]);
// Paragraph properties that put a paragraph in a text frame.
const FRAME_WORDS = new Set([
  "absw",
  "absh",
  "posx",
  "posxc",
  "posxi",
  "posxo",
  "posxl",
  "posxr",
  "posy",
  "posyc",
  "posyt",
  "posyb",
  "posyil",
  "posyin",
  "posyout",
  "phmrg",
  "phpg",
  "phcol",
  "pvmrg",
  "pvpg",
  "pvpara",
]);
// 1440 twips per inch, 96 pixels per inch.
const TWIPS_PER_PIXEL = 15;
const HEADERS = new Set(["header", "headerl", "headerr", "headerf"]);
const FOOTERS = new Set(["footer", "footerl", "footerr", "footerf"]);

const SYMBOLS: Record<string, string> = {
  par: "\n",
  sect: "\n",
  page: "\n",
  line: "\n",
  row: "\n",
  nestrow: "\n",
  tab: "\t",
  cell: "\t",
  nestcell: "\t",
  emdash: "\u2014",
  endash: "\u2013",
  emspace: " ",
  enspace: " ",
  qmspace: " ",
  lquote: "\u2018",
  rquote: "\u2019",
  ldblquote: "\u201c",
  rdblquote: "\u201d",
  bullet: "\u2022",
};

// The code page for a font's \fcharsetN, when it isn't the document's own.
const CHARSET_CODEPAGES: Record<number, number> = {
  77: 10000,
  128: 932,
  129: 949,
  134: 936,
  136: 950,
  161: 1253,
  162: 1254,
  177: 1255,
  178: 1256,
  186: 1257,
  204: 1251,
  222: 874,
  238: 1250,
};
const SYMBOL_CHARSET = 2;
// Bullets in the Symbol and Wingdings fonts, which Word and WordPad use for lists.
const SYMBOL_FONT_CHARS: Record<number, string> = { 0xb7: "\u2022", 0xa7: "\u25aa", 0xd8: "\u27a2", 0xfc: "\u2713" };

// The Private Use Area, which has no visible characters of its own. Word
// writes Symbol and Wingdings characters there as U+F000 plus their code.
const PRIVATE_USE_START = 0xe000;
const PRIVATE_USE_END = 0xf8ff;
const SYMBOL_FONT_BASE = 0xf000;

/** The text for a `\uN` character: Symbol font bullets and spaces are mapped, other private ones dropped. */
function unicodeChar(code: number): string {
  if (code < PRIVATE_USE_START || code > PRIVATE_USE_END) return String.fromCharCode(code);
  const symbol = code - SYMBOL_FONT_BASE;
  if (symbol === 0x20) return " ";
  return SYMBOL_FONT_CHARS[symbol] ?? "";
}

const ENCODINGS: Record<number, string> = {
  932: "shift_jis",
  936: "gbk",
  949: "euc-kr",
  950: "big5",
  10000: "macintosh",
};

const decoders = new Map<number, TextDecoder>();

/** A decoder for a Windows code page, falling back to Windows-1252 for ones it doesn't know. */
function decoderFor(codepage: number): TextDecoder {
  let decoder = decoders.get(codepage);
  if (!decoder) {
    try {
      decoder = new TextDecoder(ENCODINGS[codepage] ?? `windows-${codepage}`);
    } catch {
      decoder = new TextDecoder("windows-1252");
    }
    decoders.set(codepage, decoder);
  }
  return decoder;
}

interface GroupState {
  skip: boolean;
  /** How many fallback characters follow each \uN. */
  uc: number;
  font: number;
  inFontTable: boolean;
  out: string[];
  /** In a shape (\shpinst) whose text box text (\shptxt) is read. */
  readableShape: boolean;
  /** In a shape or a list item's bullet, whose paragraphs aren't the body's own. */
  ignoreLayout: boolean;
  /** In a copy of a shape or picture for older readers (\shprslt, \nonshppict). */
  copy: boolean;
  /** The current paragraph is in a table (\intbl) or a text frame. */
  inTable: boolean;
  inFrame: boolean;
  /** The picture whose sizes are being read. */
  picture: Picture | null;
}

interface Picture {
  width: number;
  height: number;
  scaleX: number;
  scaleY: number;
}

/** The text of an RTF file's body, headers and footers. Throws `UnreadableFileError` if the file isn't RTF. */
export function readRtfParts(buffer: Buffer): RtfParts {
  // One character per byte; bytes above 0x7F are decoded with the code page below.
  const rtf = buffer.toString("latin1");
  if (!rtf.trimStart().startsWith("{\\rtf")) {
    throw new UnreadableFileError("This isn't a readable RTF file");
  }

  const body: string[] = [];
  const headers: string[][] = [];
  const footers: string[][] = [];
  let codepage = 1252;
  const fontCharsets = new Map<number, number>();
  let fontBeingDefined = -1;

  let state: GroupState = {
    skip: false,
    uc: 1,
    font: -1,
    inFontTable: false,
    out: body,
    readableShape: false,
    ignoreLayout: false,
    copy: false,
    inTable: false,
    inFrame: false,
    picture: null,
  };
  const stack: GroupState[] = [];
  // Fallback characters still to skip after a \uN.
  let fallbackLeft = 0;
  let bytes: number[] = [];

  let tables = 0;
  let textBoxes = 0;
  let columns = 1;
  let pageCount: number | null = null;
  const pictures: Picture[] = [];
  // Whether the last body paragraph with content was in a table, or in a frame.
  let lastInTable = false;
  let lastInFrame = false;
  const inBody = () => state.out === body && !state.ignoreLayout && !state.copy;

  // Counts a table or frame when a body paragraph starts one: the paragraph before wasn't in one.
  const bodyContent = () => {
    if (!inBody()) return;
    if (state.inTable && !lastInTable) tables++;
    if (state.inFrame && !lastInFrame) textBoxes++;
    lastInTable = state.inTable;
    lastInFrame = state.inFrame;
  };

  const emit = (text: string) => {
    if (state.skip) return;
    bodyContent();
    state.out.push(text);
  };
  // A character that can be a \uN fallback.
  const emitChar = (char: string) => {
    if (fallbackLeft > 0) fallbackLeft--;
    else emit(char);
  };
  const flushBytes = () => {
    if (!bytes.length) return;
    const charset = fontCharsets.get(state.font);
    if (charset === SYMBOL_CHARSET) {
      emit(bytes.map((b) => SYMBOL_FONT_CHARS[b] ?? decoderFor(1252).decode(Uint8Array.of(b))).join(""));
    } else {
      const fontCodepage = charset === undefined ? undefined : CHARSET_CODEPAGES[charset];
      emit(decoderFor(fontCodepage ?? codepage).decode(Uint8Array.from(bytes)));
    }
    bytes = [];
  };
  const addByte = (byte: number) => {
    if (fallbackLeft > 0) fallbackLeft--;
    else bytes.push(byte);
  };

  const controlWord = (word: string, param: number | undefined) => {
    if (word in SYMBOLS) return emit(SYMBOLS[word]);
    if (FRAME_WORDS.has(word)) {
      state.inFrame = true;
      return;
    }
    if (word === "pict" && !state.copy && state.out === body) {
      state.picture = { width: 0, height: 0, scaleX: 100, scaleY: 100 };
      pictures.push(state.picture);
    }
    if (COPIES.includes(word)) state.copy = true;
    if (SKIPPED.has(word)) {
      state.skip = true;
      if (word === "fonttbl") state.inFontTable = true;
      return;
    }
    if (HEADERS.has(word) || FOOTERS.has(word)) {
      state.out = [];
      (HEADERS.has(word) ? headers : footers).push(state.out);
      return;
    }
    switch (word) {
      // A shape's properties are skipped (\*\shpinst), but a text box's text
      // is read, unless the shape is itself in a skipped group.
      case "shpinst":
        state.readableShape = !(stack.at(-1)?.skip ?? false);
        state.ignoreLayout = true;
        return;
      case "shptxt":
        if (state.readableShape) state.skip = false;
        if (state.out === body && !state.copy) textBoxes++;
        return;
      // A text box in Word 95's drawing objects.
      case "dptxbx":
        if (state.out === body && !state.copy) textBoxes++;
        return;
      case "listtext":
        state.ignoreLayout = true;
        return;
      case "pard":
        state.inTable = false;
        state.inFrame = false;
        return;
      case "intbl":
        state.inTable = true;
        return;
      // The table nesting depth. Word writes \itap0 with \intbl in a top-level table, so 0 doesn't clear it.
      case "itap":
        if ((param ?? 1) > 0) state.inTable = true;
        return;
      case "cols":
        columns = Math.max(columns, param ?? 1);
        return;
      case "nofpages":
        pageCount = param && param > 0 ? param : null;
        return;
      case "picwgoal":
        if (state.picture) state.picture.width = param ?? 0;
        return;
      case "pichgoal":
        if (state.picture) state.picture.height = param ?? 0;
        return;
      case "picscalex":
        if (state.picture) state.picture.scaleX = param ?? 100;
        return;
      case "picscaley":
        if (state.picture) state.picture.scaleY = param ?? 100;
        return;
      case "u":
        if (param !== undefined) {
          const char = unicodeChar(param < 0 ? param + 65536 : param);
          if (char) emit(char);
          fallbackLeft = state.uc;
        }
        return;
      case "uc":
        state.uc = param ?? 1;
        return;
      case "ansicpg":
        if (param) codepage = param;
        return;
      case "mac":
        codepage = 10000;
        return;
      case "f":
        if (state.inFontTable) fontBeingDefined = param ?? -1;
        else state.font = param ?? -1;
        return;
      case "fcharset":
        if (state.inFontTable && param !== undefined) fontCharsets.set(fontBeingDefined, param);
        return;
    }
  };

  let i = 0;
  while (i < rtf.length) {
    const c = rtf[i];
    if (c === "{" || c === "}") {
      flushBytes();
      fallbackLeft = 0;
      if (c === "{") {
        stack.push(state);
        state = { ...state };
      } else {
        state = stack.pop() ?? state;
      }
      i++;
    } else if (c === "\\") {
      const next = rtf[i + 1];
      if (next === "'") {
        addByte(parseInt(rtf.slice(i + 2, i + 4), 16));
        i += 4;
        continue;
      }
      flushBytes();
      const word = /^[a-zA-Z]+/.exec(rtf.slice(i + 1, i + 33))?.[0];
      if (word) {
        const paramText = /^-?\d+/.exec(rtf.slice(i + 1 + word.length, i + 13 + word.length))?.[0];
        i += 1 + word.length + (paramText?.length ?? 0);
        if (rtf[i] === " ") i++;
        const param = paramText === undefined ? undefined : Number(paramText);
        // \binN: N bytes of binary data follow.
        if (word === "bin") i += param ?? 0;
        else controlWord(word, param);
        continue;
      }
      i += 2;
      if (next === "\n" || next === "\r") emit("\n");
      else if (next === "*") state.skip = true;
      else if (next === "~") emitChar("\u00a0");
      else if (next === "_") emitChar("\u2011");
      else if (next === "\\" || next === "{" || next === "}") emitChar(next);
    } else {
      const code = rtf.charCodeAt(i);
      // Line ends in the file aren't text, and WordPad ends its files with a NUL.
      if (code === 0x09) {
        flushBytes();
        emitChar("\t");
      } else if (code >= 0x20) {
        if (code >= 0x80) addByte(code);
        else {
          flushBytes();
          emitChar(c);
        }
      }
      i++;
    }
  }
  flushBytes();

  return {
    body: tidy(body),
    headers: headers.map(tidy),
    footers: footers.map(tidy),
    tables,
    textBoxes,
    columns,
    pageCount,
    images: pictures.map((p) => ({
      width: Math.round((p.width * p.scaleX) / 100 / TWIPS_PER_PIXEL),
      height: Math.round((p.height * p.scaleY) / 100 / TWIPS_PER_PIXEL),
    })),
  };
}

/** One line per paragraph, without trailing whitespace or blank lines. */
function tidy(chunks: string[]): string {
  return chunks
    .join("")
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.trim())
    .join("\n");
}
