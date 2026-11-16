"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { BookOpen, ChevronDown, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReviewCheck } from "@/lib/resume-review/report-schema";
import { readFurther } from "@/lib/resume-review/sources";
import type { CheckId } from "@/lib/resume-review/types";
import { LabelBadge } from "./labels";

/** The "Read further" link for a check: its best source, or its section of How we review resumes. */
export function ReadFurtherLink({ checkId, className }: { checkId: CheckId; className?: string }) {
  const target = readFurther(checkId);
  const linkClass = cn(
    "inline-flex w-fit items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline",
    className,
  );
  if (target.kind === "guide") {
    return (
      <Link href={target.href} className={linkClass} title={target.title}>
        <BookOpen className="h-3 w-3" aria-hidden />
        Read further: {target.title}
      </Link>
    );
  }
  return (
    <a href={target.source.url} target="_blank" rel="noopener noreferrer" className={linkClass} title={target.source.shows}>
      <BookOpen className="h-3 w-3" aria-hidden />
      Read further: {target.source.publisher}
      <ExternalLink className="h-3 w-3" aria-hidden />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}

/** Quotes from the resume, or what software read. */
export function EvidenceList({ evidence }: { evidence: string[] }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {evidence.map((e, i) => (
        <li key={i} className="border-l-2 pl-3 text-xs break-words text-muted-foreground">
          {e}
        </li>
      ))}
    </ul>
  );
}

/** One finding: its label, what to do, the evidence (shown on request) and a Read further link. */
export function CheckCard({ check }: { check: ReviewCheck }) {
  const [open, setOpen] = useState(false);
  const evidenceId = useId();
  return (
    <div className="flex flex-col gap-2 rounded-md border p-3">
      <div className="flex items-start gap-2">
        <LabelBadge label={check.label} className="mt-0.5 shrink-0" />
        <p className="text-sm">{check.summary}</p>
      </div>
      {check.evidence.length > 0 && (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls={evidenceId}
            className="inline-flex w-fit items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} aria-hidden />
            {open ? "Hide" : "Show"} {check.evidence.length === 1 ? "example" : `${check.evidence.length} examples`}
          </button>
          <div id={evidenceId} hidden={!open}>
            <EvidenceList evidence={check.evidence} />
          </div>
        </div>
      )}
      <ReadFurtherLink checkId={check.id} />
    </div>
  );
}
