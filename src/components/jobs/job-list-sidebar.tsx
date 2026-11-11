"use client";

import { useMemo } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { AddJobDialog } from "@/components/jobs/add-job-dialog";
import {
  JobListItem,
  type JobSearchHighlight,
} from "@/components/jobs/job-list-item";
import { JobSearchInput } from "@/components/jobs/job-search-input";
import { JobStatusFilter } from "@/components/jobs/job-status-filter";
import { SortableJobList } from "@/components/jobs/sortable-job-list";
import { useJobs, type UserJob } from "@/hooks/use-jobs";
import {
  useHydrateJobListView,
  useJobListView,
} from "@/hooks/use-job-list-view";
import { displayCompany, displayTitle } from "@/lib/jobs/display";
import { JOB_STATUSES } from "@/lib/jobs/statuses";
import { countByStatus, matchesStatusFilter } from "@/lib/jobs/status-filter";
import {
  findMatch,
  foldQuery,
  foldText,
  type FoldedText,
} from "@/lib/jobs/search";
import { Briefcase, ListFilter, SearchX } from "lucide-react";

interface JobListSidebarProps {
  selectedJobId: string | null;
  onSelectJob: (id: string) => void;
}

interface FoldedJob {
  title: FoldedText;
  company: FoldedText | null;
}

export function JobListSidebar({
  selectedJobId,
  onSelectJob,
}: JobListSidebarProps) {
  const { data: jobs, isLoading } = useJobs();
  useHydrateJobListView();
  const statusFilter = useJobListView((s) => s.statusFilter);
  const setStatusFilter = useJobListView((s) => s.setStatusFilter);
  const search = useJobListView((s) => s.search);
  const setSearch = useJobListView((s) => s.setSearch);

  const counts = useMemo(() => countByStatus(jobs ?? []), [jobs]);

  // Fold each job's shown title and company once, not on every keystroke.
  const foldedJobs = useMemo(() => {
    const map = new Map<string, FoldedJob>();
    for (const job of jobs ?? []) {
      const company = displayCompany(job);
      map.set(job.id, {
        title: foldText(displayTitle(job)),
        company: company ? foldText(company) : null,
      });
    }
    return map;
  }, [jobs]);

  const query = foldQuery(search);
  const isSearching = query.length > 0;

  const { visibleJobs, hiddenMatches } = useMemo(() => {
    const visible: UserJob[] = [];
    const hidden: UserJob[] = [];
    for (const job of jobs ?? []) {
      if (isSearching) {
        const folded = foldedJobs.get(job.id)!;
        const matches =
          findMatch(folded.title, query) !== null ||
          (folded.company !== null &&
            findMatch(folded.company, query) !== null);
        if (!matches) continue;
      }
      if (matchesStatusFilter(job.status, statusFilter)) visible.push(job);
      else if (isSearching) hidden.push(job);
    }
    return { visibleJobs: visible, hiddenMatches: hidden };
  }, [jobs, foldedJobs, query, isSearching, statusFilter]);

  const hasJobs = !!jobs && jobs.length > 0;
  // Search results are temporary, so drop positions would be unclear.
  const dragEnabled = !isSearching;

  function highlightFor(job: UserJob): JobSearchHighlight | undefined {
    if (!isSearching) return undefined;
    const folded = foldedJobs.get(job.id)!;
    return { query, ...folded };
  }

  function renderPlain(job: UserJob, dimmed = false) {
    return (
      <JobListItem
        key={job.id}
        job={job}
        isSelected={selectedJobId === job.job_listing.id}
        onSelect={onSelectJob}
        highlight={highlightFor(job)}
        dimmed={dimmed}
      />
    );
  }

  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden">
      <div className="flex items-center gap-1 border-b px-3 py-3">
        <h2 className="text-sm font-semibold">Jobs</h2>
        <JobStatusFilter counts={counts} />
      </div>
      <div className="flex flex-col gap-2 px-3 py-2">
        {hasJobs && <JobSearchInput />}
        <AddJobDialog />
      </div>
      <ScrollArea className="min-h-0 [&>div>div[style]]:block!">
        <div className="flex flex-col gap-0.5 px-2 pb-2">
          {isLoading &&
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex flex-col gap-1.5 px-3 py-2.5">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            ))}
          {!isLoading && jobs?.length === 0 && (
            <div className="flex flex-col items-center gap-2 px-3 py-8 text-center text-muted-foreground">
              <Briefcase className="h-8 w-8" />
              <p className="text-sm">No jobs yet</p>
              <p className="text-xs">Add a job listing to get started.</p>
            </div>
          )}
          {hasJobs &&
            isSearching &&
            visibleJobs.length === 0 &&
            hiddenMatches.length === 0 && (
              <div className="flex flex-col items-center gap-2 px-3 py-8 text-center text-muted-foreground">
                <SearchX className="h-8 w-8" />
                <p className="break-words text-sm">
                  No jobs match &ldquo;{search.trim()}&rdquo;
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSearch("")}
                >
                  Clear search
                </Button>
              </div>
            )}
          {hasJobs && !isSearching && visibleJobs.length === 0 && (
            <div className="flex flex-col items-center gap-2 px-3 py-8 text-center text-muted-foreground">
              <ListFilter className="h-8 w-8" />
              <p className="text-sm">No jobs match this filter</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setStatusFilter(JOB_STATUSES.map((s) => s.value))
                }
              >
                Show all
              </Button>
            </div>
          )}
          {dragEnabled ? (
            <SortableJobList
              jobs={visibleJobs}
              renderItem={(job, drag) => (
                <JobListItem
                  job={job}
                  isSelected={selectedJobId === job.job_listing.id}
                  onSelect={onSelectJob}
                  dragHandle={drag.handle}
                  isDragging={drag.isDragging}
                />
              )}
            />
          ) : (
            visibleJobs.map((job) => renderPlain(job))
          )}
          {hiddenMatches.length > 0 && (
            <>
              <div
                role="separator"
                className="flex items-center gap-2 px-3 pt-3 pb-1 text-xs text-muted-foreground"
              >
                <span className="h-px flex-1 bg-border" />
                <span>{hiddenMatches.length} more in hidden statuses</span>
                <span className="h-px flex-1 bg-border" />
              </div>
              {hiddenMatches.map((job) => renderPlain(job, true))}
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
