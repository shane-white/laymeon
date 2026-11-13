"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CareerProfile } from "@/lib/profile/schema";

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
