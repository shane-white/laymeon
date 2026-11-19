"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { invalidateProfile } from "@/hooks/use-profile";
import { invalidateResumeReviews } from "@/hooks/use-resume-reviews";
import type { Document, DocumentChange } from "@/lib/documents/document";

export type { Document } from "@/lib/documents/document";

/** What the server sends back for a Document change. */
export type DocumentChangeResponse = Omit<DocumentChange, "ok">;

export function useDocuments() {
  return useQuery<Document[]>({
    queryKey: ["documents"],
    queryFn: async () => {
      const res = await fetch("/api/documents");
      if (!res.ok) throw new Error("Failed to fetch documents");
      return res.json();
    },
  });
}

export function useUploadDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (formData: FormData) => {
      const res = await fetch("/api/documents", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to upload document");
      }
      return res.json() as Promise<DocumentChangeResponse>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      // The server rebuilds the Career Story after document changes.
      void invalidateProfile(queryClient);
      // A changed or deleted resume makes its review out of date.
      void invalidateResumeReviews(queryClient);
    },
  });
}

/**
 * Adds projects: `{ title, description }` adds one written project, and
 * FormData with a `file` splits the file into projects.
 */
export function useAddProjects() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { title: string; description: string } | FormData) => {
      const res = await fetch("/api/projects", {
        method: "POST",
        ...(input instanceof FormData
          ? { body: input }
          : {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(input),
            }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to add projects");
      }
      return res.json() as Promise<DocumentChangeResponse>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      // The server rebuilds the Career Story after document changes.
      void invalidateProfile(queryClient);
      // A changed or deleted resume makes its review out of date.
      void invalidateResumeReviews(queryClient);
    },
  });
}

/** Replaces an uploaded resume's or cover letter's file, keeping its name, target role, default and jobs. */
export function useReplaceDocumentFile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, file }: { id: string; file: File }) => {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/documents/${id}/file`, { method: "POST", body: formData });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to replace the file");
      }
      return res.json() as Promise<Document>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      // The server rebuilds the Career Story after document changes.
      void invalidateProfile(queryClient);
      // The document's reviews were made from the old file.
      void invalidateResumeReviews(queryClient);
    },
  });
}

export function useDeleteDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/documents/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete document");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      // The server rebuilds the Career Story after document changes.
      void invalidateProfile(queryClient);
      // A changed or deleted resume makes its review out of date.
      void invalidateResumeReviews(queryClient);
    },
  });
}

export function useUpdateDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      ...fields
    }: {
      id: string;
      display_name?: string;
      target_role?: string | null;
      parsed_markdown?: string;
    }) => {
      const res = await fetch(`/api/documents/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update document");
      }
      return res.json() as Promise<Document>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      // The server rebuilds the Career Story after document changes.
      void invalidateProfile(queryClient);
      // A changed or deleted resume makes its review out of date.
      void invalidateResumeReviews(queryClient);
    },
  });
}

export function useSetDefaultDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/documents/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_default: true }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to set default document");
      }
      return res.json() as Promise<Document>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      // The server rebuilds the Career Story after document changes.
      void invalidateProfile(queryClient);
      // A changed or deleted resume makes its review out of date.
      void invalidateResumeReviews(queryClient);
    },
  });
}
