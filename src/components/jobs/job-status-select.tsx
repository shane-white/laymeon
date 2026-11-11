"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useUpdateJobStatus } from "@/hooks/use-jobs";
import { useJobListView } from "@/hooks/use-job-list-view";
import {
  JOB_STATUSES,
  isJobStatus,
  statusColors,
  statusLabel,
} from "@/lib/jobs/statuses";
import { matchesStatusFilter } from "@/lib/jobs/status-filter";
import { toast } from "sonner";

interface JobStatusSelectProps {
  userJobId: string;
  currentStatus: string;
}

export function JobStatusSelect({
  userJobId,
  currentStatus,
}: JobStatusSelectProps) {
  const updateStatus = useUpdateJobStatus();

  function handleChange(value: string) {
    if (value === currentStatus) return;
    updateStatus.mutate({ id: userJobId, status: value });

    const { statusFilter, showStatus } = useJobListView.getState();
    if (isJobStatus(value) && !matchesStatusFilter(value, statusFilter)) {
      toast(`Moved to ${statusLabel(value)}. Hidden by your filter.`, {
        action: { label: "Show", onClick: () => showStatus(value) },
      });
    }
  }

  return (
    <Select value={currentStatus} onValueChange={handleChange}>
      <SelectTrigger
        className={`h-6 w-auto gap-1 rounded-full border-none px-2 text-xs ${statusColors[currentStatus] ?? ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {JOB_STATUSES.map((s) => (
          <SelectItem key={s.value} value={s.value}>
            {s.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
