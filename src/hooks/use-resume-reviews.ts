"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReviewSummary, StoredReview } from "@/lib/resume-review/store";

const LIST_KEY = ["resume-reviews"] as const;
const reviewKey = (resumeDocumentId: string) => ["resume-review", resumeDocumentId] as const;

async function errorMessage(res: Response, fallback: string): Promise<string> {
  const data = await res.json().catch(() => ({}));
  return (data as { error?: string }).error || fallback;
}

/** All of the user's resume reviews, for the Generated Documents list. */
export function useResumeReviews() {
  return useQuery<ReviewSummary[]>({
    queryKey: LIST_KEY,
    queryFn: async () => {
      const res = await fetch("/api/resume-reviews");
      if (!res.ok) throw new Error(await errorMessage(res, "Failed to load reviews"));
      return res.json();
    },
  });
}

/** One resume's saved review, or null if it hasn't been reviewed. */
export function useResumeReview(resumeDocumentId: string | null) {
  return useQuery<StoredReview | null>({
    queryKey: reviewKey(resumeDocumentId ?? ""),
    enabled: Boolean(resumeDocumentId),
    queryFn: async () => {
      const res = await fetch(`/api/documents/${resumeDocumentId}/review`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(await errorMessage(res, "Failed to load the review"));
      return res.json();
    },
  });
}

/** Runs (or re-runs) the review of a resume. Takes about a minute. */
export function useRunResumeReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (resumeDocumentId: string) => {
      const res = await fetch(`/api/documents/${resumeDocumentId}/review`, { method: "POST" });
      if (!res.ok) throw new Error(await errorMessage(res, "The review couldn't be completed. Please try again."));
      return res.json() as Promise<StoredReview>;
    },
    onSuccess: (stored) => {
      queryClient.setQueryData(reviewKey(stored.resumeDocumentId), stored);
      void queryClient.invalidateQueries({ queryKey: LIST_KEY });
    },
  });
}

export function useDeleteResumeReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (resumeDocumentId: string) => {
      const res = await fetch(`/api/documents/${resumeDocumentId}/review`, { method: "DELETE" });
      if (!res.ok) throw new Error(await errorMessage(res, "Couldn't delete the review"));
      return resumeDocumentId;
    },
    onSuccess: (resumeDocumentId) => {
      queryClient.setQueryData(reviewKey(resumeDocumentId), null);
      void queryClient.invalidateQueries({ queryKey: LIST_KEY });
    },
  });
}

/** After a document changes, its review may be out of date. */
export function invalidateResumeReviews(queryClient: ReturnType<typeof useQueryClient>) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: LIST_KEY }),
    queryClient.invalidateQueries({ queryKey: ["resume-review"] }),
  ]);
}
