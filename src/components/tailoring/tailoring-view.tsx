"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, CircleDashed, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Decision, Tailoring } from "@/lib/tailoring/tailoring";
import { SuggestionDetails, type GapPromptProps } from "./suggestion-details";
import { acceptedCount, resumeView, stepItem, type AddBlock, type ViewBlock, type ViewInline, type ViewMarker } from "./view";

const ACCEPTED = new Set<Decision["status"]>(["accepted", "edited", "own_text"]);

/** The highlight's colours for its decision, and a ring when it's selected. */
function markClass(status: Decision["status"], selected: boolean) {
  return cn(
    "cursor-pointer rounded-sm text-inherit outline-none focus-visible:ring-2 focus-visible:ring-ring",
    ACCEPTED.has(status)
      ? "bg-green-500/15 hover:bg-green-500/25"
      : status === "rejected" || status === "skipped"
        ? "bg-muted underline decoration-muted-foreground/50 decoration-dotted hover:bg-muted/70"
        : "bg-yellow-400/30 hover:bg-yellow-400/45",
    selected && "ring-2 ring-primary",
  );
}

function ItemNumber({ number }: { number: number }) {
  return <sup className="mr-0.5 text-[0.65rem] font-semibold text-muted-foreground">{number}</sup>;
}

interface Selectable {
  selectedId: string | null;
  onSelect: (itemId: string) => void;
}

function Inline({ inline, selectedId, onSelect }: { inline: ViewInline } & Selectable) {
  if (inline.kind === "text") return <>{inline.text}</>;
  return (
    <mark
      role="button"
      tabIndex={0}
      data-item-id={inline.itemId}
      aria-label={`Suggestion ${inline.number}: ${inline.text}`}
      aria-pressed={selectedId === inline.itemId}
      className={markClass(inline.status, selectedId === inline.itemId)}
      onClick={() => onSelect(inline.itemId)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(inline.itemId);
        }
      }}
    >
      <ItemNumber number={inline.number} />
      {inline.text}
    </mark>
  );
}

function AddPlaceholder({ block, selectedId, onSelect }: { block: AddBlock } & Selectable) {
  const selected = selectedId === block.itemId;
  return (
    <button
      type="button"
      data-item-id={block.itemId}
      aria-pressed={selected}
      onClick={() => onSelect(block.itemId)}
      className={cn(
        "my-0.5 flex w-full items-start gap-2 rounded-sm px-1 py-0.5 text-left",
        block.text === null && "border border-dashed border-yellow-500/60",
        markClass(block.status, selected),
      )}
    >
      {block.bullet && block.text !== null && <span aria-hidden>•</span>}
      <span>
        <ItemNumber number={block.number} />
        {block.text ?? (
          <span className="inline-flex items-center gap-1 text-muted-foreground italic">
            <Plus className="h-3 w-3" />
            {block.status === "rejected" ? "Add rejected" : "New text goes here"}
          </span>
        )}
      </span>
    </button>
  );
}

function Block({ block, ...selectable }: { block: ViewBlock } & Selectable) {
  if (block.kind === "add") return <AddPlaceholder block={block} {...selectable} />;
  const inlines = block.inlines.map((inline, i) => <Inline key={i} inline={inline} {...selectable} />);
  if (block.kind === "heading") {
    if (block.level === 1) return <h2 className="text-xl font-semibold">{inlines}</h2>;
    if (block.level === 2) {
      return <h3 className="mt-4 border-b pb-1 text-xs font-semibold tracking-wide uppercase">{inlines}</h3>;
    }
    return <h4 className="mt-2 text-sm font-medium">{inlines}</h4>;
  }
  if (block.kind === "bullet") {
    return (
      <div className="flex gap-2 pl-1">
        <span aria-hidden>•</span>
        <p>{inlines}</p>
      </div>
    );
  }
  return <p>{inlines}</p>;
}

function Markers({ markers, ...selectable }: { markers: ViewMarker[] } & Selectable) {
  if (markers.length === 0) return null;
  return (
    <section className="mt-6 flex flex-col gap-2 rounded-md border border-dashed p-3">
      <h3 className="text-xs font-semibold">Not on your Resume yet</h3>
      <ul className="flex flex-col gap-1 text-sm">
        {markers.map((marker) => (
          <li key={marker.itemId}>
            <button
              type="button"
              data-item-id={marker.itemId}
              aria-pressed={selectable.selectedId === marker.itemId}
              onClick={() => selectable.onSelect(marker.itemId)}
              className={cn(
                "inline-flex items-start gap-1.5 px-1 py-0.5 text-left",
                markClass(marker.status, selectable.selectedId === marker.itemId),
              )}
            >
              <CircleDashed className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                <ItemNumber number={marker.number} />
                {marker.label}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

interface TailoringViewProps {
  tailoring: Tailoring;
  /** Shown above the Resume, such as the Earlier-version notice. */
  notice?: ReactNode;
  onDecide: (itemId: string, decision: Decision) => void;
  gapPrompt: (props: GapPromptProps) => ReactNode;
}

/**
 * The Resume with every item marked in place, and the details panel for the
 * selected one: beside the Resume when there's room, below it when there isn't.
 */
export function TailoringView({ tailoring, notice, onDecide, gapPrompt }: TailoringViewProps) {
  const view = useMemo(() => resumeView(tailoring), [tailoring]);
  const { items } = tailoring;
  const [selectedId, setSelectedId] = useState<string | null>(
    () => (items.find((i) => i.decision.status === "undecided") ?? items[0])?.id ?? null,
  );
  const resumeRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);

  const index = items.findIndex((i) => i.id === selectedId);
  const selected = index === -1 ? null : items[index];
  const { accepted, total } = acceptedCount(items);

  /** Whether the details panel is below the Resume rather than beside it. */
  const stacked = () => {
    const resume = resumeRef.current;
    const panel = panelRef.current;
    return !!resume && !!panel && panel.offsetLeft <= resume.offsetLeft;
  };

  function select(itemId: string, from: "resume" | "step") {
    setSelectedId(itemId);
    requestAnimationFrame(() => {
      if (stacked()) {
        panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      } else if (from === "step") {
        resumeRef.current
          ?.querySelector(`[data-item-id="${CSS.escape(itemId)}"]`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });
  }

  function step(direction: "next" | "previous") {
    const id = stepItem(items, selectedId, direction);
    if (id) select(id, "step");
  }

  const selectable = { selectedId, onSelect: (itemId: string) => select(itemId, "resume") };

  return (
    <div className="@container flex h-full flex-col">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-2 sm:px-6">
        <span className="text-sm" aria-live="polite">
          <span className="font-medium">
            {accepted} of {total}
          </span>{" "}
          accepted
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => step("previous")}
            disabled={!stepItem(items, selectedId, "previous") || index === -1}
          >
            <ChevronLeft /> Previous
          </Button>
          <Button variant="outline" size="sm" onClick={() => step("next")} disabled={!stepItem(items, selectedId, "next")}>
            Next <ChevronRight />
          </Button>
        </div>
      </div>
      {notice}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto @2xl:flex-row @2xl:overflow-hidden">
        <div ref={resumeRef} className="px-4 py-4 sm:px-6 @2xl:min-h-0 @2xl:flex-1 @2xl:overflow-y-auto">
          <article aria-label="Your Resume" className="mx-auto flex max-w-2xl flex-col gap-1 text-sm leading-relaxed">
            {view.blocks.map((block, i) => (
              <Block key={i} block={block} {...selectable} />
            ))}
          </article>
          <div className="mx-auto max-w-2xl">
            <Markers markers={view.markers} {...selectable} />
          </div>
        </div>
        <aside
          ref={panelRef}
          aria-label="Suggestion details"
          className="scroll-mt-2 border-t px-4 py-4 @2xl:min-h-0 @2xl:w-80 @2xl:shrink-0 @2xl:overflow-y-auto @2xl:border-t-0 @2xl:border-l @4xl:w-96"
        >
          {selected ? (
            <SuggestionDetails
              key={selected.id}
              item={selected}
              number={index + 1}
              total={items.length}
              onDecide={(decision) => onDecide(selected.id, decision)}
              gapPrompt={gapPrompt}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              {items.length === 0
                ? "Your Resume already covers this Job's Requirements and Screeners. There's nothing to tailor."
                : "Select a highlight, or press Next, to see its Suggestion."}
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
