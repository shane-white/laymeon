"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useUpdateJob, type UserJob } from "@/hooks/use-jobs";
import type { Document } from "@/hooks/use-documents";
import { toast } from "sonner";

// Radix Select doesn't allow an empty value, so "use the default" gets a sentinel.
const DEFAULT_VALUE = "__default__";

const config = {
  resume: { field: "resume_document_id", label: "Resume" },
  cover_letter: { field: "cover_letter_document_id", label: "Cover letter" },
} as const;

interface JobDocumentSelectProps {
  job: UserJob;
  type: Document["document_type"];
  /** The user's live uploaded documents of all types. */
  documents: Document[];
}

export function JobDocumentSelect({ job, type, documents }: JobDocumentSelectProps) {
  const updateJob = useUpdateJob();
  const { field, label } = config[type];

  const options = documents.filter((d) => d.document_type === type);
  const defaultDoc = options.find((d) => d.is_default) ?? null;
  const selectedId = job[field];
  // A selection that no longer exists (deleted) falls back to the default.
  const value =
    selectedId && options.some((d) => d.id === selectedId)
      ? selectedId
      : DEFAULT_VALUE;

  if (options.length === 0) {
    return (
      <span className="text-xs text-muted-foreground">
        {label}: <span className="italic">none uploaded</span>
      </span>
    );
  }

  function handleChange(next: string) {
    updateJob.mutate(
      { id: job.id, [field]: next === DEFAULT_VALUE ? null : next },
      { onError: (err) => toast.error(err.message) },
    );
  }

  return (
    <div className="flex min-w-0 items-center gap-1.5 text-xs">
      <span className="shrink-0 text-muted-foreground">{label}:</span>
      <Select value={value} onValueChange={handleChange} disabled={updateJob.isPending}>
        <SelectTrigger size="sm" className="h-7 max-w-56 min-w-0 px-2 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={DEFAULT_VALUE}>
            Default ({defaultDoc?.display_name ?? "none"})
          </SelectItem>
          <SelectSeparator />
          {options.map((doc) => (
            <SelectItem key={doc.id} value={doc.id}>
              <span className="truncate">
                {doc.display_name}
                {doc.target_role && (
                  <span className="text-muted-foreground"> · {doc.target_role}</span>
                )}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
