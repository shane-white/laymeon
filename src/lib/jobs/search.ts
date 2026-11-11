/**
 * Search text with case and accents folded, plus a map from each folded
 * character back to the original string, so a match can be highlighted.
 */
export interface FoldedText {
  folded: string;
  /** For each index in `folded`: [start, end) of the source character in the original. */
  sourceRanges: [number, number][];
}

const DIACRITIC = /\p{Diacritic}/u;

/** Folds one character (code point) for matching. May return zero or more characters. */
function foldChar(ch: string): string {
  let out = "";
  for (const part of ch.normalize("NFD")) {
    if (!DIACRITIC.test(part)) out += part;
  }
  return out.toLowerCase();
}

export function foldText(text: string): FoldedText {
  let folded = "";
  const sourceRanges: [number, number][] = [];
  let index = 0;
  for (const ch of text) {
    const end = index + ch.length;
    for (const part of foldChar(ch)) {
      folded += part;
      // Most folded characters are a single code unit; record one range per unit.
      for (let i = 0; i < part.length; i++) sourceRanges.push([index, end]);
    }
    index = end;
  }
  return { folded, sourceRanges };
}

export function foldQuery(query: string): string {
  return foldText(query.trim()).folded;
}

/**
 * Where the folded query first appears in the original text, as [start, end)
 * indices into the original. Null when there's no match.
 */
export function findMatch(
  text: FoldedText,
  foldedQuery: string,
): [number, number] | null {
  if (!foldedQuery) return null;
  const at = text.folded.indexOf(foldedQuery);
  if (at < 0) return null;
  const start = text.sourceRanges[at][0];
  const end = text.sourceRanges[at + foldedQuery.length - 1][1];
  return [start, end];
}
