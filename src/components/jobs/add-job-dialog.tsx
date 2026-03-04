"use client";

import { useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { useCreateJob } from "@/hooks/use-jobs";
import { toast } from "sonner";
import { Plus, Loader2 } from "lucide-react";

export function AddJobDialog() {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const createJob = useCreateJob();

  function reset() {
    setUrl("");
    setText("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!url && !text) {
      toast.error("Provide either a URL or paste the job description.");
      return;
    }

    try {
      await createJob.mutateAsync(url ? { url } : { text });
      toast.success("Job added successfully.");
      reset();
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add job.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="w-full gap-1.5">
          <Plus className="h-4 w-4" />
          Add Job
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add a job listing</DialogTitle>
          <DialogDescription>
            Provide a URL to a job posting, or paste the description directly.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="job-url">Job URL</FieldLabel>
              <Input
                id="job-url"
                type="url"
                placeholder="https://example.com/jobs/..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={!!text || createJob.isPending}
              />
            </Field>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <div className="h-px flex-1 bg-border" />
              or
              <div className="h-px flex-1 bg-border" />
            </div>
            <Field>
              <FieldLabel htmlFor="job-text">Paste description</FieldLabel>
              <Textarea
                id="job-text"
                className="max-h-64"
                placeholder="Paste the full job listing text here..."
                rows={6}
                value={text}
                onChange={(e) => setText(e.target.value)}
                disabled={!!url || createJob.isPending}
              />
            </Field>
            <Button type="submit" disabled={createJob.isPending}>
              {createJob.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                "Add Job"
              )}
            </Button>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  );
}
