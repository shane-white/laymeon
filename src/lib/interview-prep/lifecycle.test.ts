import { describe, expect, it } from "vitest";
import { getInterviewPrep, prepareSection } from "./lifecycle";
import { emptySection } from "./sections";
import { buildProfile } from "@/lib/profile/build";
import { careerStoryHash } from "@/lib/profile/career-story-hash";
import { interviewPrepJob, memoryCareerStory, NOW, practiceCard, sampleData, sampleHint, scriptedGenerators, setup } from "./testing";
import type { HintExperience, InterviewPrepJob } from "./interview-prep";

describe("getInterviewPrep", () => {
  it("has no Interview Prep before the first Prepare, and shows the older suggestions", async () => {
    const { deps } = setup({ job: interviewPrepJob({ legacySuggestions: "Old advice" }) });
    expect(await getInterviewPrep(deps, "job-1")).toMatchObject({ ok: true, prep: null, legacySuggestions: "Old advice" });
  });

  it("gives the Career Story's hash now, so the Deck can tell which hints are an Earlier version", async () => {
    const profile = buildProfile([], "2026-11-01T00:00:00.000Z");
    const { deps } = setup({ careerStory: memoryCareerStory(profile) });
    expect(await getInterviewPrep(deps, "job-1")).toMatchObject({ ok: true, careerStoryHash: careerStoryHash(profile) });
  });

  it("gives no Career Story hash when the user has no Career Story", async () => {
    const { deps } = setup({ careerStory: memoryCareerStory(null) });
    expect(await getInterviewPrep(deps, "job-1")).toMatchObject({ ok: true, careerStoryHash: null });
  });

  it("fails when there's no such Job", async () => {
    const { deps } = setup();
    expect(await getInterviewPrep(deps, "job-2")).toMatchObject({ ok: false, kind: "not_found" });
  });
});

describe("getInterviewPrep: not on your resume", () => {
  const experience = (onResume: boolean | null, quote: string | null, label = "ACH payouts"): HintExperience => ({
    text: "ACH payouts at Ledgerly",
    onResume,
    backedBy: [
      {
        ref: { section: "accomplishment", key: "a1", label, byUser: quote === null },
        evidence: quote === null ? [] : [{ documentName: "Old resume", quote }],
      },
    ],
  });

  async function flagsFor(resume: InterviewPrepJob["resume"], experiences: HintExperience[]) {
    const { deps, store } = setup({ job: interviewPrepJob({ resume }) });
    const card = practiceCard({ hint: { ...sampleHint, experiences } });
    await store.saveSection("job-1", "practice", { ...emptySection(), status: "ready", researchedAt: NOW, data: { cards: [card] } });
    const result = await getInterviewPrep(deps, "job-1");
    if (!result.ok) throw new Error(result.message);
    return result.prep?.sections.practice.data?.cards[0].hint?.experiences.map((e) => e.onResume);
  }

  it("checks each experience against the Job's Resume now, so changing the Resume updates the flags", async () => {
    const resume = { name: "New resume", text: "## Experience\nBuilt ACH payouts for invoice payments." };
    expect(await flagsFor(resume, [experience(false, "Built ACH payouts for invoice payments"), experience(true, "Led a team of 12")])).toEqual([
      true,
      false,
    ]);
  });

  it("checks an item the user stated by its label", async () => {
    const resume = { name: "New resume", text: "Certified: PCI Professional" };
    expect(await flagsFor(resume, [experience(false, null, "PCI Professional"), experience(true, null, "Scrum Master")])).toEqual([true, false]);
  });

  it("flags nothing when the Job has no Resume now", async () => {
    expect(await flagsFor(null, [experience(false, "Led a team of 12")])).toEqual([null]);
  });
});

describe("prepareSection", () => {
  it("saves the section as ready, dated now, and leaves the others not started", async () => {
    const { deps } = setup();
    const result = await prepareSection(deps, "job-1", "process");
    expect(result).toMatchObject({
      ok: true,
      prep: {
        jobId: "job-1",
        sections: {
          process: { status: "ready", researchedAt: NOW, data: sampleData.process, failure: null },
          company: { status: "not_started", data: null },
          practice: { status: "not_started", data: null },
        },
      },
    });
    expect(await getInterviewPrep(deps, "job-1")).toMatchObject({ prep: { sections: { process: { status: "ready" } } } });
  });

  it("clears the older Interview Suggestions once a section is ready", async () => {
    const { deps, jobs } = setup({ job: interviewPrepJob({ legacySuggestions: "Old advice" }) });
    expect(await prepareSection(deps, "job-1", "company")).toMatchObject({ ok: true, legacySuggestions: null });
    expect(jobs.get("job-1")?.legacySuggestions).toBeNull();
  });

  it("records a failed research with its message, and keeps the older Interview Suggestions", async () => {
    const { generators } = scriptedGenerators({ company: new Error("Search timed out") });
    const { deps, jobs } = setup({ generators, job: interviewPrepJob({ legacySuggestions: "Old advice" }) });
    expect(await prepareSection(deps, "job-1", "company")).toMatchObject({
      ok: true,
      legacySuggestions: "Old advice",
      prep: { sections: { company: { status: "failed", data: null, failure: { reason: "error", message: "Search timed out" } } } },
    });
    expect(jobs.get("job-1")?.legacySuggestions).toBe("Old advice");
  });

  it("says a section that isn't built yet isn't available", async () => {
    const { generators } = scriptedGenerators({ process: "not_implemented" });
    const { deps } = setup({ generators });
    expect(await prepareSection(deps, "job-1", "process")).toMatchObject({
      prep: { sections: { process: { status: "failed", failure: { reason: "not_implemented" } } } },
    });
  });

  it("keeps the last good result and its date when a refresh fails", async () => {
    let now = NOW;
    let fail = false;
    const { generators } = scriptedGenerators();
    const failing = { ...generators, process: async (input: Parameters<typeof generators.process>[0]) => {
      if (fail) throw new Error("Search timed out");
      return generators.process(input);
    } };
    const { deps } = setup({ generators: failing, now: () => now });
    await prepareSection(deps, "job-1", "process");
    now = "2026-11-26T12:00:00.000Z";
    fail = true;
    expect(await prepareSection(deps, "job-1", "process")).toMatchObject({
      prep: { sections: { process: { status: "failed", researchedAt: NOW, data: sampleData.process } } },
    });
  });

  it("gives a refresh the section's last good result to build on", async () => {
    const { generators, calls } = scriptedGenerators();
    const { deps } = setup({ generators });
    await prepareSection(deps, "job-1", "practice");
    await prepareSection(deps, "job-1", "practice");
    expect(calls.practice.map((c) => c.previous)).toEqual([null, sampleData.practice]);
  });

  it("gives Practice the Career Story, and the other sections none", async () => {
    const story = buildProfile([], "2026-11-01T00:00:00.000Z");
    const { generators, calls } = scriptedGenerators();
    const { deps } = setup({ generators, careerStory: memoryCareerStory(story) });
    await prepareSection(deps, "job-1", "practice");
    await prepareSection(deps, "job-1", "process");
    expect(calls.practice[0].careerStory).toBe(story);
    expect(calls.process[0].careerStory).toBeNull();
  });

  it("fails Practice without running it when the user has no Career Story", async () => {
    const { generators, calls } = scriptedGenerators();
    const { deps } = setup({ generators, careerStory: memoryCareerStory(null) });
    expect(await prepareSection(deps, "job-1", "practice")).toMatchObject({
      prep: { sections: { practice: { status: "failed", failure: { reason: "no_career_story" } } } },
    });
    expect(calls.practice).toEqual([]);
  });

  it("works without a Resume", async () => {
    const { deps } = setup({ job: interviewPrepJob({ resume: null }) });
    expect(await prepareSection(deps, "job-1", "process")).toMatchObject({ prep: { sections: { process: { status: "ready" } } } });
  });

  it("fails when there's no such Job", async () => {
    const { deps } = setup();
    expect(await prepareSection(deps, "job-2", "process")).toMatchObject({ ok: false, kind: "not_found" });
  });

  it("doesn't start a section that's already researching", async () => {
    const { deps, store } = setup();
    await store.saveSection("job-1", "process", { ...emptySection(), status: "researching", startedAt: NOW });
    expect(await prepareSection(deps, "job-1", "process")).toMatchObject({ ok: false, kind: "already_researching" });
  });

  it("restarts a section stuck researching past the time limit", async () => {
    const { deps, store } = setup();
    await store.saveSection("job-1", "process", { ...emptySection(), status: "researching", startedAt: "2026-11-25T11:50:00.000Z" });
    expect(await prepareSection(deps, "job-1", "process")).toMatchObject({ prep: { sections: { process: { status: "ready" } } } });
  });
});

describe("getInterviewPrep with a section stuck researching", () => {
  it("shows it as failed once it's past the time limit", async () => {
    const { deps, store } = setup();
    await store.saveSection("job-1", "company", { ...emptySection(), status: "researching", startedAt: "2026-11-25T11:50:00.000Z" });
    expect(await getInterviewPrep(deps, "job-1")).toMatchObject({
      prep: { sections: { company: { status: "failed", startedAt: null, failure: { reason: "error" } } } },
    });
  });

  it("still shows it researching within the time limit", async () => {
    const { deps, store } = setup();
    await store.saveSection("job-1", "company", { ...emptySection(), status: "researching", startedAt: "2026-11-25T11:58:00.000Z" });
    expect(await getInterviewPrep(deps, "job-1")).toMatchObject({ prep: { sections: { company: { status: "researching" } } } });
  });
});
