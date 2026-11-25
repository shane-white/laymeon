/** The offer, shown when a Job moves to Interviewing. */
export const INTERVIEW_PREP_OFFER = "Want to start preparing? We'll look up their interview process and recent news.";

interface StatusChange {
  from: string;
  to: string;
  hasInterviewPrep: boolean;
}

/**
 * Whether to offer to start Interview Prep after a Job's status changes. We
 * only offer: Prepare costs searches and tokens, so it never runs on its own.
 */
export function shouldOfferInterviewPrep({ from, to, hasInterviewPrep }: StatusChange): boolean {
  return to === "interviewing" && from !== "interviewing" && !hasInterviewPrep;
}
