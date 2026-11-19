"use client";

import { useQuery, useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { invalidateProfile } from "@/hooks/use-profile";
import { changeAffectsReviews, invalidateResumeReviews } from "@/hooks/use-resume-reviews";
import type { Document, DocumentChange } from "@/lib/documents/document";

export type { Document } from "@/lib/documents/document";

/** What the server sends back for a Document change. */
export type DocumentChangeResponse = Omit<DocumentChange, "ok">;

/**
 * Refreshes what a Document change made out of date: always the Documents, the
 * Career Story when the server started a Rebuild, and the Resume Reviews when
 * the change shows in them.
 */
export function onDocumentChanged(queryClient: QueryClient, change: DocumentChangeResponse) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ["documents"] }),
    change.rebuildRequested && invalidateProfile(queryClient),
    changeAffectsReviews(change) && invalidateResumeReviews(queryClient),
  ]);
}

/** Sends a Document change and returns what it changed, or throws the server's message. */
async function sendChange(url: string, init: RequestInit, fallback: string): Promise<DocumentChangeResponse> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error || fallback);
  }
  return res.json();
}

const jsonBody = (body: unknown): RequestInit => ({
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

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
    mutationFn: (formData: FormData) =>
      sendChange("/api/documents", { method: "POST", body: formData }, "Failed to upload document"),
    onSuccess: (change) => onDocumentChanged(queryClient, change),
  });
}

/**
 * Adds projects: `{ title, description }` adds one written project, and
 * FormData with a `file` splits the file into projects.
 */
export function useAddProjects() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { title: string; description: string } | FormData) =>
      sendChange(
        "/api/projects",
        { method: "POST", ...(input instanceof FormData ? { body: input } : jsonBody(input)) },
        "Failed to add projects",
      ),
    onSuccess: (change) => onDocumentChanged(queryClient, change),
  });
}

/** Replaces an uploaded resume's or cover letter's file, keeping its name, target role, default and jobs. */
export function useReplaceDocumentFile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) => {
      const formData = new FormData();
      formData.append("file", file);
      return sendChange(`/api/documents/${id}/file`, { method: "POST", body: formData }, "Failed to replace the file");
    },
    onSuccess: (change) => onDocumentChanged(queryClient, change),
  });
}

export function useDeleteDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => sendChange(`/api/documents/${id}`, { method: "DELETE" }, "Failed to delete document"),
    onSuccess: (change) => onDocumentChanged(queryClient, change),
  });
}

export function useUpdateDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      ...fields
    }: {
      id: string;
      display_name?: string;
      target_role?: string | null;
      parsed_markdown?: string;
    }) => sendChange(`/api/documents/${id}`, { method: "PATCH", ...jsonBody(fields) }, "Failed to update document"),
    onSuccess: (change) => onDocumentChanged(queryClient, change),
  });
}

export function useSetDefaultDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      sendChange(`/api/documents/${id}`, { method: "PATCH", ...jsonBody({ is_default: true }) }, "Failed to set default document"),
    onSuccess: (change) => onDocumentChanged(queryClient, change),
  });
}
