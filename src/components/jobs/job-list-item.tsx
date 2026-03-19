"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { JobStatusSelect } from "@/components/jobs/job-status-select";
import { useUpdateJob, useDeleteJob, type UserJob } from "@/hooks/use-jobs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoreHorizontal, Pencil, Building2, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface JobListItemProps {
  job: UserJob;
  isSelected: boolean;
  onSelect: (id: string) => void;
}

export function JobListItem({ job, isSelected, onSelect }: JobListItemProps) {
  const [editField, setEditField] = useState<"title" | "company" | null>(null);
  const [editValue, setEditValue] = useState("");
  const updateJob = useUpdateJob();
  const deleteJob = useDeleteJob();

  const displayTitle =
    job.custom_job_title || job.job_listing.extracted_job_title;
  const displayCompany =
    job.custom_job_company || job.job_listing.extracted_company_name;

  function openEdit(field: "title" | "company") {
    setEditField(field);
    setEditValue(field === "title" ? displayTitle : (displayCompany ?? ""));
  }

  async function handleSaveEdit() {
    if (!editField) return;

    const payload =
      editField === "title"
        ? { id: job.id, custom_job_title: editValue }
        : { id: job.id, custom_job_company: editValue };

    try {
      await updateJob.mutateAsync(payload);
      toast.success(`${editField === "title" ? "Title" : "Company"} updated.`);
      setEditField(null);
    } catch {
      toast.error("Failed to update.");
    }
  }

  function handleDelete() {
    deleteJob.mutate(job.id, {
      onSuccess: () => toast.success("Job deleted."),
      onError: () => toast.error("Failed to delete job."),
    });
  }

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={() => onSelect(job.job_listing.id)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect(job.job_listing.id);
          }
        }}
        className={cn(
          "flex w-full min-w-0 cursor-pointer flex-col gap-1 rounded-md px-3 py-2.5 text-left transition-colors",
          isSelected ? "bg-accent text-accent-foreground" : "hover:bg-muted/50",
        )}
      >
        <span className="truncate min-w-0 text-sm font-medium">
          {displayTitle}
        </span>
        {displayCompany && (
          <span className="truncate text-xs text-muted-foreground">
            {displayCompany}
          </span>
        )}
        <div className="flex items-center gap-1">
          <JobStatusSelect userJobId={job.id} currentStatus={job.status} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                onClick={(e) => e.stopPropagation()}
                className="ml-auto flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              onClick={(e) => e.stopPropagation()}
            >
              <DropdownMenuItem onClick={() => openEdit("title")}>
                <Pencil className="mr-2 h-3.5 w-3.5" />
                Edit title
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => openEdit("company")}>
                <Building2 className="mr-2 h-3.5 w-3.5" />
                Edit company
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={handleDelete}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 h-3.5 w-3.5" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Dialog
        open={editField !== null}
        onOpenChange={(open) => !open && setEditField(null)}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              Edit {editField === "title" ? "job title" : "company name"}
            </DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSaveEdit();
            }}
            className="space-y-4"
          >
            <Input
              autoFocus
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              disabled={updateJob.isPending}
            />
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditField(null)}
                disabled={updateJob.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={updateJob.isPending}>
                Save
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
