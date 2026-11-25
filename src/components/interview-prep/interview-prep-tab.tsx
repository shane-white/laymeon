"use client";

import { useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { AlertTriangle, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { UserJob } from "@/hooks/use-jobs";
import {
  SECTION_KEYS,
  type InterviewPrep,
  type Section,
  type SectionData,
  type SectionKey,
} from "@/lib/interview-prep/interview-prep";
import { initialSection } from "@/lib/interview-prep/sections";
import { CompanyView, PracticeView, ProcessView } from "./section-views";
import { useInterviewPrep, usePrepareSection } from "./use-interview-prep";

const SECTION_NAMES: Record<SectionKey, string> = {
  process: "Process",
  company: "Company",
  practice: "Practice",
};

function sectionTitle(key: SectionKey, company: string): string {
  if (key === "process") return `How ${company} interviews`;
  if (key === "company") return `About ${company}`;
  return "Practice";
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full flex-col items-center justify-center gap-4 px-6 py-10 text-center">{children}</div>;
}

/** The older Interview Suggestions, read-only, until an Interview Prep has a result. */
function LegacySuggestions({ text, onPrepare }: { text: string; onPrepare?: () => void }) {
  return (
    <div className="flex flex-col">
      <div className="mx-4 mt-4 flex flex-col gap-2 rounded-md border border-dashed px-3 py-2 text-sm sm:mx-6 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-muted-foreground">These are older suggestions. Prepare to get the new Interview Prep.</span>
        {onPrepare && (
          <Button size="sm" onClick={onPrepare} className="shrink-0">
            Prepare
          </Button>
        )}
      </div>
      <div className="prose prose-sm dark:prose-invert max-w-none px-6 py-4">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
      </div>
    </div>
  );
}

function StartState({ company, onPrepare }: { company: string; onPrepare: () => void }) {
  return (
    <Centered>
      <p className="max-w-md text-sm text-muted-foreground">
        Interview Prep looks up how {company} interviews, briefs you on the company, and builds practice questions with
        hints from your Career Story. Nothing is scored.
      </p>
      <Button onClick={onPrepare}>Prepare</Button>
    </Centered>
  );
}

/** The section's date and its Refresh button, or "Researching…" while it's working. */
function SectionHeader({
  title,
  section,
  onRefresh,
}: {
  title: string;
  section: Section<unknown>;
  onRefresh: () => void;
}) {
  const researching = section.status === "researching";
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
      <h3 className="font-medium">{title}</h3>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {researching ? (
          <span className="inline-flex items-center gap-1.5">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Researching…
          </span>
        ) : (
          <>
            {section.researchedAt && <span>Researched {format(new Date(section.researchedAt), "MMMM d, yyyy")}</span>}
            <Button size="xs" variant="ghost" onClick={onRefresh}>
              <RotateCcw /> Refresh
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function Failure({ section, onRetry }: { section: Section<unknown>; onRetry: () => void }) {
  const failure = section.failure;
  if (!failure) return null;
  if (failure.reason === "no_career_story") {
    return (
      <Centered>
        <p className="max-w-md text-sm text-muted-foreground">
          Practice builds its hints from your Career Story, so it needs one. Add your Documents to build it, then
          refresh Practice.
        </p>
        <Button asChild variant="outline">
          <Link href="/profile">Go to your Career Story</Link>
        </Button>
      </Centered>
    );
  }
  const message = failure.reason === "not_implemented" ? "This section isn't available yet." : failure.message;
  // With an earlier result still showing, the failure is a note above it.
  if (section.data) {
    return (
      <p className="mb-4 flex items-center gap-2 text-xs text-muted-foreground">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> Couldn&rsquo;t refresh: {message}
      </p>
    );
  }
  return (
    <Centered>
      <p className="max-w-md text-sm text-muted-foreground">{message}</p>
      {failure.reason !== "not_implemented" && (
        <Button variant="outline" onClick={onRetry}>
          <RotateCcw /> Try again
        </Button>
      )}
    </Centered>
  );
}

function SectionContent<K extends SectionKey>({ sectionKey, data }: { sectionKey: K; data: SectionData[K] }) {
  if (sectionKey === "process") return <ProcessView data={data as SectionData["process"]} />;
  if (sectionKey === "company") return <CompanyView data={data as SectionData["company"]} />;
  return <PracticeView data={data as SectionData["practice"]} />;
}

function SectionPanel({
  sectionKey,
  section,
  company,
  onRefresh,
}: {
  sectionKey: SectionKey;
  section: Section<SectionData[SectionKey]>;
  company: string;
  onRefresh: () => void;
}) {
  if (section.status === "not_started") {
    return (
      <Centered>
        <p className="text-sm text-muted-foreground">This section hasn&rsquo;t been prepared yet.</p>
        <Button onClick={onRefresh}>Prepare</Button>
      </Centered>
    );
  }
  if (section.status === "researching" && !section.data) {
    return (
      <Centered>
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Researching…</p>
      </Centered>
    );
  }
  if (section.status === "failed" && !section.data) return <Failure section={section} onRetry={onRefresh} />;

  return (
    <div className="px-6 py-4">
      <SectionHeader title={sectionTitle(sectionKey, company)} section={section} onRefresh={onRefresh} />
      {section.status === "failed" && <Failure section={section} onRetry={onRefresh} />}
      {section.data && <SectionContent sectionKey={sectionKey} data={section.data} />}
    </div>
  );
}

function Switcher({
  prep,
  active,
  onSelect,
}: {
  prep: InterviewPrep;
  active: SectionKey;
  onSelect: (key: SectionKey) => void;
}) {
  return (
    <div className="flex items-center gap-1 border-b px-6 py-2">
      {SECTION_KEYS.map((key) => (
        <Button key={key} size="sm" variant={active === key ? "secondary" : "ghost"} onClick={() => onSelect(key)}>
          {SECTION_NAMES[key]}
          {prep.sections[key].status === "researching" && (
            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" aria-label="Researching" />
          )}
        </Button>
      ))}
    </div>
  );
}

export function InterviewPrepTab({ job }: { job: UserJob }) {
  const { data, isPending, error } = useInterviewPrep(job.id);
  const { refresh, prepareAll } = usePrepareSection(job.id);
  const company = job.custom_job_company || job.job_listing.extracted_company_name || "the company";

  if (isPending) {
    return (
      <div className="flex flex-col gap-3 px-6 py-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }
  if (error) {
    return (
      <Centered>
        <p className="text-sm text-muted-foreground">{error.message}</p>
      </Centered>
    );
  }

  const { prep, legacySuggestions } = data;
  if (!prep) {
    return (
      <div className="h-0 flex-1 overflow-auto">
        {legacySuggestions ? (
          <LegacySuggestions text={legacySuggestions} onPrepare={prepareAll} />
        ) : (
          <StartState company={company} onPrepare={prepareAll} />
        )}
      </div>
    );
  }

  return <PreparedView prep={prep} legacySuggestions={legacySuggestions} company={company} onRefresh={refresh} />;
}

/** Mounted once the Job has an Interview Prep, so it opens on one section and stays there until the user switches. */
function PreparedView({
  prep,
  legacySuggestions,
  company,
  onRefresh,
}: {
  prep: InterviewPrep;
  legacySuggestions: string | null;
  company: string;
  onRefresh: (key: SectionKey) => void;
}) {
  const [active, setActive] = useState<SectionKey>(() => initialSection(prep));
  const section = prep.sections[active];
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Switcher prep={prep} active={active} onSelect={setActive} />
      <div className="h-0 flex-1 overflow-auto">
        <SectionPanel sectionKey={active} section={section} company={company} onRefresh={() => onRefresh(active)} />
        {/* Kept until a section is ready, so a Prepare that fails doesn't hide them. */}
        {legacySuggestions && !section.data && <LegacySuggestions text={legacySuggestions} />}
      </div>
    </div>
  );
}
