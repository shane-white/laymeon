"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { MatchReport } from "@/lib/match-report/schema";
import { compareSortOrder } from "@/lib/jobs/sort-order";

export interface JobListing {
  id: string;
  url: string | null;
  extracted_job_title: string;
  extracted_company_name: string | null;
  location: string | null;
  /** on_site, hybrid or remote. See src/lib/jobs/details.ts. */
  work_arrangement: string | null;
  salary: string | null;
  /** intern … executive. See src/lib/jobs/details.ts. */
  seniority_level: string | null;
  description: string | null;
}

/** Which documents an analysis was generated with (names are snapshots). */
export interface AnalysisDocumentsEntry {
  resume_id: string;
  resume_name: string;
  cover_letter_id: string | null;
  cover_letter_name: string | null;
  generated_at: string;
}

export interface UserJob {
  id: string;
  status: string;
  custom_job_title: string | null;
  custom_job_company: string | null;
  match_analysis: string | null;
  match_report: MatchReport | null;
  resume_suggestions: string | null;
  cover_letter_suggestions: string | null;
  interview_suggestions: string | null;
  notes: string | null;
  resume_document_id: string | null;
  cover_letter_document_id: string | null;
  analysis_documents: Partial<Record<AnalysisType, AnalysisDocumentsEntry>> | null;
  /** The user's drag order. Lower shows first. */
  sort_order: number;
  created_at: string;
  job_listing: JobListing;
}

export function useJobs() {
  return useQuery<UserJob[]>({
    queryKey: ["jobs"],
    queryFn: async () => {
      const res = await fetch("/api/jobs");
      if (!res.ok) throw new Error("Failed to fetch jobs");
      return res.json();
    },
  });
}

export function useCreateJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: { url?: string; text?: string }) => {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create job");
      }
      return res.json() as Promise<UserJob>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
    },
  });
}

export function useUpdateJobStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await fetch(`/api/jobs/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Failed to update status");
      return res.json();
    },
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: ["jobs"] });
      const previous = queryClient.getQueryData<UserJob[]>(["jobs"]);

      queryClient.setQueryData<UserJob[]>(["jobs"], (old) =>
        old?.map((job) => (job.id === id ? { ...job, status } : job)),
      );

      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["jobs"], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
    },
  });
}

/**
 * Moves a job between two neighbors (null at the top or bottom). The list
 * reorders right away; it rolls back if saving fails.
 */
export function useReorderJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      aboveId,
      belowId,
    }: {
      id: string;
      aboveId: string | null;
      belowId: string | null;
      /** Position to show until the server responds. */
      optimisticSortOrder: number;
    }) => {
      const res = await fetch(`/api/jobs/${id}/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aboveId, belowId }),
      });
      if (!res.ok) throw new Error("Failed to reorder job");
      return res.json() as Promise<{ id: string; sort_order: number }>;
    },
    onMutate: async ({ id, optimisticSortOrder }) => {
      await queryClient.cancelQueries({ queryKey: ["jobs"] });
      const previous = queryClient.getQueryData<UserJob[]>(["jobs"]);

      queryClient.setQueryData<UserJob[]>(["jobs"], (old) =>
        old
          ?.map((job) =>
            job.id === id ? { ...job, sort_order: optimisticSortOrder } : job,
          )
          .sort(compareSortOrder),
      );

      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["jobs"], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
    },
  });
}

export function useUpdateJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      ...fields
    }: {
      id: string;
      custom_job_title?: string;
      custom_job_company?: string;
      resume_document_id?: string | null;
      cover_letter_document_id?: string | null;
    }) => {
      const res = await fetch(`/api/jobs/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to update job");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
    },
  });
}

export type AnalysisType =
  | "match_analysis"
  | "resume_suggestions"
  | "cover_letter_suggestions"
  | "interview_suggestions";

export function useAnalyzeJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, type }: { id: string; type: AnalysisType }) => {
      const res = await fetch(`/api/jobs/${id}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Analysis failed");
      }
      return res.json() as Promise<{ content?: string; report?: MatchReport }>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
    },
  });
}

export function useUpdateNotes() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes: string }) => {
      const res = await fetch(`/api/jobs/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      });
      if (!res.ok) throw new Error("Failed to save notes");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
    },
  });
}

/**
 * Fetches the job's description again from its URL. The job then points at a
 * new listing, so its job_listing.id changes.
 */
export function useRefetchJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/jobs/${id}/refetch`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to refetch job");
      }
      return res.json() as Promise<{ job_listing_id: string }>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
    },
  });
}

export function useDeleteJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/jobs/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete job");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
    },
  });
}
