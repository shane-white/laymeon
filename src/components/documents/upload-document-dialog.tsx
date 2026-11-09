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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

function nameFromFilename(filename: string): string {
  return filename.replace(/\.[^.]+$/, "").slice(0, 200);
}

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
  const [name, setName] = useState("");
  const [targetRole, setTargetRole] = useState("");
  const uploadDocument = useUploadDocument();

  const onDrop = useCallback((accepted: File[]) => {
    const next = accepted[0] ?? null;
    setFile(next);
    setName(next ? nameFromFilename(next.name) : "");
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: ACCEPT,
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024,
    onDrop,
    onDropRejected: (rejections) => {
      const error = rejections[0]?.errors[0];
      if (error?.code === "file-too-large") {
        toast.error("File is too large. Maximum size is 10 MB.");
      } else if (error?.code === "file-invalid-type") {
        toast.error("Unsupported format. Please upload a PDF or DOCX file.");
      }
    },
  });

  function handleReset() {
    setFile(null);
    setName("");
    setTargetRole("");
  }

  function handleOpenChange(next: boolean) {
    if (!next && uploadDocument.isPending) return;
    setOpen(next);
    if (!next) handleReset();
  }

  async function handleUpload() {
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);
    formData.append("documentType", documentType);
    formData.append("displayName", name.trim() || file.name);
    formData.append("targetRole", targetRole.trim());

    try {
      await uploadDocument.mutateAsync(formData);
      toast.success(`${typeLabels[documentType]} uploaded successfully.`);
      handleReset();
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
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Upload {typeLabels[documentType]}</DialogTitle>
          <DialogDescription>
            Supported formats: PDF, DOCX, DOC. Maximum size: 10 MB.
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
          {file && (
            <>
              <div className="space-y-2">
                <Label htmlFor="upload-document-name">Name</Label>
                <Input
                  id="upload-document-name"
                  value={name}
                  maxLength={200}
                  onChange={(e) => setName(e.target.value)}
                  disabled={uploadDocument.isPending}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="upload-document-role">
                  Target role (optional)
                </Label>
                <Input
                  id="upload-document-role"
                  value={targetRole}
                  maxLength={200}
                  placeholder="e.g. Product Manager"
                  onChange={(e) => setTargetRole(e.target.value)}
                  disabled={uploadDocument.isPending}
                />
              </div>
            </>
          )}
          <Button
            className="w-full"
            onClick={handleUpload}
            disabled={!file || !name.trim() || uploadDocument.isPending}
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
