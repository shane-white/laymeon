"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { ProjectFields } from "@/components/documents/project-fields";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { invalidateProfile } from "@/hooks/use-profile";
import type { TailoringResponse } from "@/lib/tailoring/http";
import type { FailureKind } from "@/lib/tailoring/tailoring";

interface ExampleWorkPromptProps {
  /** The Job (`user_job_listings.id`). */
  jobId: string;
  /** The gap's item ID in the Tailoring. */
  itemId: string;
  /** The item's text, as the Match Report gives it. */
  itemText: string;
  /** Called with the Tailoring once the item has its Suggestion. */
  onDone: (state: TailoringResponse) => void;
}

/**
 * Asks the user to describe a project where they did a gap's item. Saving adds
 * it as an Example Work (which rebuilds the Career Story in the background)
 * and writes the item's Suggestion from it.
 */
export function ExampleWorkPrompt({ jobId, itemId, itemText, onDone }: ExampleWorkPromptProps) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The Example Work was saved but no Suggestion came of it: saving again would add it twice.
  const [savedWithoutSuggestion, setSavedWithoutSuggestion] = useState(false);

  async function handleSubmit() {
    if (!title.trim() || !description.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/tailoring/example-work`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, title, description }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const { error: message, kind } = data as { error?: string; kind?: FailureKind };
        setError(message || "Couldn't save your project. Please try again.");
        if (kind === "step_failed") {
          setSavedWithoutSuggestion(true);
          void refetchDocumentsAndCareerStory();
        }
        return;
      }
      void refetchDocumentsAndCareerStory();
      onDone(data as TailoringResponse);
    } catch {
      setError("Couldn't save your project. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function refetchDocumentsAndCareerStory() {
    return Promise.all([queryClient.invalidateQueries({ queryKey: ["documents"] }), invalidateProfile(queryClient)]);
  }

  if (savedWithoutSuggestion) {
    return (
      <Alert>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  const idPrefix = `example-work-${itemId}`;
  return (
    <form
      className="space-y-4"
      aria-labelledby={`${idPrefix}-prompt`}
      onSubmit={(e) => {
        e.preventDefault();
        void handleSubmit();
      }}
    >
      <p id={`${idPrefix}-prompt`} className="text-sm">
        Your Resume and Career Story don&rsquo;t show <em className="font-medium">{itemText}</em>. If
        you&rsquo;ve done this, or something close to it, describe a project that shows it.
      </p>
      <ProjectFields
        idPrefix={idPrefix}
        title={title}
        description={description}
        onTitleChange={setTitle}
        onDescriptionChange={setDescription}
        disabled={busy}
      />
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <p className="text-xs text-muted-foreground">
        It&rsquo;s saved to your Example Works, so your Career Story can use it for other Jobs too.
      </p>
      <Button type="submit" disabled={busy || !title.trim() || !description.trim()}>
        {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {busy ? "Writing a Suggestion…" : "Save and write a Suggestion"}
      </Button>
    </form>
  );
}
