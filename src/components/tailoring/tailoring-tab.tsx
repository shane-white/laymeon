"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { UserJob } from "@/hooks/use-jobs";
import type { StartBlocker } from "@/lib/tailoring/tailoring";
import { ExampleWorkPrompt } from "./example-work-prompt";
import { TailoringOutputs } from "./tailoring-outputs";
import { TailoringView } from "./tailoring-view";
import {
  tailoringKey,
  useDecide,
  usePendingStart,
  useStartTailoring,
  useTailoring,
  type StartVariables,
} from "./use-tailoring";

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">{children}</div>;
}

function Preparing({ runMatchReport }: { runMatchReport: boolean }) {
  return (
    <Centered>
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">
          {runMatchReport ? "Running the Match Report, then preparing your Tailoring…" : "Preparing your Tailoring…"}
        </p>
        <p className="text-xs text-muted-foreground">
          {runMatchReport
            ? "This takes a few minutes. You can keep using LayMeOn meanwhile."
            : "Structuring your Resume and writing Suggestions. This takes a minute or two."}
        </p>
      </div>
    </Centered>
  );
}

/** What starting needs first, and the button that does it. */
function StartState({ blocker, onStart }: { blocker: StartBlocker | null; onStart: (v: StartVariables) => void }) {
  if (blocker === "no_resume") {
    return (
      <Centered>
        <p className="text-sm text-muted-foreground">Tailoring revises this Job&rsquo;s Resume, so it needs one.</p>
        <Button asChild>
          <Link href="/documents">Upload a resume</Link>
        </Button>
      </Centered>
    );
  }
  if (blocker === "no_match_report") {
    return (
      <Centered>
        <p className="max-w-md text-sm text-muted-foreground">
          Tailoring works through the Requirements your Match Report found missing or partial. Run one first, and
          Tailoring starts as soon as it&rsquo;s done.
        </p>
        <Button onClick={() => onStart({ runMatchReport: true, startOver: false })}>Run Match Report and tailor</Button>
      </Centered>
    );
  }
  if (blocker === "match_report_earlier_version") {
    return (
      <Centered>
        <p className="max-w-md text-sm text-muted-foreground">
          The Match Report is for an Earlier version of this Job&rsquo;s Resume. Run it again so you don&rsquo;t tailor
          against gaps that are no longer there.
        </p>
        <Button onClick={() => onStart({ runMatchReport: true, startOver: false })}>
          <RefreshCw /> Run Match Report again and tailor
        </Button>
      </Centered>
    );
  }
  return (
    <Centered>
      <p className="max-w-md text-sm text-muted-foreground">
        Work through your Resume for this Job one Suggestion at a time. Each one comes from your Match Report and your
        Career Story, and you decide what goes on your Resume.
      </p>
      <Button onClick={() => onStart({ runMatchReport: false, startOver: false })}>Start tailoring</Button>
    </Centered>
  );
}

function EarlierVersionNotice({
  blocker,
  onStart,
}: {
  blocker: StartBlocker | null;
  onStart: (v: StartVariables) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const runMatchReport = blocker === "match_report_earlier_version" || blocker === "no_match_report";
  return (
    <div className="border-b px-4 py-3 sm:px-6">
      <Alert>
        <AlertTriangle />
        <AlertTitle>This Tailoring is an Earlier version</AlertTitle>
        <AlertDescription className="flex flex-col items-start gap-2">
          <span>
            The Match Report has been run again or the Resume has changed since it was made. You can keep working on it,
            or start over{runMatchReport ? " after running the Match Report again" : ""}.
          </span>
          {confirming ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs">Starting over drops your decisions.</span>
              <Button size="sm" onClick={() => onStart({ runMatchReport, startOver: true })}>
                Start over
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
            </div>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setConfirming(true)}>
              <RefreshCw /> Start over
            </Button>
          )}
        </AlertDescription>
      </Alert>
    </div>
  );
}

/**
 * The Resume Suggestions tab: the Job's Tailoring, or what's needed to start
 * one. Starting runs the Match Report first when the Job needs one.
 */
export function TailoringTab({ job }: { job: UserJob }) {
  const queryClient = useQueryClient();
  const query = useTailoring(job.id);
  const start = useStartTailoring(job.id);
  const pending = usePendingStart(job.id);
  const decide = useDecide(job.id);

  // The Tailoring follows the Job's Resume and Match Report: reload it when either changes.
  const sources = `${job.resume_document_id}|${job.analysis_documents?.match_analysis?.generated_at}`;
  const lastSources = useRef(sources);
  useEffect(() => {
    if (lastSources.current === sources) return;
    lastSources.current = sources;
    void queryClient.invalidateQueries({ queryKey: tailoringKey(job.id) });
  }, [sources, job.id, queryClient]);

  if (pending) return <Preparing runMatchReport={pending.runMatchReport} />;

  if (query.isPending) {
    return (
      <div className="flex flex-col gap-3 px-6 py-6" aria-busy>
        <Skeleton className="h-6 w-1/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    );
  }

  if (query.isError) {
    return (
      <Centered>
        <p className="text-sm text-muted-foreground">{query.error.message}</p>
        <Button variant="outline" onClick={() => query.refetch()}>
          Try again
        </Button>
      </Centered>
    );
  }

  const { tailoring, earlierVersion, startBlocker, resumeName, company } = query.data;
  const onStart = (variables: StartVariables) => start.mutate(variables);

  if (!tailoring) return <StartState blocker={startBlocker} onStart={onStart} />;

  return (
    <TailoringView
      tailoring={tailoring}
      notice={earlierVersion ? <EarlierVersionNotice blocker={startBlocker} onStart={onStart} /> : null}
      outputs={(props) => <TailoringOutputs tailoring={tailoring} resumeName={resumeName} company={company} {...props} />}
      onDecide={decide}
      gapPrompt={({ item }) => (
        <ExampleWorkPrompt
          key={item.id}
          jobId={job.id}
          itemId={item.id}
          itemText={item.target.text}
          onDone={(state) => queryClient.setQueryData(tailoringKey(job.id), state)}
        />
      )}
    />
  );
}
