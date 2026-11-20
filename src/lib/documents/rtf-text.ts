/**
 * Reads the text of an RTF file (a file whose `kindOf` is "rtf"), as saved by
 * WordPad, TextEdit and Word. A small tokenizer of our own: it keeps
 * paragraphs, line breaks, tabs and table cells, decodes accented letters
 * and other special characters, and skips everything that isn't text (font
 * and colour tables, styles, document info, pictures, field codes).
 */
import { UnreadableFileError } from "./document";

/** The text of an RTF file's parts, each one line per paragraph or line break, without blank lines. */
export interface RtfParts {
  body: string;
  /** Page header text. Word keeps separate ones for the first page and left and right pages. */
  headers: string[];
  footers: string[];
}

/**
 * All the text of an RTF file: headers, then the body, then footers, like the
 * Word reader. Repeated headers and footers are kept once. Throws
 * `UnreadableFileError` if the file isn't RTF.
 */
export function readRtfText(buffer: Buffer): string {
  const { body, headers, footers } = readRtfParts(buffer);
  const unique = (parts: string[]) => [...new Set(parts.filter((t) => t.trim()))];
  return [...unique(headers), body, ...unique(footers)].filter(Boolean).join("\n\n");
}

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
]);
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

  let state: GroupState = { skip: false, uc: 1, font: -1, inFontTable: false, out: body };
  const stack: GroupState[] = [];
  // Fallback characters still to skip after a \uN.
  let fallbackLeft = 0;
  let bytes: number[] = [];

  const emit = (text: string) => {
    if (!state.skip) state.out.push(text);
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
      case "u":
        if (param !== undefined) {
          emit(String.fromCharCode(param < 0 ? param + 65536 : param));
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

  return { body: tidy(body), headers: headers.map(tidy), footers: footers.map(tidy) };
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
