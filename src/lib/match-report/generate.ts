import type Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { anthropic, CLAUDE_MODEL, getResponseText } from "@/lib/anthropic/client";
import { formatCareerStoryForPrompt, type CareerStoryContext } from "@/lib/profile/for-prompt";
import type { CareerProfile } from "@/lib/profile/schema";
import { assembleModelReport, writeUpProblems } from "./assemble";
import { buildMatchReport } from "./build";
import { LEVELS, rateRequirements, type RatingResult } from "./rate-requirements";
import {
  listedReportSchema,
  writeUpSchema,
  type ListedReport,
  type MatchReport,
  type RequirementMatch,
  type WriteUp,
} from "./schema";

const PLAIN_LANGUAGE = "The reader may never have thought about recruiting. Use plain, friendly language with no jargon.";

const REQUIREMENTS_RULE =
  "Requirements: list every distinct requirement in the posting, one per entry. Mark must_have only when the posting says it is required (required, must, minimum, or listed under requirements/qualifications); preferred, bonus, plus, or nice-to-have items are nice_to_have.";

const SCREENERS_RULE =
  "Screeners: include only hard requirements the posting actually states that a resume is expected to show: minimum years of experience, degree, license or certification, security clearance, or a required location for an on-site or region-limited job. Leave the list empty if there are none.";

const ELIGIBILITY_QUESTIONS =
  "eligibility questions applicants answer for themselves, which resumes don't usually cover: work authorization, visa sponsorship, citizenship or residency status, criminal history, background checks, drug tests, age, or willingness to travel, relocate or work certain shifts";

const SEARCH_WORDS_RULE =
  "Search words: pick the 8–12 terms a recruiter would most likely type into an ATS search for this job, using the posting's exact wording (skills, tools, job titles, certifications). For each term, if the resume doesn't use that exact wording, list the resume's own wordings for it, copied verbatim from the resume, and say whether each is the same thing in different words or related but not the same. Exact matches are checked in code, so don't guess whether a term is present.";

const QUOTE_RULE =
  "copy a short quote from the resume exactly, character for character. Do not paraphrase, fix typos, or join separate lines.";

const NO_CLAIMS_RULE =
  'Actions and next steps: never suggest claiming skills or experience the candidate may not have. Phrase wording suggestions as "If true, add…".';

const CONSISTENCY_RULE = "Be consistent: the same resume and posting should always produce the same assessment.";

/** Step 1 of the pipeline: list what the posting asks for. It doesn't see the Career Story. */
const LIST_SYSTEM_PROMPT = `You read a job posting and a candidate's resume the way applicant tracking systems (ATS) and recruiters do, and list what the posting asks for. Another step rates each requirement against the resume, so don't rate requirements here.

${PLAIN_LANGUAGE}

Rules:
- ${REQUIREMENTS_RULE}
- ${SCREENERS_RULE} For each screener, say whether the resume clearly shows it, judging only what is written on the resume, and ${QUOTE_RULE} Without a quote that shows it, it isn't shown.
- Never include ${ELIGIBILITY_QUESTIONS}. Don't list them as screeners, requirements or search words.
- ${SEARCH_WORDS_RULE}
- First impression: judge only what is written on the resume.
- ${CONSISTENCY_RULE}`;

/** Step 3 of the pipeline: write up the rated Requirements. */
const WRITE_UP_SYSTEM_PROMPT = `You write up a match report comparing a candidate's resume to a job posting. Each requirement in the posting has already been rated against the resume:
${[...LEVELS].reverse().map((l) => `- ${l.match}: ${l.description}`).join("\n")}
Each screener has already been marked shown or not shown. The ratings and screeners are final: explain them, don't re-judge them.

${PLAIN_LANGUAGE}

Rules:
- Overall reason: one sentence on why the resume does or doesn't match this job, consistent with the ratings.
- Top fixes and next steps: start with must-haves that aren't strong.
- Evidence: for a strong or partial requirement, ${QUOTE_RULE} Pick the quote that best supports the rating. Use null for missing requirements, or when no single quote supports it.
- Actions: for a partial or missing requirement, one line on what to do. Null for strong.
- ${NO_CLAIMS_RULE}
- Never mention ${ELIGIBILITY_QUESTIONS}: not in fixes or next steps.
- Career Story: the candidate may also have a Career Story, built from their other documents and their own edits. It is not the resume. Never use it for evidence. Use it only to fill careerStoryIds: for a requirement that isn't strong, or a screener that isn't shown, list the IDs of Career Story items that clearly show the candidate has it, most relevant first, or an empty list. For years-of-experience requirements and screeners, use the "Time in each role" items (R1, R2…) and the jobs' dates. Items marked "stated by the candidate" are the candidate's own statement and count the same. When an item shows a requirement, the action should suggest adding it to this resume, still phrased "If true, add…". Without a Career Story, leave every careerStoryIds empty.
- Give one requirements entry per rated requirement and one screeners entry per screener, with its number as the index.`;

/** The write-up model. Haiku 5.5 was tried in LAY-91 and dropped Career Story links, so it stays on CLAUDE_MODEL. */
const WRITE_UP_MODEL = CLAUDE_MODEL;

/** One Claude call made while generating a Match Report, reported for evals and logs. */
export interface MatchReportStep {
  step: "list" | "write_up";
  model: string;
  usage: Anthropic.Usage;
}

export interface GenerateOptions {
  /** Called after each Claude call. */
  onStep?: (step: MatchReportStep) => void;
  /** Called with Jev's ratings, the request as sent and the model that answered. */
  onRating?: (result: RatingResult) => void;
  /** Overrides the write-up model, to compare models in the eval. */
  writeUpModel?: string;
}

interface StructuredCall<T> {
  step: MatchReportStep["step"];
  model: string;
  system: string;
  schema: z.ZodType<T>;
  /** Problems the schema can't catch; any make the call retry once like a schema failure. */
  check?: (data: T) => string[];
}

type Attempt<T> = { response: Anthropic.Message; data: T | null; problems: string };

async function attempt<T>(
  call: StructuredCall<T>,
  messages: Anthropic.MessageParam[],
  options: GenerateOptions,
): Promise<Attempt<T>> {
  const response = await anthropic.messages.create({
    model: call.model,
    // Thinking counts toward max_tokens alongside the answer itself.
    max_tokens: 16000,
    system: call.system,
    output_config: { effort: "medium", format: zodOutputFormat(call.schema) },
    messages,
  });
  options.onStep?.({ step: call.step, model: response.model, usage: response.usage });

  if (response.stop_reason === "max_tokens") {
    throw new Error("The match report was too long to generate");
  }

  let output: unknown;
  try {
    output = JSON.parse(getResponseText(response));
  } catch {
    output = undefined;
  }
  const parsed = call.schema.safeParse(output);
  if (!parsed.success) return { response, data: null, problems: z.prettifyError(parsed.error) };
  const problems = call.check?.(parsed.data) ?? [];
  if (problems.length) return { response, data: null, problems: problems.map((p) => `- ${p}`).join("\n") };
  return { response, data: parsed.data, problems: "" };
}

/** Asks Claude for structured output, retrying once if it fails validation. */
async function requestStructured<T>(call: StructuredCall<T>, content: string, options: GenerateOptions): Promise<T> {
  const messages: Anthropic.MessageParam[] = [{ role: "user", content }];
  const first = await attempt(call, messages, options);
  if (first.data) return first.data;

  // Send the whole first answer back unchanged (thinking blocks included), then the errors.
  const retry = await attempt(
    call,
    [
      ...messages,
      { role: "assistant", content: first.response.content },
      {
        role: "user",
        content: `Your answer has these problems. Fix them and return the full answer again:\n${first.problems}`,
      },
    ],
    options,
  );
  if (retry.data) return retry.data;

  throw new Error("Claude returned a match report that didn't match the expected format");
}

function resumeAndPosting(resume: string, jobDescription: string): string {
  return `## Resume

${resume}

---

## Job posting

${jobDescription}`;
}

function careerStorySection(careerStory?: CareerStoryContext): string {
  return `## Career Story (not the resume)

${careerStory?.text || "No Career Story."}`;
}

/** Step 1: lists the Requirements and Screeners, Search words and first impression. */
export function listRequirements(
  resume: string,
  jobDescription: string,
  options: GenerateOptions = {},
): Promise<ListedReport> {
  return requestStructured(
    { step: "list", model: CLAUDE_MODEL, system: LIST_SYSTEM_PROMPT, schema: listedReportSchema },
    resumeAndPosting(resume, jobDescription),
    options,
  );
}

function ratedList(listed: ListedReport, ratings: RequirementMatch[]): string {
  const requirements = listed.requirements
    .map((r, i) => `${i}. [${r.importance}, ${ratings[i]}] ${r.text}`)
    .join("\n");
  const screeners = listed.screeners
    .map((s, i) => `${i}. [${s.shown ? "shown" : "not shown"}] ${s.item}`)
    .join("\n");
  return `## Rated requirements

${requirements}

## Screeners

${screeners || "None."}`;
}

/** Step 3: writes up the rated Requirements. */
export function writeUp(
  resume: string,
  jobDescription: string,
  listed: ListedReport,
  ratings: RequirementMatch[],
  careerStory?: CareerStoryContext,
  options: GenerateOptions = {},
): Promise<WriteUp> {
  const content = [resumeAndPosting(resume, jobDescription), careerStorySection(careerStory), ratedList(listed, ratings)].join(
    "\n\n---\n\n",
  );
  return requestStructured(
    {
      step: "write_up",
      model: options.writeUpModel ?? WRITE_UP_MODEL,
      system: WRITE_UP_SYSTEM_PROMPT,
      schema: writeUpSchema,
      check: (data) => writeUpProblems(data, listed),
    },
    content,
    options,
  );
}

export interface MatchReportInput {
  resume: string;
  jobDescription: string;
  /** The Job's title, as the user sees it. */
  jobTitle: string;
  profile?: CareerProfile | null;
}

/**
 * Generates a match report in three steps: Claude lists the Requirements, Jev
 * rates each one, and Claude writes up the rated list. Code then verifies the
 * Evidence and computes the label. With the user's Career Story, the report
 * also shows where it covers requirements the resume doesn't. If any step
 * fails, the whole report fails.
 */
export async function generateMatchReport(
  input: MatchReportInput,
  options: GenerateOptions = {},
): Promise<MatchReport> {
  const { resume, jobDescription, jobTitle, profile } = input;
  const careerStory = profile ? formatCareerStoryForPrompt(profile) : undefined;
  const listed = await listRequirements(resume, jobDescription, options);
  const rating = await rateRequirements({ resume, jobTitle, requirements: listed.requirements });
  options.onRating?.(rating);
  const ratings = rating.ratings.map((r) => r.match);
  const written = await writeUp(resume, jobDescription, listed, ratings, careerStory, options);
  return buildMatchReport(assembleModelReport(listed, ratings, written), resume, careerStory);
}
