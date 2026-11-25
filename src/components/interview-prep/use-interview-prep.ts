"use client";

import { useIsMutating, useMutation, useMutationState, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { InterviewPrepResponse } from "@/lib/interview-prep/http";
import { INTERVIEW_PREP_VERSION, SECTION_KEYS, type DeckKey, type Mark, type PracticeCard, type SectionKey } from "@/lib/interview-prep/interview-prep";
import { hasEarlierHint, hintIsWriting } from "@/lib/interview-prep/practice/cards";
import { emptySection, emptySections } from "@/lib/interview-prep/sections";

/** The query key for a Job's Interview Prep (`user_job_listings.id`). */
export const interviewPrepKey = (jobId: string) => ["interview-prep", jobId] as const;
const sectionMutationKey = (jobId: string) => ["interview-prep-section", jobId] as const;
const practiceMutationKey = (jobId: string) => ["interview-prep-practice", jobId] as const;
const moreMutationKey = (jobId: string) => ["interview-prep-practice-more", jobId] as const;
const hintsMutationKey = (jobId: string) => ["interview-prep-practice-hints", jobId] as const;

/** The Practice requests running now, of every kind. */
const practiceKeys = (jobId: string) => [practiceMutationKey(jobId), moreMutationKey(jobId), hintsMutationKey(jobId)];

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
  const changingPractice =
    useIsMutating({ mutationKey: practiceMutationKey(jobId) }) +
    useIsMutating({ mutationKey: moreMutationKey(jobId) }) +
    useIsMutating({ mutationKey: hintsMutationKey(jobId) });
  return useQuery<InterviewPrepResponse>({
    queryKey: interviewPrepKey(jobId),
    queryFn: async () => readResponse(await fetch(`/api/jobs/${jobId}/interview-prep`), "Couldn't load this Job's Interview Prep."),
    refetchInterval: (query) => {
      const prep = query.state.data?.prep;
      const researching = !!prep && SECTION_KEYS.some((key) => prep.sections[key].status === "researching");
      if (researching && sending === 0) return POLL_MS;
      // A hint being written in a request this tab didn't send (e.g. after a reload).
      const now = new Date().toISOString();
      const writingHint = !!prep?.sections.practice.data?.cards.some((card) => hintIsWriting(card, now));
      return writingHint && changingPractice === 0 ? POLL_MS : false;
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
          careerStoryHash: old?.careerStoryHash ?? null,
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
          careerStoryHash: data.careerStoryHash,
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


/** The ID prefix of an own question shown before the server has saved it. */
const UNSAVED_PREFIX = "adding-";

/** Whether a card is saved, so it can be marked, removed or have its hint written again. */
export const isSaved = (card: Pick<PracticeCard, "id">) => !card.id.startsWith(UNSAVED_PREFIX);

type PracticeRequest = { url: string; method: string; body?: unknown; fallback: string };

async function sendPractice({ url, method, body, fallback }: PracticeRequest): Promise<InterviewPrepResponse> {
  return readResponse(
    await fetch(url, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    fallback,
  );
}

/**
 * The Practice operations: mark a card, remove one, More like this, add your
 * own question, write a hint again, and Update hints. Marks, removals and own questions show
 * straight away. A response's Practice section replaces the one shown only
 * when no other Practice request is still running, since the last one to
 * finish saw every change; the other sections may still be researching in
 * their own requests.
 */
export function usePracticeActions(jobId: string) {
  const queryClient = useQueryClient();
  const key = interviewPrepKey(jobId);
  const base = `/api/jobs/${jobId}/interview-prep`;

  const changeCards = (change: (cards: PracticeCard[]) => PracticeCard[]) =>
    queryClient.setQueryData<InterviewPrepResponse>(key, (old) => {
      const practice = old?.prep?.sections.practice;
      if (!old?.prep || !practice?.data) return old;
      const next = { ...practice, data: { cards: change(practice.data.cards) } };
      return { ...old, prep: { ...old.prep, sections: { ...old.prep.sections, practice: next } } };
    });

  const callbacks = {
    onSuccess: (data: InterviewPrepResponse) => {
      const running = practiceKeys(jobId).reduce((n, mutationKey) => n + queryClient.isMutating({ mutationKey }), 0);
      // This request is still counted as running here.
      if (running > 1) {
        // The Career Story's hash doesn't depend on the cards, so it's taken from any response.
        queryClient.setQueryData<InterviewPrepResponse>(key, (old) => old && { ...old, careerStoryHash: data.careerStoryHash });
        return;
      }
      queryClient.setQueryData<InterviewPrepResponse>(key, (old) => {
        if (!old?.prep || !data.prep) return data;
        return {
          ...old,
          careerStoryHash: data.careerStoryHash,
          prep: { ...old.prep, sections: { ...old.prep.sections, practice: data.prep.sections.practice } },
        };
      });
    },
    onError: (err: Error) => {
      toast.error(err.message);
      void queryClient.invalidateQueries({ queryKey: key });
    },
  };

  const mutation = useMutation({
    mutationKey: practiceMutationKey(jobId),
    mutationFn: ({ request }: { request: PracticeRequest; optimistic?: () => void }) => sendPractice(request),
    onMutate: async ({ optimistic }) => {
      if (!optimistic) return;
      await queryClient.cancelQueries({ queryKey: key });
      optimistic();
    },
    ...callbacks,
  });

  const more = useMutation({
    mutationKey: moreMutationKey(jobId),
    mutationFn: (deck: DeckKey) => sendPractice({ url: `${base}/decks/${deck}/more`, method: "POST", fallback: "Couldn't add more questions." }),
    ...callbacks,
  });

  // Update hints: the cards whose hint is an Earlier version show "Writing a hint…" until it's done.
  const hints = useMutation({
    mutationKey: hintsMutationKey(jobId),
    mutationFn: () => sendPractice({ url: `${base}/hints`, method: "POST", fallback: "Couldn't update the hints." }),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: key });
      const hash = queryClient.getQueryData<InterviewPrepResponse>(key)?.careerStoryHash ?? null;
      const asked = new Date().toISOString();
      changeCards((cards) => cards.map((c) => (hasEarlierHint(c, hash) ? { ...c, hintStatus: "writing", hintRequestedAt: asked } : c)));
    },
    ...callbacks,
  });

  const addingMore = useMutationState({
    filters: { mutationKey: moreMutationKey(jobId), status: "pending" },
    select: (m) => m.state.variables as DeckKey,
  });

  return {
    /** The Decks More like this is adding cards to now. */
    addingMore,
    /** Whether Update hints is running. */
    updatingHints: hints.isPending,
    updateHints: () => hints.mutate(),
    mark: (cardId: string, mark: Mark) =>
      mutation.mutate({
        request: { url: `${base}/cards/${cardId}`, method: "PATCH", body: { mark }, fallback: "Couldn't save the mark." },
        optimistic: () => changeCards((cards) => cards.map((c) => (c.id === cardId ? { ...c, mark } : c))),
      }),
    remove: (cardId: string) =>
      mutation.mutate({
        request: { url: `${base}/cards/${cardId}`, method: "DELETE", fallback: "Couldn't remove the card." },
        optimistic: () => changeCards((cards) => cards.filter((c) => c.id !== cardId)),
      }),
    moreLikeThis: (deck: DeckKey) => more.mutate(deck),
    // Shown at once as "Writing a hint…"; the response replaces it with the saved card.
    addOwnQuestion: (deck: DeckKey, question: string) =>
      mutation.mutate({
        request: { url: `${base}/cards`, method: "POST", body: { deck, question }, fallback: "Couldn't add your question." },
        optimistic: () =>
          changeCards((cards) => [
            ...cards,
            {
              id: `${UNSAVED_PREFIX}${crypto.randomUUID()}`,
              deck,
              question: question.trim(),
              own: true,
              mark: "not_tried",
              hint: null,
              hintStatus: "writing",
              hintRequestedAt: new Date().toISOString(),
              hintBasis: null,
            },
          ]),
      }),
    writeHint: (cardId: string) =>
      mutation.mutate({
        request: { url: `${base}/cards/${cardId}/hint`, method: "POST", fallback: "Couldn't write the hint." },
        optimistic: () =>
          changeCards((cards) =>
            cards.map((c) => (c.id === cardId ? { ...c, hintStatus: "writing", hintRequestedAt: new Date().toISOString() } : c)),
          ),
      }),
  };
}
