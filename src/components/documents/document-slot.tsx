"use client";

import { Button } from "@/components/ui/button";
import { UploadDocumentDialog } from "@/components/documents/upload-document-dialog";
import { useDeleteDocument, type Document } from "@/hooks/use-documents";
import { cn } from "@/lib/utils";
import { FileText, Upload, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface DocumentSlotProps {
  type: "resume" | "cover_letter";
  document: Document | null;
  isSelected: boolean;
  onSelect: (id: string) => void;
}

const typeLabels: Record<string, string> = {
  resume: "Resume",
  cover_letter: "Cover Letter",
};

export function DocumentSlot({
  type,
  document,
  isSelected,
  onSelect,
}: DocumentSlotProps) {
  const deleteDocument = useDeleteDocument();

  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    if (!document) return;
    deleteDocument.mutate(document.id, {
      onSuccess: () => toast.success(`${typeLabels[type]} removed.`),
      onError: () => toast.error(`Failed to remove ${typeLabels[type]}.`),
    });
  }

  if (!document) {
    return (
      <UploadDocumentDialog documentType={type}>
        <button className="flex w-full items-center gap-2 rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground">
          <Upload className="h-4 w-4 shrink-0" />
          <span>Upload {typeLabels[type]}</span>
        </button>
      </UploadDocumentDialog>
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(document.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(document.id);
        }
      }}
      className={cn(
        "group flex min-w-0 items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
        isSelected
          ? "bg-accent text-accent-foreground"
          : "hover:bg-accent hover:text-accent-foreground",
      )}
    >
      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate">
        {document.original_filename}
      </span>
      <button
        onClick={handleDelete}
        className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
        title={`Remove ${typeLabels[type]}`}
      >
        <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
      </button>
    </div>
  );
}
