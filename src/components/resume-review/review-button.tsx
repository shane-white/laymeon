"use client";

import { ClipboardCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useResumeReviews, useRunResumeReview } from "@/hooks/use-resume-reviews";

/**
 * On a resume: "Review this resume", or "View review" once it has one. A
 * review takes about a minute; when it's done, the report opens.
 */
export function ReviewResumeButton({
  resumeDocumentId,
  onOpenReport,
}: {
  resumeDocumentId: string;
  onOpenReport: (resumeDocumentId: string) => void;
}) {
  const { data: reviews } = useResumeReviews();
  const run = useRunResumeReview();
  const existing = reviews?.find((r) => r.resumeDocumentId === resumeDocumentId);
  const pending = run.isPending && run.variables === resumeDocumentId;

  if (existing && !pending) {
    return (
      <Button variant="outline" size="sm" onClick={() => onOpenReport(resumeDocumentId)}>
        <ClipboardCheck />
        View review
      </Button>
    );
  }

  return (
    <Button
      size="sm"
      disabled={pending}
      onClick={() =>
        run.mutate(resumeDocumentId, {
          onSuccess: () => onOpenReport(resumeDocumentId),
          onError: (err) => toast.error(err.message),
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" /> : <ClipboardCheck />}
      {pending ? "Reviewing… about a minute" : "Review this resume"}
    </Button>
  );
}
