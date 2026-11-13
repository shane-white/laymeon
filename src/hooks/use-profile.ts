"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CareerProfile, ProfileSection } from "@/lib/profile/schema";

const PROFILE_KEY = ["career-profile"];

/** The user's Career Story, or null if it hasn't been built yet. */
export function useProfile() {
  return useQuery<CareerProfile | null>({
    queryKey: PROFILE_KEY,
    queryFn: async () => {
      const res = await fetch("/api/profile");
      if (!res.ok) throw new Error("Failed to load your Career Story");
      const data = (await res.json()) as { profile: CareerProfile | null };
      return data.profile;
    },
  });
}

export type ProfileChangeRequest =
  | { kind: "edit"; section: ProfileSection; targetKey: string; fields: Record<string, unknown> }
  | { kind: "add"; section: ProfileSection; fields: Record<string, unknown> }
  | { kind: "hide"; section: ProfileSection; targetKey: string }
  | { kind: "merge"; section: ProfileSection; targetKey: string; mergedKeys: string[] };

export type ResolveRequest =
  | { action: "keep_mine"; field: string }
  | { action: "reset_field"; field: string }
  | { action: "keep_item" };

async function profileRequest(url: string, init: RequestInit, failure: string): Promise<CareerProfile> {
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || failure);
  return data.profile as CareerProfile;
}

/** Saves an edit, addition, removal or merge. */
export function useProfileChange() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (change: ProfileChangeRequest) =>
      profileRequest(
        "/api/profile/changes",
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(change) },
        "Couldn't save your change",
      ),
    onSuccess: (profile) => queryClient.setQueryData(PROFILE_KEY, profile),
  });
}

/** Undoes a change: restores a removed item, deletes an added one, or splits a merge. */
export function useUndoProfileChange() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (changeId: string) =>
      profileRequest(`/api/profile/changes/${changeId}`, { method: "DELETE" }, "Couldn't undo that"),
    onSuccess: (profile) => queryClient.setQueryData(PROFILE_KEY, profile),
  });
}

/** Answers a review item, or resets one edited field to what the documents say. */
export function useResolveProfileChange() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ changeId, ...request }: ResolveRequest & { changeId: string }) =>
      profileRequest(
        `/api/profile/changes/${changeId}`,
        { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request) },
        "Couldn't save that",
      ),
    onSuccess: (profile) => queryClient.setQueryData(PROFILE_KEY, profile),
  });
}

/** Rebuilds the Career Story from the user's documents. Can take a minute or two. */
export function useRebuildProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/profile/rebuild", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't build your Career Story");
      return data.profile as CareerProfile;
    },
    onSuccess: (profile) => {
      queryClient.setQueryData(PROFILE_KEY, profile);
    },
  });
}
