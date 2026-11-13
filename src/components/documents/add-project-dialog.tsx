"use client";

import { useCallback, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProjectFields } from "@/components/documents/project-fields";
import { useAddProjects } from "@/hooks/use-documents";
import { File, Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";

interface AddProjectDialogProps {
  children: React.ReactNode;
}

const ACCEPT = {
  "application/pdf": [".pdf"],
  "application/msword": [".doc"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
    ".docx",
  ],
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AddProjectDialog({ children }: AddProjectDialogProps) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"write" | "upload">("write");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  // How many projects were added with "Submit and add another" this session.
  const [addedCount, setAddedCount] = useState(0);
  const titleRef = useRef<HTMLInputElement>(null);
  const addProjects = useAddProjects();
  const busy = addProjects.isPending;

  const onDrop = useCallback((accepted: File[]) => {
    setFile(accepted[0] ?? null);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: ACCEPT,
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024,
    onDrop,
    disabled: busy,
    onDropRejected: (rejections) => {
      const error = rejections[0]?.errors[0];
      if (error?.code === "file-too-large") {
        toast.error("File is too large. Maximum size is 10 MB.");
      } else if (error?.code === "file-invalid-type") {
        toast.error("Unsupported format. Please upload a PDF or DOCX file.");
      }
    },
  });

  function reset() {
    setTab("write");
    setTitle("");
    setDescription("");
    setFile(null);
    setAddedCount(0);
  }

  function handleOpenChange(next: boolean) {
    if (!next && busy) return;
    setOpen(next);
    if (!next) reset();
  }

  async function handleSubmit(addAnother: boolean) {
    if (!title.trim() || !description.trim()) return;
    try {
      await addProjects.mutateAsync({ title, description });
      toast.success(`"${title.trim()}" added.`);
      if (addAnother) {
        setTitle("");
        setDescription("");
        setAddedCount((n) => n + 1);
        titleRef.current?.focus();
      } else {
        setOpen(false);
        reset();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add project.");
    }
  }

  async function handleUpload() {
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    try {
      const created = await addProjects.mutateAsync(formData);
      toast.success(
        created.length === 1
          ? `Added 1 project from ${file.name}.`
          : `Added ${created.length} projects from ${file.name}.`,
      );
      setOpen(false);
      reset();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to import projects.");
    }
  }

  const canSubmit = !!title.trim() && !!description.trim() && !busy;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a project</DialogTitle>
          <DialogDescription>
            Projects add context about your experience beyond your resume.
          </DialogDescription>
        </DialogHeader>
        <Tabs value={tab} onValueChange={(v) => !busy && setTab(v as typeof tab)}>
          <TabsList className="w-full">
            <TabsTrigger value="write" disabled={busy}>
              Write it
            </TabsTrigger>
            <TabsTrigger value="upload" disabled={busy}>
              Upload a file
            </TabsTrigger>
          </TabsList>

          <TabsContent value="write">
            <form
              className="space-y-4 pt-2"
              onSubmit={(e) => {
                e.preventDefault();
                handleSubmit(false);
              }}
            >
              <ProjectFields
                idPrefix="add-project"
                title={title}
                description={description}
                onTitleChange={setTitle}
                onDescriptionChange={setDescription}
                disabled={busy}
                titleRef={titleRef}
                autoFocus
              />
              <DialogFooter className="items-center">
                {addedCount > 0 && (
                  <p className="mr-auto text-xs text-muted-foreground">
                    {addedCount} added
                  </p>
                )}
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleSubmit(true)}
                  disabled={!canSubmit}
                >
                  Submit and add another
                </Button>
                <Button type="submit" disabled={!canSubmit}>
                  {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Submit
                </Button>
              </DialogFooter>
            </form>
          </TabsContent>

          <TabsContent value="upload">
            <div className="space-y-4 pt-2">
              <p className="text-sm text-muted-foreground">
                Upload a portfolio, case studies or a list of projects as a
                PDF or DOCX (up to 10 MB). We&rsquo;ll split it into separate
                projects.
              </p>
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
                    onClick={() => setFile(null)}
                    disabled={busy}
                    aria-label="Remove file"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
              <Button
                className="w-full"
                onClick={handleUpload}
                disabled={!file || busy}
              >
                {busy ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Finding projects...
                  </>
                ) : (
                  "Upload and find projects"
                )}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
