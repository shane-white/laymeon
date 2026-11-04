"use client";

import { useQuery } from "@tanstack/react-query";
import type { UIMessage } from "ai";

export interface SavedConversation {
  conversationId: string | null;
  messages: UIMessage[];
}

export function useLatestJobChat(userJobId: string, enabled: boolean) {
  return useQuery<SavedConversation>({
    queryKey: ["job-chat-latest", userJobId],
    queryFn: async () => {
      const res = await fetch(`/api/jobs/${userJobId}/chat`);
      if (!res.ok) throw new Error("Failed to fetch chat history");
      return res.json();
    },
    enabled,
  });
}
