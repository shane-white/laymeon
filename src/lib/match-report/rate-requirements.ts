/**
 * Jev rates each Requirement of a Match Report against the resume. Everything
 * sent to Jev lives here: the model, the state, the question wording and the
 * level descriptions. Server only: it uses TYPESAFE_API_KEY.
 */
import {
  score,
  TypeSafeClient,
  type Questions,
  type ScoreQuestion,
  type SystemOneRequest,
  type SystemOneResult,
  type Usage,
} from "@typesafe-ai/sdk";
import type { ListedReport, RequirementMatch } from "./schema";

/** Pinned rather than `jev-latest`, so a new Jev release can't change ratings unnoticed. */
export const JEV_MODEL = "jev-1.14.0";

/**
 * The levels from low to high, and what each one means, as Jev reads them.
 * The write-up prompt quotes the same descriptions, so both steps mean the same thing.
 */
export const LEVELS: { match: RequirementMatch; description: string }[] = [
  { match: "missing", description: "Nothing on the resume shows this or anything close to it." },
  { match: "partial", description: "The resume shows related experience, or only implies it." },
  {
    match: "strong",
    description: "The resume clearly shows this, possibly under a different name or a specific tool that counts as it.",
  },
];

function question(requirement: string): ScoreQuestion {
  return score(
    `How well does \`resume\` show this requirement: ${requirement}?`,
    LEVELS.map((l) => l.description) as [string, string, ...string[]],
  );
}

const questionId = (index: number) => `requirement_${index}`;

/** The minimal client this module needs; `TypeSafeClient` fits it, and tests pass a fake. */
export interface JevClient {
  systemOne(request: SystemOneRequest<Questions>): PromiseLike<SystemOneResult<Questions>>;
}

export interface RequirementRating {
  match: RequirementMatch;
  /** Jev's probability for each level, kept so evals can see split answers. */
  probabilities: Record<RequirementMatch, number>;
}

export interface RatingResult {
  ratings: RequirementRating[];
  /** The request as sent, so any result can be rerun. Null when there was nothing to rate. */
  request: SystemOneRequest<Questions> | null;
  /** The versioned model that answered. */
  model: string | null;
  usage: Usage | null;
}

export interface RateInput {
  resume: string;
  /** The Job's title, as the user sees it. */
  jobTitle: string;
  requirements: ListedReport["requirements"];
}

let defaultClient: TypeSafeClient | undefined;

/**
 * Rates every Requirement in one Jev request, in the listed order. Each rating
 * is the level with the highest probability. A failed call or a Requirement
 * without an answer throws, so a failure is never shown as Missing.
 */
export async function rateRequirements(input: RateInput, client?: JevClient): Promise<RatingResult> {
  const { resume, jobTitle, requirements } = input;
  if (requirements.length === 0) return { ratings: [], request: null, model: null, usage: null };

  const request: SystemOneRequest<Questions> = {
    model: JEV_MODEL,
    // A Job without a title sends only the resume, rather than an empty field Jev might read as a signal.
    state: jobTitle.trim() ? { resume, job_title: jobTitle } : { resume },
    questions: Object.fromEntries(requirements.map((r, i) => [questionId(i), question(r.text)])),
  };
  const jev = client ?? (defaultClient ??= new TypeSafeClient());
  const response = await jev.systemOne(request);

  const ratings = requirements.map((r, i) => {
    const answer = response.answers[questionId(i)];
    if (answer?.type !== "score") throw new Error(`Jev didn't rate the requirement "${r.text}"`);
    const byLevel = answer.probabilities as Record<number, number | undefined>;
    const probabilities = Object.fromEntries(LEVELS.map((l, level) => [l.match, byLevel[level] ?? 0])) as Record<
      RequirementMatch,
      number
    >;
    // A tie goes to the lower level, so a split answer never overstates the match.
    const top = LEVELS.reduce((best, l) => (probabilities[l.match] > probabilities[best.match] ? l : best));
    return { match: top.match, probabilities };
  });

  return { ratings, request, model: response.model, usage: response.usage };
}
