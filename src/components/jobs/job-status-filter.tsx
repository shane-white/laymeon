"use client";

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useJobListView } from "@/hooks/use-job-list-view";
import { JOB_STATUSES, statusDotColors, type JobStatus } from "@/lib/jobs/statuses";
import { isDefaultStatusFilter } from "@/lib/jobs/status-filter";
import { cn } from "@/lib/utils";
import { ListFilter } from "lucide-react";

interface JobStatusFilterProps {
  counts: Record<JobStatus, number>;
}

export function JobStatusFilter({ counts }: JobStatusFilterProps) {
  const statusFilter = useJobListView((s) => s.statusFilter);
  const toggle = useJobListView((s) => s.toggleStatus);
  const reset = useJobListView((s) => s.resetStatusFilter);

  const isDefault = isDefaultStatusFilter(statusFilter);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={
            isDefault
              ? "Filter by status"
              : `Filter by status, ${statusFilter.length} selected`
          }
          className={cn(
            "flex h-7 items-center gap-1 rounded-md px-1.5 text-xs transition-colors",
            isDefault
              ? "text-muted-foreground hover:bg-muted hover:text-foreground"
              : "bg-primary/15 text-primary hover:bg-primary/25",
          )}
        >
          <ListFilter className="h-3.5 w-3.5" />
          {!isDefault && <span className="tabular-nums">{statusFilter.length}</span>}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Show statuses
        </DropdownMenuLabel>
        {JOB_STATUSES.map((s) => {
          const checked = statusFilter.includes(s.value);
          const isLast = checked && statusFilter.length === 1;
          return (
            <DropdownMenuCheckboxItem
              key={s.value}
              checked={checked}
              disabled={isLast}
              // Keep the menu open so several statuses can be toggled in a row.
              onSelect={(e) => e.preventDefault()}
              onCheckedChange={() => toggle(s.value)}
            >
              <span
                aria-hidden
                className={cn("h-2 w-2 rounded-full", statusDotColors[s.value])}
              />
              <span>{s.label}</span>
              <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                {counts[s.value]}
              </span>
            </DropdownMenuCheckboxItem>
          );
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={isDefault} onSelect={() => reset()}>
          Reset
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
