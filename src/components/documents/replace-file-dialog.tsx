"use client";

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { File as FileIcon, Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useReplaceDocumentFile, type Document } from "@/hooks/use-documents";

const ACCEPT = {
  "application/pdf": [".pdf"],
  "application/msword": [".doc"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
};

const typeLabels: Record<Document["document_type"], string> = {
  resume: "resume",
  cover_letter: "cover letter",
  project: "project",
};

/** Uploads a new version of a resume or cover letter in place of the old file. */
export function ReplaceFileDialog({
  document,
  open,
  onOpenChange,
  title = "Replace file",
  description,
  submitLabel = "Replace file",
  onReplaced,
}: {
  document: Document;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  /** Replaces the default explanation under the title. */
  description?: string;
  submitLabel?: string;
  /** Called after the new file is uploaded and parsed. */
  onReplaced?: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const replace = useReplaceDocumentFile();
  const typeLabel = typeLabels[document.document_type];

  const onDrop = useCallback((accepted: File[]) => setFile(accepted[0] ?? null), []);
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: ACCEPT,
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024,
    onDrop,
    onDropRejected: (rejections) => {
      const error = rejections[0]?.errors[0];
      if (error?.code === "file-too-large") toast.error("File is too large. Maximum size is 10 MB.");
      else if (error?.code === "file-invalid-type") toast.error("Unsupported format. Please upload a PDF or DOCX file.");
    },
  });

  function handleOpenChange(next: boolean) {
    if (!next && replace.isPending) return;
    onOpenChange(next);
    if (!next) setFile(null);
  }

  function handleReplace() {
    if (!file) return;
    replace.mutate(
      { id: document.id, file },
      {
        onSuccess: () => {
          toast.success(`"${document.display_name}" now uses ${file.name}.`);
          setFile(null);
          onOpenChange(false);
          onReplaced?.();
        },
        onError: (err) => toast.error(err.message),
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {description ?? (
              <>
                Upload a new version of &ldquo;{document.display_name}&rdquo;. Its name, target role
                {document.is_default ? ", default setting" : ""} and the jobs that use it stay the same.
                {document.document_type === "resume" && " Reviews of the old version will be marked out of date."}
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        {!file ? (
          <div
            {...getRootProps()}
            className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 transition-colors ${
              isDragActive ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-muted-foreground/50"
            }`}
          >
            <input {...getInputProps()} aria-label={`New file for this ${typeLabel}`} />
            <Upload className="h-8 w-8 text-muted-foreground" aria-hidden />
            <p className="text-sm text-muted-foreground">
              {isDragActive ? "Drop your file here..." : "Drag & drop a file here, or click to browse"}
            </p>
            <p className="text-xs text-muted-foreground">PDF, DOCX or DOC, up to 10 MB.</p>
          </div>
        ) : (
          <div className="flex items-center gap-3 rounded-lg border p-3">
            <FileIcon className="h-8 w-8 shrink-0 text-muted-foreground" aria-hidden />
            <p className="min-w-0 flex-1 truncate text-sm font-medium">{file.name}</p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => setFile(null)}
              disabled={replace.isPending}
              aria-label="Choose a different file"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={replace.isPending}>
            Cancel
          </Button>
          <Button onClick={handleReplace} disabled={!file || replace.isPending}>
            {replace.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {replace.isPending ? "Uploading & parsing..." : submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
