import type { ListedReport, ModelReport, RequirementMatch, WriteUp } from "./schema";

/** Problems with the write-up's indexes, e.g. "requirement 2 is missing". Empty when each item appears once. */
export function writeUpProblems(writeUp: WriteUp, listed: ListedReport): string[] {
  return [
    ...indexProblems("requirement", writeUp.requirements, listed.requirements.length),
    ...indexProblems("screener", writeUp.screeners, listed.screeners.length),
  ];
}

function indexProblems(kind: string, entries: { index: number }[], count: number): string[] {
  const problems: string[] = [];
  for (let i = 0; i < count; i++) {
    const times = entries.filter((e) => e.index === i).length;
    if (times === 0) problems.push(`${kind} ${i} is missing`);
    else if (times > 1) problems.push(`${kind} ${i} appears ${times} times`);
  }
  for (const e of entries) {
    if (e.index < 0 || e.index >= count) problems.push(`${kind} ${e.index} isn't in the list`);
  }
  return problems.sort();
}

/**
 * Puts the three steps of a Match Report together into the report
 * `buildMatchReport` takes: the listed Requirements and Screeners, a rating
 * per Requirement (in the listed order), and the write-up, whose entries
 * refer to the list by index.
 */
export function assembleModelReport(
  listed: ListedReport,
  ratings: RequirementMatch[],
  writeUp: WriteUp,
): ModelReport {
  if (ratings.length !== listed.requirements.length) {
    throw new Error(`${listed.requirements.length} Requirements but ${ratings.length} ratings`);
  }
  const problems = writeUpProblems(writeUp, listed);
  if (problems.length) throw new Error(`The write-up doesn't match the list: ${problems.join("; ")}`);

  return {
    overall: writeUp.overall,
    screeners: listed.screeners.map((s, i) => ({
      ...s,
      careerStoryIds: writeUp.screeners.find((e) => e.index === i)!.careerStoryIds,
    })),
    requirements: listed.requirements.map((r, i) => {
      const { evidence, action, careerStoryIds } = writeUp.requirements.find((e) => e.index === i)!;
      return { ...r, match: ratings[i], evidence, action, careerStoryIds };
    }),
    searchWords: listed.searchWords,
    firstImpression: listed.firstImpression,
    nextSteps: writeUp.nextSteps,
  };
}
