"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { FileText } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { CareerProfile, Evidence } from "@/lib/profile/schema";

type Sources = CareerProfile["sources"];

const TYPE_LABELS: Record<Sources[number]["documentType"], string> = {
  resume: "Résumé",
  cover_letter: "Cover letter",
  project: "Project",
};

// Short delays so moving the mouse from the trigger into the popover doesn't close it.
const OPEN_DELAY_MS = 150;
const CLOSE_DELAY_MS = 200;

function documentCount(evidence: Evidence[]): number {
  return new Set(evidence.map((e) => e.documentId)).size;
}

/** The quotes behind an item, grouped by the document they came from. */
function EvidenceList({ evidence, sources }: { evidence: Evidence[]; sources: Sources }) {
  const byDocument = new Map<string, string[]>();
  for (const e of evidence) {
    byDocument.set(e.documentId, [...(byDocument.get(e.documentId) ?? []), e.quote]);
  }

  return (
    <ul className="flex flex-col gap-3">
      {[...byDocument.entries()].map(([documentId, quotes]) => {
        const source = sources.find((s) => s.documentId === documentId);
        return (
          <li key={documentId} className="flex flex-col gap-1">
            <p className="text-xs">
              <span className="font-medium">{source?.documentName ?? "A deleted document"}</span>
              {source && (
                <span className="text-muted-foreground"> · {TYPE_LABELS[source.documentType]}</span>
              )}
            </p>
            {quotes.map((quote, i) => (
              <blockquote
                key={i}
                className="border-l-2 pl-2 text-xs text-muted-foreground italic"
              >
                “{quote}”
              </blockquote>
            ))}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Keeps an item's evidence out of the way: the quotes only show in a popover
 * that opens on hover with a mouse, on tap with touch, or with the keyboard.
 *
 * By default the trigger is a quiet "2 sources" label. Pass `children` to make
 * something else the trigger, such as a skill chip, and `details` to show more
 * about the item above the quotes.
 */
export function EvidencePopover({
  evidence,
  sources,
  details,
  children,
  label,
  className,
}: {
  evidence: Evidence[];
  sources: Sources;
  details?: ReactNode;
  children?: ReactNode;
  /** Accessible name for a custom trigger, e.g. "PostgreSQL: details and sources". */
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const openedByHover = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const count = documentCount(evidence);
  if (count === 0 && !details) return children ?? null;

  function schedule(next: boolean, delay: number) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      openedByHover.current = next;
      setOpen(next);
    }, delay);
  }

  function pin() {
    if (timer.current) clearTimeout(timer.current);
    openedByHover.current = false;
  }

  const hoverHandlers = {
    onPointerEnter: (e: React.PointerEvent) => {
      if (e.pointerType === "mouse") schedule(true, OPEN_DELAY_MS);
    },
    onPointerLeave: (e: React.PointerEvent) => {
      if (e.pointerType === "mouse" && openedByHover.current) schedule(false, CLOSE_DELAY_MS);
      else if (e.pointerType === "mouse" && timer.current) clearTimeout(timer.current);
    },
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (timer.current) clearTimeout(timer.current);
        openedByHover.current = false;
        setOpen(next);
      }}
    >
      <PopoverTrigger
        {...hoverHandlers}
        onClick={(e) => {
          // A click on something already open from hovering pins it open.
          if (open && openedByHover.current) {
            e.preventDefault();
            openedByHover.current = false;
          }
        }}
        aria-label={children ? label : undefined}
        className={cn(
          !children &&
            "inline-flex items-center gap-1 rounded-sm text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          className,
        )}
      >
        {children ?? (
          <>
            <FileText className="h-3 w-3" aria-hidden />
            {count === 1 ? "1 source" : `${count} sources`}
          </>
        )}
      </PopoverTrigger>
      <PopoverContent
        {...hoverHandlers}
        // Clicking or tabbing into a popover opened by hovering pins it open,
        // so its buttons and menus (which render outside it) can be used.
        onPointerDownCapture={pin}
        onFocusCapture={pin}
        align="start"
        className="flex max-h-80 w-80 max-w-[calc(100vw-2rem)] flex-col gap-3 overflow-y-auto p-3"
        onOpenAutoFocus={(e) => {
          // Opening on hover shouldn't steal focus from the page.
          if (openedByHover.current) e.preventDefault();
        }}
      >
        {details}
        {count > 0 && (
          <>
            {details && <hr className="border-border" />}
            <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              From your documents
            </p>
            <EvidenceList evidence={evidence} sources={sources} />
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
