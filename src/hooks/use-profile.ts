"use client";

import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { CareerProfile, ProfileSection } from "@/lib/profile/schema";

export const PROFILE_KEY = ["career-profile"];

// How often to check back while the Career Story is being rebuilt.
const REBUILD_POLL_MS = 3000;

export interface RebuildStatus {
  running: boolean;
  /** The last automatic update failed, and none has finished since. */
  error: string | null;
}

export interface ProfileState {
  /** Null if it hasn't been built yet. */
  profile: CareerProfile | null;
  rebuild: RebuildStatus;
}

/** The user's Career Story, and whether it's being rebuilt. Checks back while it is. */
export function useProfile() {
  return useQuery<ProfileState>({
    queryKey: PROFILE_KEY,
    queryFn: async () => {
      const res = await fetch("/api/profile");
      if (!res.ok) throw new Error("Failed to load your Career Story");
      return (await res.json()) as ProfileState;
    },
    refetchInterval: (query) => (query.state.data?.rebuild.running ? REBUILD_POLL_MS : false),
  });
}

/**
 * Call after a document changes: the server starts rebuilding the Career
 * Story, so fetch it again to show that it's updating.
 */
export function invalidateProfile(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: PROFILE_KEY });
}

function setProfile(queryClient: QueryClient, profile: CareerProfile) {
  queryClient.setQueryData<ProfileState>(PROFILE_KEY, (old) => ({
    profile,
    rebuild: old?.rebuild ?? { running: false, error: null },
  }));
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
    onSuccess: (profile) => setProfile(queryClient, profile),
  });
}

/** Undoes a change: restores a removed item, deletes an added one, or splits a merge. */
export function useUndoProfileChange() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (changeId: string) =>
      profileRequest(`/api/profile/changes/${changeId}`, { method: "DELETE" }, "Couldn't undo that"),
    onSuccess: (profile) => setProfile(queryClient, profile),
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
    onSuccess: (profile) => setProfile(queryClient, profile),
  });
}

/**
 * Rebuilds the Career Story from the user's documents. Can take a minute or
 * two. Resolves to null when a rebuild was already running; the profile query
 * then checks back until it's done.
 */
export function useRebuildProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/profile/rebuild", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't build your Career Story");
      return res.status === 202 ? null : (data.profile as CareerProfile);
    },
    onSuccess: (profile) => {
      if (profile) {
        queryClient.setQueryData<ProfileState>(PROFILE_KEY, {
          profile,
          rebuild: { running: false, error: null },
        });
      } else {
        void invalidateProfile(queryClient);
      }
    },
  });
}
