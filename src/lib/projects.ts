/** Limits and guidance shared by the Example Works UI and API. */

export const MAX_PROJECTS = 50;
export const MAX_PROJECT_TITLE_LENGTH = 200;
export const MAX_PROJECT_DESCRIPTION_LENGTH = 10000;

/**
 * Why a written Example Work can't be added as it is, or null if it can.
 * Pass its title and description already trimmed.
 */
export function writtenExampleWorkProblem({ title, description }: { title: string; description: string }): string | null {
  if (!title) return "Give the project a title";
  if (!description) return "Describe the project";
  if (title.length > MAX_PROJECT_TITLE_LENGTH) return `Titles can be up to ${MAX_PROJECT_TITLE_LENGTH} characters`;
  if (description.length > MAX_PROJECT_DESCRIPTION_LENGTH) {
    return `Descriptions can be up to ${MAX_PROJECT_DESCRIPTION_LENGTH.toLocaleString("en-US")} characters`;
  }
  return null;
}

export const PROJECT_PROMPT = "Describe a project you've worked on that you're proud of.";

// Based on the STAR method (situation, task, action, result) that career
// services recommend for describing accomplishments.
export const PROJECT_GUIDANCE = [
  "The problem or goal, and why it mattered",
  "What you did yourself (say “I”, not just “we”)",
  "The obstacles you had to overcome",
  "Measurable outcomes: numbers, percentages, time or money saved",
  "The skills and tools you used",
] as const;
