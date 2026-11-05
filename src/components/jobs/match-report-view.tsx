"use client";

import type { ReactNode } from "react";
import { AlertTriangle, ArrowRight, Check, Info, X } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { MatchReport, Requirement, SearchWord } from "@/lib/match-report/schema";

const OVERALL = {
  strong: { label: "Strong match", className: "bg-green-500/15 text-green-700 dark:text-green-400" },
  partial: { label: "Partial match", className: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400" },
  weak: { label: "Weak match", className: "bg-red-500/15 text-red-700 dark:text-red-400" },
} as const;

const MATCH: Record<Requirement["match"], { label: string; className: string }> = {
  strong: { label: "Strong", className: "bg-green-500/15 text-green-700 dark:text-green-400" },
  partial: { label: "Partial", className: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400" },
  missing: { label: "Missing", className: "bg-red-500/15 text-red-700 dark:text-red-400" },
};

const SEARCH_WORD: Record<SearchWord["status"], { label: string; className: string }> = {
  found: { label: "Found", className: "bg-green-500/15 text-green-700 dark:text-green-400" },
  similar: { label: "Similar wording", className: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400" },
  not_found: { label: "Not found", className: "bg-red-500/15 text-red-700 dark:text-red-400" },
};

const SIMILARITY: Record<NonNullable<SearchWord["similarity"]>, string> = {
  same_meaning: "Same thing, different wording",
  related: "Related, but not the same",
};

function StatusBadge({ label, className }: { label: string; className: string }) {
  return (
    <Badge variant="outline" className={cn("border-none", className)}>
      {label}
    </Badge>
  );
}

function Section({
  title,
  why,
  children,
}: {
  title: string;
  why: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="text-xs text-muted-foreground">{why}</p>
      </div>
      {children}
    </section>
  );
}

function YourMatch({ overall }: { overall: MatchReport["overall"] }) {
  const style = OVERALL[overall.label];
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <h2 className="sr-only">Your match</h2>
        <span
          className={cn(
            "w-fit rounded-full px-3 py-1 text-base font-semibold",
            style.className,
          )}
        >
          {style.label}
        </span>
        <p className="text-sm">{overall.reason}</p>
        <p className="text-xs text-muted-foreground">
          Based on how well your resume covers the posting&apos;s must-have requirements, the
          first thing a recruiter checks.
        </p>
      </div>
      {overall.topFixes.length > 0 && (
        <div>
          <h3 className="text-sm font-medium">Top things to fix</h3>
          <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm">
            {overall.topFixes.map((fix, i) => (
              <li key={i}>{fix}</li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}

function MissingNote() {
  return (
    <p className="flex items-start gap-1.5 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
      <Info className="mt-px h-3.5 w-3.5 shrink-0" />
      <span>
        <strong className="font-medium text-foreground">Missing</strong>{" "}
        means it isn&apos;t on your resume, not that you don&apos;t have it. If you have the
        skill, add it.
      </span>
    </p>
  );
}

function ScreenOutWarning({ screeners }: { screeners: MatchReport["screeners"] }) {
  if (screeners.length === 0) return null;
  const anyNotShown = screeners.some((s) => !s.shown);

  return (
    <Alert
      className={cn(
        anyNotShown &&
          "border-amber-500/50 bg-amber-500/10 text-amber-900 dark:text-amber-200 [&>svg]:text-amber-600 dark:[&>svg]:text-amber-400",
      )}
    >
      <AlertTriangle />
      <AlertTitle>Could screen you out</AlertTitle>
      <AlertDescription className={cn(anyNotShown && "text-amber-900/80 dark:text-amber-200/80")}>
        <p>
          Employers often check these with yes/no questions when you apply. If your resume
          doesn&apos;t show them, you may be filtered out before anyone reads it.
        </p>
        <ul className="mt-2 flex w-full flex-col gap-1.5">
          {screeners.map((s, i) => (
            <li key={i} className="flex items-start justify-between gap-3">
              <span className="text-foreground">{s.item}</span>
              <span
                className={cn(
                  "inline-flex shrink-0 items-center gap-1 text-xs font-medium",
                  s.shown
                    ? "text-green-700 dark:text-green-400"
                    : "text-red-700 dark:text-red-400",
                )}
              >
                {s.shown ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                {s.shown ? "Shown" : "Not shown"}
              </span>
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}

function RequirementsChecklist({ requirements }: { requirements: Requirement[] }) {
  return (
    <Section
      title="Requirements checklist"
      why="Recruiters and screening software compare your resume to each requirement in the posting. Must-haves count the most."
    >
      <ul className="divide-y rounded-lg border">
        {requirements.map((r, i) => (
          <li key={i} className="flex flex-col gap-1.5 p-3">
            <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
              <span className="text-sm font-medium">{r.text}</span>
              <div className="flex shrink-0 gap-1.5">
                <StatusBadge
                  label={r.importance === "must_have" ? "Must-have" : "Nice-to-have"}
                  className={
                    r.importance === "must_have"
                      ? "bg-foreground/10 text-foreground"
                      : "bg-muted text-muted-foreground"
                  }
                />
                <StatusBadge {...MATCH[r.match]} />
              </div>
            </div>
            {r.evidence ? (
              <blockquote className="border-l-2 pl-2 text-xs italic text-muted-foreground">
                &ldquo;{r.evidence}&rdquo;
              </blockquote>
            ) : (
              <p className="text-xs text-muted-foreground">Not on your resume</p>
            )}
            {r.action && r.match !== "strong" && (
              <p className="flex items-start gap-1 text-xs">
                <ArrowRight className="mt-px h-3 w-3 shrink-0" />
                {r.action}
              </p>
            )}
          </li>
        ))}
      </ul>
    </Section>
  );
}

function SearchWords({ words }: { words: SearchWord[] }) {
  return (
    <Section
      title="Search words"
      why="Recruiters search their applicant system for specific words. Using the posting's exact wording makes your resume easier to find."
    >
      <ul className="divide-y rounded-lg border">
        {words.map((w, i) => (
          <li key={i} className="flex flex-col gap-2 p-3">
            <div className="flex items-start justify-between gap-3">
              <span className="text-sm font-medium">{w.term}</span>
              <StatusBadge {...SEARCH_WORD[w.status]} />
            </div>
            {w.status === "similar" && w.resumeWording && (
              <div className="flex flex-col gap-1.5">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-md bg-muted px-2 py-1.5">
                    <div className="text-muted-foreground">Job posting</div>
                    <div className="font-medium break-words">{w.term}</div>
                  </div>
                  <div className="rounded-md bg-muted px-2 py-1.5">
                    <div className="text-muted-foreground">Your resume</div>
                    <div className="font-medium break-words">{w.resumeWording}</div>
                  </div>
                </div>
                {w.similarity && (
                  <p className="text-xs text-muted-foreground">{SIMILARITY[w.similarity]}</p>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </Section>
  );
}

export function MatchReportView({ report }: { report: MatchReport }) {
  return (
    <div className="flex flex-col gap-6">
      <YourMatch overall={report.overall} />

      <ScreenOutWarning screeners={report.screeners} />

      <MissingNote />

      <RequirementsChecklist requirements={report.requirements} />

      <SearchWords words={report.searchWords} />

      <Section
        title="First impression"
        why="Recruiters often skim a resume for about 10 seconds before deciding whether to read on."
      >
        <p className="text-sm">{report.firstImpression}</p>
      </Section>

      {report.nextSteps.length > 0 && (
        <Section
          title="What to do next"
          why="The changes most likely to improve your match, in order. Only add things that are true."
        >
          <ol className="list-decimal space-y-2 pl-5 text-sm">
            {report.nextSteps.map((step, i) => (
              <li key={i}>
                {step.text}
                <div className="text-xs text-muted-foreground">{step.relatesTo}</div>
              </li>
            ))}
          </ol>
        </Section>
      )}
    </div>
  );
}
