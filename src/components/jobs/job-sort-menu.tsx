"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useJobListView } from "@/hooks/use-job-list-view";
import { DEFAULT_SORT, JOB_SORTS, type JobSort } from "@/lib/jobs/sort-jobs";
import { cn } from "@/lib/utils";
import { ArrowUpDown } from "lucide-react";

export function JobSortMenu() {
  const sort = useJobListView((s) => s.sort);
  const setSort = useJobListView((s) => s.setSort);

  const isDefault = sort === DEFAULT_SORT;
  const label = JOB_SORTS.find((s) => s.value === sort)?.label ?? "Custom";

  return (
    <TooltipProvider delayDuration={300}>
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={`Sort: ${label}`}
                className={cn(
                  "flex h-7 items-center rounded-md px-1.5 text-xs transition-colors",
                  isDefault
                    ? "text-muted-foreground hover:bg-muted hover:text-foreground"
                    : "bg-primary/15 text-primary hover:bg-primary/25",
                )}
              >
                <ArrowUpDown className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {isDefault ? "Sort" : `Sorted by ${label}. Switch to Custom to reorder`}
          </TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="start" className="w-44">
          <DropdownMenuLabel className="text-xs text-muted-foreground">
            Sort by
          </DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={sort}
            onValueChange={(value) => setSort(value as JobSort)}
          >
            {JOB_SORTS.map((s) => (
              <DropdownMenuRadioItem key={s.value} value={s.value}>
                {s.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </TooltipProvider>
  );
}
