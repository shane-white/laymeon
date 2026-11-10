import { findMatch, type FoldedText } from "@/lib/jobs/search";

interface HighlightedTextProps {
  text: string;
  /** `text` folded for search; pass it to avoid refolding on each render. */
  folded: FoldedText;
  foldedQuery: string;
}

/** Shows `text` with the first match of the search query highlighted. */
export function HighlightedText({
  text,
  folded,
  foldedQuery,
}: HighlightedTextProps) {
  const range = findMatch(folded, foldedQuery);
  if (!range) return <>{text}</>;
  const [start, end] = range;
  return (
    <>
      {text.slice(0, start)}
      <mark className="rounded-sm bg-yellow-400/30 text-inherit">
        {text.slice(start, end)}
      </mark>
      {text.slice(end)}
    </>
  );
}
