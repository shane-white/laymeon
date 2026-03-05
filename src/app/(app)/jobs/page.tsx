"use client";

import { useSearchParams, useRouter } from "next/navigation";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { JobListSidebar } from "@/components/jobs/job-list-sidebar";
import { JobDetail } from "@/components/jobs/job-detail";
import { JobChat } from "@/components/jobs/job-chat";
import { useJobs } from "@/hooks/use-jobs";

export default function JobsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const selectedJobId = searchParams.get("id");

  const { data: jobs } = useJobs();

  const selectedJob =
    jobs?.find((j) => j.job_listing.id === selectedJobId) ?? null;

  function handleSelectJob(jobListingId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("id", jobListingId);
    router.push(`/jobs?${params.toString()}`);
  }

  return (
    <ResizablePanelGroup orientation="horizontal">
      <ResizablePanel defaultSize="20%" minSize="15%" maxSize="35%">
        <JobListSidebar
          selectedJobId={selectedJobId}
          onSelectJob={handleSelectJob}
        />
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize="55%">
        <JobDetail job={selectedJob} />
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize="25%" minSize="15%" maxSize="35%">
        <JobChat job={selectedJob} />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
