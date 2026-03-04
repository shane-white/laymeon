"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useUpdateJobStatus } from "@/hooks/use-jobs";

const statuses = [
  { value: "interested", label: "Interested" },
  { value: "applied", label: "Applied" },
  { value: "interviewing", label: "Interviewing" },
  { value: "closed", label: "Closed" },
] as const;

export const statusColors: Record<string, string> = {
  interested: "bg-green-500/20 text-green-400",
  applied: "bg-yellow-500/20 text-yellow-400",
  interviewing: "bg-blue-500/20 text-blue-400",
  closed: "bg-muted text-muted-foreground",
};

interface JobStatusSelectProps {
  userJobId: string;
  currentStatus: string;
}

export function JobStatusSelect({
  userJobId,
  currentStatus,
}: JobStatusSelectProps) {
  const updateStatus = useUpdateJobStatus();

  return (
    <Select
      value={currentStatus}
      onValueChange={(value) =>
        updateStatus.mutate({ id: userJobId, status: value })
      }
    >
      <SelectTrigger
        className={`h-6 w-auto gap-1 rounded-full border-none px-2 text-xs ${statusColors[currentStatus] ?? ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {statuses.map((s) => (
          <SelectItem key={s.value} value={s.value}>
            {s.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
