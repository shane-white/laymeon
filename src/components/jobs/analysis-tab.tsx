"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Link from "next/link";
import { MatchReportView } from "@/components/jobs/match-report-view";
import type { MatchReport } from "@/lib/match-report/schema";

interface AnalysisTabProps {
  content: string | null;
  /** Structured match report; shown instead of `content` when present. */
  report?: MatchReport | null;
  /** Shown above older markdown `content`, prompting the user to re-run the analysis. */
  legacyNotice?: string;
  onAnalyze: () => void;
  isPending: boolean;
  hasResume: boolean;
  analyzeLabel: string;
  reanalyzeLabel: string;
  description: string;
}

export function AnalysisTab({
  content,
  report,
  legacyNotice,
  onAnalyze,
  isPending,
  hasResume,
  analyzeLabel,
  reanalyzeLabel,
  description,
}: AnalysisTabProps) {
  if (isPending) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin" />
        <p className="text-sm">Analyzing...</p>
      </div>
    );
  }

  if (!content && !report) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 px-6">
        <p className="text-center text-sm text-muted-foreground">
          {description}
        </p>
        <Button onClick={onAnalyze} disabled={!hasResume}>
          {analyzeLabel}
        </Button>
        {!hasResume && (
          <p className="text-center text-xs text-muted-foreground">
            <Link href="/documents" className="underline hover:text-foreground">
              Upload a resume
            </Link>{" "}
            to get analysis results.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <ScrollArea className="h-0 flex-1">
        {report ? (
          <div className="px-4 py-4 sm:px-6">
            <MatchReportView report={report} />
          </div>
        ) : (
          <>
            {legacyNotice && (
              <div className="mx-4 mt-4 flex flex-col gap-2 rounded-md border border-dashed px-3 py-2 text-sm sm:mx-6 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-muted-foreground">{legacyNotice}</span>
                <Button size="sm" onClick={onAnalyze} disabled={!hasResume} className="shrink-0">
                  {reanalyzeLabel}
                </Button>
              </div>
            )}
            <div className="prose prose-sm dark:prose-invert max-w-none px-6 py-4">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{content ?? ""}</ReactMarkdown>
            </div>
          </>
        )}
      </ScrollArea>
      <div className="border-t px-6 py-3">
        <Button variant="outline" size="sm" onClick={onAnalyze} disabled={!hasResume}>
          {reanalyzeLabel}
        </Button>
      </div>
    </div>
  );
}
