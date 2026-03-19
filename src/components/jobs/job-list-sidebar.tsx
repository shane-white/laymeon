"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { AddJobDialog } from "@/components/jobs/add-job-dialog";
import { JobListItem } from "@/components/jobs/job-list-item";
import { useJobs } from "@/hooks/use-jobs";
import { Briefcase } from "lucide-react";

interface JobListSidebarProps {
  selectedJobId: string | null;
  onSelectJob: (id: string) => void;
}

export function JobListSidebar({
  selectedJobId,
  onSelectJob,
}: JobListSidebarProps) {
  const { data: jobs, isLoading } = useJobs();

  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b px-3 py-3">
        <h2 className="text-sm font-semibold">Jobs</h2>
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
          {jobs?.map((job) => (
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
