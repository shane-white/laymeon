"use client";

import { useIsMutating, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { InterviewPrepResponse } from "@/lib/interview-prep/http";
import { INTERVIEW_PREP_VERSION, SECTION_KEYS, type DeckKey, type Mark, type SectionKey } from "@/lib/interview-prep/interview-prep";
import { emptySection, emptySections } from "@/lib/interview-prep/sections";

/** The query key for a Job's Interview Prep (`user_job_listings.id`). */
export const interviewPrepKey = (jobId: string) => ["interview-prep", jobId] as const;
const sectionMutationKey = (jobId: string) => ["interview-prep-section", jobId] as const;

/** How often to check on a section researching in a request this tab didn't send (e.g. after a reload). */
const POLL_MS = 5000;

async function readResponse(res: Response, fallback: string): Promise<InterviewPrepResponse> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || fallback);
  return data as InterviewPrepResponse;
}

/** The Job's Interview Prep, and its older Interview Suggestions if it still has them. */
export function useInterviewPrep(jobId: string) {
  const sending = useIsMutating({ mutationKey: sectionMutationKey(jobId) });
  return useQuery<InterviewPrepResponse>({
    queryKey: interviewPrepKey(jobId),
    queryFn: async () => readResponse(await fetch(`/api/jobs/${jobId}/interview-prep`), "Couldn't load this Job's Interview Prep."),
    refetchInterval: (query) => {
      const prep = query.state.data?.prep;
      const researching = !!prep && SECTION_KEYS.some((key) => prep.sections[key].status === "researching");
      return researching && sending === 0 ? POLL_MS : false;
    },
  });
}

/**
 * Researches one section (Refresh), or all of them at once (`prepareAll`).
 * Each section shows "Researching…" right away and its result as soon as
 * its own request finishes.
 */
export function usePrepareSection(jobId: string) {
  const queryClient = useQueryClient();
  const key = interviewPrepKey(jobId);

  const mutation = useMutation({
    mutationKey: sectionMutationKey(jobId),
    mutationFn: async (section: SectionKey) =>
      readResponse(
        await fetch(`/api/jobs/${jobId}/interview-prep/${section}`, { method: "POST" }),
        "Couldn't research this section. Please try again.",
      ),
    onMutate: async (section) => {
      await queryClient.cancelQueries({ queryKey: key });
      queryClient.setQueryData<InterviewPrepResponse>(key, (old) => {
        const prep = old?.prep ?? { jobId, version: INTERVIEW_PREP_VERSION, sections: emptySections(), updatedAt: "" };
        const current = prep.sections[section] ?? emptySection();
        return {
          legacySuggestions: old?.legacySuggestions ?? null,
          prep: {
            ...prep,
            sections: {
              ...prep.sections,
              [section]: { ...current, status: "researching", startedAt: new Date().toISOString(), failure: null },
            },
          },
        };
      });
    },
    // Only this request's section is taken from its response: the others may
    // still be researching in their own requests.
    onSuccess: (data, section) => {
      queryClient.setQueryData<InterviewPrepResponse>(key, (old) => {
        if (!old?.prep || !data.prep) return data;
        return {
          legacySuggestions: data.legacySuggestions,
          prep: { ...old.prep, sections: { ...old.prep.sections, [section]: data.prep.sections[section] } },
        };
      });
    },
    onError: (err) => {
      toast.error(err.message);
      void queryClient.invalidateQueries({ queryKey: key });
    },
    // The jobs list knows whether there's an Interview Prep, and holds the older suggestions.
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["jobs"] }),
  });

  return {
    refresh: (section: SectionKey) => mutation.mutate(section),
    prepareAll: () => SECTION_KEYS.forEach((section) => mutation.mutate(section)),
  };
}

/**
 * The Practice operations: mark a card, More like this, add your own question
 * and write a hint again. Each response's Practice section replaces the one
 * shown; the other sections may still be researching in their own requests.
 */
export function usePracticeActions(jobId: string) {
  const queryClient = useQueryClient();
  const key = interviewPrepKey(jobId);
  const base = `/api/jobs/${jobId}/interview-prep`;

  const mutation = useMutation({
    mutationFn: async ({ url, method, body, fallback }: { url: string; method: string; body?: unknown; fallback: string }) =>
      readResponse(
        await fetch(url, {
          method,
          headers: body === undefined ? undefined : { "Content-Type": "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body),
        }),
        fallback,
      ),
    onSuccess: (data) => {
      queryClient.setQueryData<InterviewPrepResponse>(key, (old) => {
        if (!old?.prep || !data.prep) return data;
        return { ...old, prep: { ...old.prep, sections: { ...old.prep.sections, practice: data.prep.sections.practice } } };
      });
    },
    onError: (err) => {
      toast.error(err.message);
      void queryClient.invalidateQueries({ queryKey: key });
    },
  });

  return {
    pending: mutation.isPending,
    mark: (cardId: string, mark: Mark) =>
      mutation.mutate({ url: `${base}/cards/${cardId}`, method: "PATCH", body: { mark }, fallback: "Couldn't save the mark." }),
    moreLikeThis: (deck: DeckKey) =>
      mutation.mutate({ url: `${base}/decks/${deck}/more`, method: "POST", fallback: "Couldn't add more questions." }),
    addOwnQuestion: (deck: DeckKey, question: string) =>
      mutation.mutate({ url: `${base}/cards`, method: "POST", body: { deck, question }, fallback: "Couldn't add your question." }),
    writeHint: (cardId: string) =>
      mutation.mutate({ url: `${base}/cards/${cardId}/hint`, method: "POST", fallback: "Couldn't write the hint." }),
  };
}
