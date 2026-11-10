"use client";

import { useMemo } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { AddJobDialog } from "@/components/jobs/add-job-dialog";
import { JobListItem } from "@/components/jobs/job-list-item";
import { JobStatusFilter } from "@/components/jobs/job-status-filter";
import { useJobs } from "@/hooks/use-jobs";
import {
  useHydrateJobListView,
  useJobListView,
} from "@/hooks/use-job-list-view";
import { JOB_STATUSES } from "@/lib/jobs/statuses";
import { countByStatus, matchesStatusFilter } from "@/lib/jobs/status-filter";
import { Briefcase, ListFilter } from "lucide-react";

interface JobListSidebarProps {
  selectedJobId: string | null;
  onSelectJob: (id: string) => void;
}

export function JobListSidebar({
  selectedJobId,
  onSelectJob,
}: JobListSidebarProps) {
  const { data: jobs, isLoading } = useJobs();
  useHydrateJobListView();
  const statusFilter = useJobListView((s) => s.statusFilter);
  const setStatusFilter = useJobListView((s) => s.setStatusFilter);

  const counts = useMemo(() => countByStatus(jobs ?? []), [jobs]);
  const visibleJobs = useMemo(
    () => (jobs ?? []).filter((j) => matchesStatusFilter(j.status, statusFilter)),
    [jobs, statusFilter],
  );

  const hasJobs = !!jobs && jobs.length > 0;

  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden">
      <div className="flex items-center gap-1 border-b px-3 py-3">
        <h2 className="text-sm font-semibold">Jobs</h2>
        <JobStatusFilter counts={counts} />
      </div>
      <div className="px-3 py-2">
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
          {hasJobs && visibleJobs.length === 0 && (
            <div className="flex flex-col items-center gap-2 px-3 py-8 text-center text-muted-foreground">
              <ListFilter className="h-8 w-8" />
              <p className="text-sm">No jobs match this filter</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setStatusFilter(JOB_STATUSES.map((s) => s.value))}
              >
                Show all
              </Button>
            </div>
          )}
          {visibleJobs.map((job) => (
            <JobListItem
              key={job.id}
              job={job}
              isSelected={selectedJobId === job.job_listing.id}
              onSelect={onSelectJob}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
