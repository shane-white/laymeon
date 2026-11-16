"use client";

import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { AlertTriangle, ChevronLeft, ChevronRight, ClipboardCheck, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Carousel, CarouselContent, CarouselItem, type CarouselApi } from "@/components/ui/carousel";
import { Skeleton } from "@/components/ui/skeleton";
import { useDeleteResumeReview, useResumeReview, useRunResumeReview } from "@/hooks/use-resume-reviews";
import { buildSlides, slideGroups, type Slide } from "@/lib/resume-review/slides";
import { OverallBadge } from "./labels";
import { NextStepsSlide, OverviewSlide, RewritesSlide, SectionSlide, SoftwareSlide } from "./slides";

interface ResumeReviewDeckProps {
  resumeDocumentId: string;
  /** The resume's parsed text, for the "What software reads" slide. Null if it was deleted. */
  resumeText: string | null;
  /** Called after the review is deleted. */
  onDeleted?: () => void;
}

/** A bar split by section. Each section fills as you reach it, and clicking one jumps to it. */
function ReviewProgress({
  slides,
  current,
  onJump,
}: {
  slides: Slide[];
  current: number;
  onJump: (index: number) => void;
}) {
  const groups = slideGroups(slides);
  const active = groups.find((g) => current >= g.first && current < g.first + g.count);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-1" role="group" aria-label="Sections">
        {groups.map((g) => {
          const filled = Math.min(Math.max(current - g.first + 1, 0), g.count) / g.count;
          return (
            <button
              key={g.group}
              type="button"
              onClick={() => onJump(g.first)}
              title={g.title}
              aria-label={`Go to ${g.title}`}
              aria-current={g === active ? "step" : undefined}
              className="group relative h-2 overflow-hidden rounded-full bg-muted"
              style={{ flexGrow: g.count, flexBasis: 0 }}
            >
              <span
                className="absolute inset-y-0 left-0 rounded-full bg-primary transition-[width] group-hover:opacity-80"
                style={{ width: `${filled * 100}%` }}
              />
            </button>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        Slide {current + 1} of {slides.length}
        {active ? ` · ${active.title}` : ""}
      </p>
    </div>
  );
}

export function ResumeReviewDeck({ resumeDocumentId, resumeText, onDeleted }: ResumeReviewDeckProps) {
  const { data: stored, isLoading, error } = useResumeReview(resumeDocumentId);
  const run = useRunResumeReview();
  const remove = useDeleteResumeReview();
  const [api, setApi] = useState<CarouselApi>();
  const [current, setCurrent] = useState(0);

  const review = stored?.review ?? null;
  const slides = useMemo(() => (review ? buildSlides(review) : []), [review]);

  useEffect(() => {
    if (!api) return;
    const onSelect = () => setCurrent(api.selectedScrollSnap());
    onSelect();
    api.on("select", onSelect).on("reInit", onSelect);
    return () => {
      api.off("select", onSelect).off("reInit", onSelect);
    };
  }, [api]);

  function rerun() {
    run.mutate(resumeDocumentId, {
      onSuccess: () => {
        api?.scrollTo(0, true);
        toast.success("Review updated");
      },
      onError: (err) => toast.error(err.message),
    });
  }

  function deleteReport() {
    remove.mutate(resumeDocumentId, {
      onSuccess: () => {
        toast.success("Report deleted");
        onDeleted?.();
      },
      onError: (err) => toast.error(err.message),
    });
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 p-6">
        <Skeleton className="h-7 w-1/2" />
        <Skeleton className="h-2 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (error || !stored) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-muted-foreground">
        <ClipboardCheck className="h-10 w-10" aria-hidden />
        <p className="text-sm">{error ? error.message : "This resume hasn't been reviewed yet."}</p>
        {!error && (
          <Button onClick={rerun} disabled={run.isPending}>
            {run.isPending ? <Loader2 className="animate-spin" /> : <ClipboardCheck />}
            {run.isPending ? "Reviewing… about a minute" : "Review this resume"}
          </Button>
        )}
      </div>
    );
  }

  const canRerun = !stored.resumeDeleted;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex flex-col gap-3 border-b px-6 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="truncate text-lg font-semibold">Report: {stored.resumeName}</h1>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {stored.review && <OverallBadge label={stored.review.overall.label} />}
              <span>Reviewed {format(new Date(stored.updatedAt), "MMM d, yyyy")}</span>
            </div>
          </div>
          {canRerun && (
            <Button variant="outline" size="sm" onClick={rerun} disabled={run.isPending} className="shrink-0">
              {run.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              {run.isPending ? "Reviewing…" : "Re-run"}
            </Button>
          )}
        </div>

        {stored.resumeDeleted ? (
          <Alert>
            <AlertTriangle />
            <AlertTitle>The resume this report was based on was deleted</AlertTitle>
            <AlertDescription className="flex flex-col items-start gap-2">
              <span>You can still read it, but it can&apos;t be run again.</span>
              <Button variant="outline" size="sm" onClick={deleteReport} disabled={remove.isPending}>
                {remove.isPending ? <Loader2 className="animate-spin" /> : <Trash2 />}
                Delete report
              </Button>
            </AlertDescription>
          </Alert>
        ) : stored.outOfDate ? (
          <Alert>
            <AlertTriangle />
            <AlertTitle>This report is out of date</AlertTitle>
            <AlertDescription className="flex flex-col items-start gap-2">
              <span>{stored.resumeName} has changed since it was reviewed.</span>
              <Button variant="outline" size="sm" onClick={rerun} disabled={run.isPending}>
                {run.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                Run the review again
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}

        {slides.length > 0 && (
          <ReviewProgress slides={slides} current={current} onJump={(i) => api?.scrollTo(i)} />
        )}
      </header>

      {slides.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
          This report was made with an older version of the review. Run it again to see it.
        </div>
      ) : (
        <>
          <Carousel
            setApi={setApi}
            opts={{ align: "start", watchDrag: true }}
            className="min-h-0 flex-1 outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            tabIndex={0}
            aria-label="Resume review slides. Use the left and right arrow keys to move between slides."
          >
            <CarouselContent viewportClassName="h-full" className="h-full">
              {slides.map((slide, index) => (
                <CarouselItem
                  key={slide.key}
                  aria-label={`${index + 1} of ${slides.length}: ${slide.title}`}
                  aria-hidden={index !== current}
                  inert={index !== current}
                  className="h-full"
                >
                  <div className="h-full overflow-y-auto px-6 py-5">
                    {slide.kind === "overview" && <OverviewSlide slide={slide} />}
                    {slide.kind === "section" && <SectionSlide slide={slide} />}
                    {slide.kind === "software" && <SoftwareSlide slide={slide} resumeText={resumeText} />}
                    {slide.kind === "rewrites" && <RewritesSlide slide={slide} />}
                    {slide.kind === "next" && (
                      <NextStepsSlide slide={slide} onRerun={rerun} rerunning={run.isPending} canRerun={canRerun} />
                    )}
                  </div>
                </CarouselItem>
              ))}
            </CarouselContent>
          </Carousel>

          <footer className="flex items-center justify-between gap-2 border-t px-6 py-3">
            <Button variant="outline" size="sm" onClick={() => api?.scrollPrev()} disabled={current === 0}>
              <ChevronLeft /> Back
            </Button>
            <span className="text-xs text-muted-foreground">
              {current + 1} / {slides.length}
            </span>
            <Button size="sm" onClick={() => api?.scrollNext()} disabled={current === slides.length - 1}>
              Next <ChevronRight />
            </Button>
          </footer>
          {/* Announces each slide to screen readers as it changes. */}
          <p className="sr-only" aria-live="polite">
            {`Slide ${current + 1} of ${slides.length}: ${slides[current]?.title ?? ""}`}
          </p>
        </>
      )}
    </div>
  );
}
