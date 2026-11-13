"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface Document {
  id: string;
  user_id: string;
  document_type: "resume" | "cover_letter" | "project";
  /** "written" is a project typed into the app, with no file. */
  source: "uploaded" | "generated" | "written";
  original_filename: string | null;
  display_name: string;
  target_role: string | null;
  is_default: boolean;
  mime_type: string | null;
  file_size_bytes: number | null;
  storage_bucket: string | null;
  storage_path: string | null;
  parsed_markdown: string | null;
  created_at: string;
  updated_at: string;
}

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
        const data = await res.json();
        throw new Error(data.error || "Failed to upload document");
      }
      return res.json() as Promise<Document>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
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
      return res.json() as Promise<Document[]>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
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
    },
  });
}
