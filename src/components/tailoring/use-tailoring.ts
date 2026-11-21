"use client";

import { useCallback, useRef } from "react";
import { useMutation, useMutationState, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { TailoringResponse } from "@/lib/tailoring/http";
import type { Decision } from "@/lib/tailoring/tailoring";
import { withDecision } from "./view";

/** The query key for a Job's Tailoring (`user_job_listings.id`). */
export const tailoringKey = (jobId: string) => ["tailoring", jobId] as const;

async function readResponse(res: Response, fallback: string): Promise<TailoringResponse> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || fallback);
  return data as TailoringResponse;
}

/** The Job's Tailoring for its current Resume, and whether one can start. */
export function useTailoring(jobId: string) {
  return useQuery<TailoringResponse>({
    queryKey: tailoringKey(jobId),
    queryFn: async () => readResponse(await fetch(`/api/jobs/${jobId}/tailoring`), "Couldn't load this Job's Tailoring."),
  });
}

/**
 * How a Tailoring is started: `runMatchReport` runs the Job's Match Report
 * first; `startOver` replaces the Tailoring the Job has.
 */
export interface StartVariables {
  runMatchReport: boolean;
  startOver: boolean;
}

const startKey = (jobId: string) => ["tailoring-start", jobId] as const;

/**
 * Starts (or starts over) the Job's Tailoring, running its Match Report first
 * when asked. It's one mutation, so it finishes even if the tab is closed.
 */
export function useStartTailoring(jobId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: startKey(jobId),
    mutationFn: async ({ runMatchReport, startOver }: StartVariables) => {
      if (runMatchReport) {
        const res = await fetch(`/api/jobs/${jobId}/analyze`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "match_analysis" }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error((data as { error?: string }).error || "Couldn't run the Match Report.");
        }
        await queryClient.invalidateQueries({ queryKey: ["jobs"] });
      }
      const res = await fetch(`/api/jobs/${jobId}/tailoring`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(startOver ? { startOver: true } : {}),
      });
      return readResponse(res, "Couldn't start tailoring. Please try again.");
    },
    onSuccess: (data) => queryClient.setQueryData(tailoringKey(jobId), data),
    onError: (err) => {
      toast.error(err.message);
      void queryClient.invalidateQueries({ queryKey: tailoringKey(jobId) });
    },
  });
}

/** What the Job's Tailoring is being started with, if it's being started now (from any tab). */
export function usePendingStart(jobId: string): StartVariables | null {
  const pending = useMutationState({
    filters: { mutationKey: startKey(jobId), status: "pending" },
    select: (mutation) => mutation.state.variables as StartVariables,
  });
  return pending.at(-1) ?? null;
}

/**
 * Saves decisions on the Job's Tailoring. The view shows each decision at
 * once; they're sent one at a time, in order, since the server saves the
 * whole list of items for each one. The server's answer is shown once no
 * other decision is waiting.
 */
export function useDecide(jobId: string) {
  const queryClient = useQueryClient();
  const queue = useRef<Promise<void>>(Promise.resolve());
  const waiting = useRef(0);

  return useCallback(
    (itemId: string, decision: Decision) => {
      const key = tailoringKey(jobId);
      queryClient.setQueryData<TailoringResponse>(key, (old) =>
        old?.tailoring ? { ...old, tailoring: withDecision(old.tailoring, itemId, decision) } : old,
      );
      waiting.current += 1;
      queue.current = queue.current.then(async () => {
        try {
          const res = await fetch(`/api/jobs/${jobId}/tailoring`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ itemId, decision }),
          });
          const data = await readResponse(res, "Couldn't save your decision. Please try again.");
          if (waiting.current === 1) queryClient.setQueryData(key, data);
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Couldn't save your decision. Please try again.");
          await queryClient.invalidateQueries({ queryKey: key });
        } finally {
          waiting.current -= 1;
        }
      });
    },
    [jobId, queryClient],
  );
}
