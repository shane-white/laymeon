"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Check, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { GUIDE_PATH } from "@/lib/resume-review/guide";
import type { Rewrite } from "@/lib/resume-review/report-schema";
import { splitPlaceholders, type Slide } from "@/lib/resume-review/slides";
import { CheckCard, EvidenceList, ReadFurtherLink } from "./check-card";
import { CHECK_LABELS, LabelBadge, OVERALL_LABELS, OverallBadge } from "./labels";

type SlideOf<K extends Slide["kind"]> = Extract<Slide, { kind: K }>;

function SlideFrame({ title, label, why, children }: { title: string; label?: ReactNode; why?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold">{title}</h2>
          {label}
        </div>
        {why && <p className="text-sm text-muted-foreground">{why}</p>}
      </div>
      {children}
    </div>
  );
}

export function OverviewSlide({ slide }: { slide: SlideOf<"overview"> }) {
  const { overall, counts } = slide;
  return (
    <SlideFrame title="Your resume review">
      <div className="flex flex-col gap-2">
        <OverallBadge label={overall.label} size="lg" />
        <p className="text-sm">{overall.reason}</p>
        <p className="text-xs text-muted-foreground">{OVERALL_LABELS[overall.label].meaning}</p>
      </div>
      <ul className="flex flex-wrap gap-2" aria-label="Checks by result">
        {(["fix", "could_improve", "good", "info"] as const)
          .filter((l) => counts[l] > 0)
          .map((l) => (
            <li key={l} className={cn("rounded-md px-2 py-1 text-xs font-medium", CHECK_LABELS[l].className)}>
              {counts[l]} {CHECK_LABELS[l].label}
            </li>
          ))}
      </ul>
      {overall.topFixes.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">Top fixes</h3>
          <ol className="flex flex-col gap-2">
            {overall.topFixes.map((fix, i) => (
              <li key={fix.checkId} className="flex items-start gap-2 text-sm">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
                  {i + 1}
                </span>
                <span>{fix.text}</span>
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <p className="flex items-center gap-2 text-sm">
          <Check className="h-4 w-4 text-green-600" aria-hidden /> Nothing to fix.
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Use the arrows, or click a section in the bar above, to go through the details.
      </p>
    </SlideFrame>
  );
}

export function SectionSlide({ slide }: { slide: SlideOf<"section"> }) {
  return (
    <SlideFrame title={slide.title} label={<LabelBadge label={slide.label} />} why={slide.why}>
      {slide.problems.length > 0 && (
        <div className="flex flex-col gap-3">
          {slide.problems.map((c) => (
            <CheckCard key={c.id} check={c} />
          ))}
        </div>
      )}
      {slide.info.length > 0 && (
        <div className="flex flex-col gap-3">
          {slide.info.map((c) => (
            <CheckCard key={c.id} check={c} />
          ))}
        </div>
      )}
      {slide.good.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">{slide.problems.length || slide.info.length ? "What's working" : "All good"}</h3>
          <ul className="flex flex-col gap-1.5">
            {slide.good.map((c) => (
              <li key={c.id} className="flex items-start gap-2 text-sm text-muted-foreground">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-600" aria-hidden />
                <span>{c.summary}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </SlideFrame>
  );
}

/** What a person sees next to what resume-reading software gets from the file. */
export function SoftwareSlide({ slide, resumeText }: { slide: SlideOf<"software">; resumeText: string | null }) {
  return (
    <SlideFrame
      title={slide.title}
      why="Left: your resume as a person reads it. Right: what resume-reading software got from the same file. Differences are what a recruiter's search can miss."
    >
      <div className="grid gap-3 md:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-2 rounded-md border p-3">
          <h3 className="text-xs font-medium text-muted-foreground">What you see</h3>
          {resumeText ? (
            <pre className="max-h-72 overflow-auto text-xs whitespace-pre-wrap">{resumeText}</pre>
          ) : (
            <p className="text-xs text-muted-foreground">The resume is no longer available.</p>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-2 rounded-md border border-dashed p-3">
          <h3 className="text-xs font-medium text-muted-foreground">What software reads</h3>
          <div className="flex max-h-72 flex-col gap-3 overflow-auto">
            {slide.checks.map((c) => (
              <div key={c.id} className="flex flex-col gap-1.5">
                <div className="flex items-start gap-2">
                  <LabelBadge label={c.label} className="shrink-0" />
                  <p className="text-xs">{c.summary}</p>
                </div>
                <EvidenceList evidence={c.evidence} />
                <ReadFurtherLink checkId={c.id} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </SlideFrame>
  );
}

function WithPlaceholders({ text }: { text: string }) {
  return (
    <>
      {splitPlaceholders(text).map((part, i) =>
        part.placeholder ? (
          <mark key={i} className="rounded bg-yellow-500/20 px-0.5 text-inherit">
            {part.text}
          </mark>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </>
  );
}

function RewriteCard({ rewrite }: { rewrite: Rewrite }) {
  const [showAfter, setShowAfter] = useState(true);
  return (
    <div className="flex flex-col gap-2 rounded-md border p-3">
      <div role="group" aria-label="Show" className="flex w-fit rounded-md border p-0.5 text-xs">
        {(
          [
            [false, "Before"],
            [true, "After"],
          ] as const
        ).map(([after, label]) => (
          <button
            key={label}
            type="button"
            aria-pressed={showAfter === after}
            onClick={() => setShowAfter(after)}
            className={cn(
              "rounded px-2 py-0.5 font-medium",
              showAfter === after ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {showAfter ? (
        <p className="text-sm">
          <span className="font-medium">If true, try: </span>
          <WithPlaceholders text={rewrite.suggested} />
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">{rewrite.current}</p>
      )}
      <p className="text-xs text-muted-foreground">{rewrite.why}</p>
      <ReadFurtherLink checkId={rewrite.checkId} />
    </div>
  );
}

export function RewritesSlide({ slide }: { slide: SlideOf<"rewrites"> }) {
  return (
    <SlideFrame
      title={slide.title}
      why="Stronger versions of some of your lines. They only use what your resume says: fill in the highlighted [placeholders] with your real numbers, and leave out anything that isn't true."
    >
      <div className="flex flex-col gap-3">
        {slide.rewrites.map((r) => (
          <RewriteCard key={r.current} rewrite={r} />
        ))}
      </div>
    </SlideFrame>
  );
}

export function NextStepsSlide({
  slide,
  onRerun,
  rerunning,
  canRerun,
}: {
  slide: SlideOf<"next">;
  onRerun: () => void;
  rerunning: boolean;
  canRerun: boolean;
}) {
  return (
    <SlideFrame
      title={slide.title}
      why="Everything worth changing, most important first. Edit your resume, upload the new version, and run the review again to see your progress."
    >
      {slide.fixes.length > 0 ? (
        <ol className="flex flex-col gap-2">
          {slide.fixes.map((fix, i) => (
            <li key={fix.checkId} className="flex items-start gap-2 text-sm">
              <span className="mt-0.5 w-5 shrink-0 text-right text-xs text-muted-foreground">{i + 1}.</span>
              <LabelBadge label={fix.label} className="mt-0.5 shrink-0" />
              <span>{fix.text}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="flex items-center gap-2 text-sm">
          <Check className="h-4 w-4 text-green-600" aria-hidden /> Nothing left to fix.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        {canRerun && (
          <Button onClick={onRerun} disabled={rerunning}>
            {rerunning ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            {rerunning ? "Reviewing… about a minute" : "Run the review again"}
          </Button>
        )}
        <Link href={GUIDE_PATH} className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          How we review resumes
        </Link>
      </div>
    </SlideFrame>
  );
}
