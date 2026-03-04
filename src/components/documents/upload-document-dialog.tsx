"use client";

import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useUploadDocument } from "@/hooks/use-documents";
import { toast } from "sonner";
import { Upload, Loader2, File, X } from "lucide-react";

interface UploadDocumentDialogProps {
  documentType: "resume" | "cover_letter";
  children: React.ReactNode;
}

const ACCEPT = {
  "application/pdf": [".pdf"],
  "application/msword": [".doc"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
    ".docx",
  ],
};

const typeLabels: Record<string, string> = {
  resume: "Resume",
  cover_letter: "Cover Letter",
};

export function UploadDocumentDialog({
  documentType,
  children,
}: UploadDocumentDialogProps) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const uploadDocument = useUploadDocument();

  const onDrop = useCallback((accepted: File[]) => {
    setFile(accepted[0] ?? null);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: ACCEPT,
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024,
    onDrop,
    onDropRejected: (rejections) => {
      const error = rejections[0]?.errors[0];
      if (error?.code === "file-too-large") {
        toast.error("File is too large. Maximum size is 5 MB.");
      } else if (error?.code === "file-invalid-type") {
        toast.error("Unsupported format. Please upload a PDF or DOCX file.");
      }
    },
  });

  function handleReset() {
    setFile(null);
  }

  async function handleUpload() {
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);
    formData.append("documentType", documentType);

    try {
      await uploadDocument.mutateAsync(formData);
      toast.success(`${typeLabels[documentType]} uploaded successfully.`);
      setFile(null);
      setOpen(false);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to upload document.",
      );
    }
  }

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Upload {typeLabels[documentType]}</DialogTitle>
          <DialogDescription>
            Supported formats: PDF, DOCX, DOC. Maximum size: 5 MB.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {!file ? (
            <div
              {...getRootProps()}
              className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 transition-colors ${
                isDragActive
                  ? "border-primary bg-primary/5"
                  : "border-muted-foreground/25 hover:border-muted-foreground/50"
              }`}
            >
              <input {...getInputProps()} />
              <Upload className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {isDragActive
                  ? "Drop your file here..."
                  : "Drag & drop a file here, or click to browse"}
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-lg border p-3">
              <File className="h-8 w-8 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatFileSize(file.size)}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={handleReset}
                disabled={uploadDocument.isPending}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}
          <Button
            className="w-full"
            onClick={handleUpload}
            disabled={!file || uploadDocument.isPending}
          >
            {uploadDocument.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Uploading & parsing...
              </>
            ) : (
              "Upload"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
