import { describe, expect, it } from "vitest";
import { getTailoring, startOver, startTailoring } from "./lifecycle";
import { memoryCareerStory, memoryExampleWorks, memoryJobs, memoryTailoringStore, scriptedSteps, tailoringJob } from "./testing";
import type { TailoringJob } from "./tailoring";

function setup(job: TailoringJob = tailoringJob(), steps = scriptedSteps({ markdown: "## Experience" })) {
  const jobs = memoryJobs(job);
  const store = memoryTailoringStore();
  return { deps: { jobs, store, steps, careerStory: memoryCareerStory(), exampleWorks: memoryExampleWorks() }, jobs, store, steps };
}

describe("getTailoring", () => {
  it("has no Tailoring before one is started, and says it can start", async () => {
    const { deps } = setup();
    expect(await getTailoring(deps, "job-1")).toEqual({
      ok: true,
      tailoring: null,
      earlierVersion: false,
      startBlocker: null,
    });
  });

  it("says why a Tailoring can't be started", async () => {
    const { deps } = setup(tailoringJob({ matchReport: null }));
    expect(await getTailoring(deps, "job-1")).toMatchObject({ ok: true, tailoring: null, startBlocker: "no_match_report" });
  });

  it("fails when there's no such Job", async () => {
    const { deps } = setup();
    expect(await getTailoring(deps, "job-2")).toMatchObject({ ok: false, kind: "not_found" });
  });

  it("gets the started Tailoring, which isn't an Earlier version", async () => {
    const { deps } = setup();
    await startTailoring(deps, "job-1");
    expect(await getTailoring(deps, "job-1")).toMatchObject({
      ok: true,
      tailoring: { jobId: "job-1", resumeId: "resume-1", markdown: "## Experience" },
      earlierVersion: false,
      startBlocker: null,
    });
  });

  it("is an Earlier version once the Match Report has been rerun", async () => {
    const { deps, jobs } = setup();
    await startTailoring(deps, "job-1");
    const job = tailoringJob();
    jobs.set({ ...job, matchReport: { ...job.matchReport!, generatedAt: "2026-11-05T00:00:00.000Z" } });
    expect(await getTailoring(deps, "job-1")).toMatchObject({
      tailoring: { markdown: "## Experience" },
      earlierVersion: true,
      startBlocker: null,
    });
  });

  it("is an Earlier version once the Resume's Source material has changed", async () => {
    const { deps, jobs } = setup();
    await startTailoring(deps, "job-1");
    const job = tailoringJob();
    jobs.set({ ...job, resume: { ...job.resume!, contentHash: "hash-2" } });
    expect(await getTailoring(deps, "job-1")).toMatchObject({
      tailoring: { markdown: "## Experience" },
      earlierVersion: true,
      startBlocker: "match_report_earlier_version",
    });
  });

  it("brings back a Resume's Tailoring when the Job switches back to it", async () => {
    const { deps, jobs } = setup();
    await startTailoring(deps, "job-1");
    const other = { id: "resume-2", name: "Data Resume", text: "Data", contentHash: "hash-9", updatedAt: "2026-11-01T00:00:00.000Z" };
    jobs.set(tailoringJob({ resume: other }));
    expect(await getTailoring(deps, "job-1")).toMatchObject({ tailoring: null });

    jobs.set(tailoringJob());
    expect(await getTailoring(deps, "job-1")).toMatchObject({ tailoring: { resumeId: "resume-1" }, earlierVersion: false });
  });
});

describe("startTailoring", () => {
  it("saves a Tailoring for the Job and its Resume, with the Resume as structured Markdown", async () => {
    const { deps, store, steps } = setup();

    const result = await startTailoring(deps, "job-1");

    expect(steps.structured).toEqual(["Jane Doe\nProduct Manager at Ledgerly 2020-2024\n- Shipped billing"]);
    expect(result).toMatchObject({
      ok: true,
      earlierVersion: false,
      startBlocker: null,
      tailoring: {
        jobId: "job-1",
        resumeId: "resume-1",
        version: 1,
        markdown: "## Experience",
        items: [],
        matchReportGeneratedAt: "2026-11-02T00:00:00.000Z",
        resumeContentHash: "hash-1",
      },
    });
    expect(store.tailorings()).toHaveLength(1);
  });

  it("fails when there's no such Job", async () => {
    const { deps, store } = setup();
    expect(await startTailoring(deps, "job-2")).toMatchObject({ ok: false, kind: "not_found" });
    expect(store.tailorings()).toEqual([]);
  });

  it("needs the Job's Resume, with text read from it", async () => {
    for (const resume of [null, { ...tailoringJob().resume!, text: null }, { ...tailoringJob().resume!, text: "  " }]) {
      const { deps, store, steps } = setup(tailoringJob({ resume }));
      expect(await startTailoring(deps, "job-1")).toMatchObject({ ok: false, kind: "no_resume" });
      expect(steps.structured).toEqual([]);
      expect(store.tailorings()).toEqual([]);
    }
  });

  it("needs a Match Report", async () => {
    const { deps, steps } = setup(tailoringJob({ matchReport: null }));
    expect(await startTailoring(deps, "job-1")).toMatchObject({ ok: false, kind: "no_match_report" });
    expect(steps.structured).toEqual([]);
  });

  describe("needs a Match Report that isn't an Earlier version", () => {
    const current = tailoringJob();
    const cases: [string, TailoringJob][] = [
      ["it compared another Resume", tailoringJob({ matchReport: { ...current.matchReport!, resumeId: "resume-2" } })],
      [
        "the Resume's Source material has changed since",
        tailoringJob({ resume: { ...current.resume!, contentHash: "hash-2" } }),
      ],
      [
        "it has no recorded Source material and the Resume changed after it was made",
        tailoringJob({
          resume: { ...current.resume!, updatedAt: "2026-11-03T00:00:00.000Z" },
          matchReport: { ...current.matchReport!, resumeContentHash: null },
        }),
      ],
    ];
    for (const [name, job] of cases) {
      it(`not when ${name}`, async () => {
        const { deps, steps } = setup(job);
        expect(await startTailoring(deps, "job-1")).toMatchObject({ ok: false, kind: "match_report_earlier_version" });
        expect(steps.structured).toEqual([]);
      });
    }

    it("accepts one with no recorded Source material when the Resume hasn't changed since", async () => {
      const { deps } = setup(tailoringJob({ matchReport: { ...current.matchReport!, resumeContentHash: null } }));
      expect(await startTailoring(deps, "job-1")).toMatchObject({ ok: true });
    });
  });
});

describe("starting when there's already a Tailoring", () => {
  it("keeps the saved Tailoring instead of making another", async () => {
    const { deps, store, steps } = setup();
    const first = await startTailoring(deps, "job-1");

    const again = await startTailoring(deps, "job-1");

    expect(steps.structured).toHaveLength(1);
    expect(again).toEqual(first);
    expect(store.tailorings()).toHaveLength(1);
  });
});

describe("startOver", () => {
  it("replaces the Job's Tailoring with a new one from the current Match Report and Resume", async () => {
    const { deps, jobs, store, steps } = setup();
    await startTailoring(deps, "job-1");
    const job = tailoringJob();
    jobs.set({
      ...job,
      resume: { ...job.resume!, text: "New text", contentHash: "hash-2" },
      matchReport: { ...job.matchReport!, generatedAt: "2026-11-05T00:00:00.000Z", resumeContentHash: "hash-2" },
    });

    const result = await startOver(deps, "job-1");

    expect(steps.structured).toEqual([expect.any(String), "New text"]);
    expect(result).toMatchObject({
      ok: true,
      earlierVersion: false,
      tailoring: { matchReportGeneratedAt: "2026-11-05T00:00:00.000Z", resumeContentHash: "hash-2" },
    });
    expect(store.tailorings()).toHaveLength(1);
    expect(await getTailoring(deps, "job-1")).toMatchObject({ earlierVersion: false });
  });

  it("needs a Match Report that isn't an Earlier version, and keeps the old Tailoring when it can't", async () => {
    const { deps, jobs, store } = setup();
    await startTailoring(deps, "job-1");
    const job = tailoringJob();
    jobs.set({ ...job, resume: { ...job.resume!, contentHash: "hash-2" } });

    expect(await startOver(deps, "job-1")).toMatchObject({ ok: false, kind: "match_report_earlier_version" });
    expect(store.tailorings()).toMatchObject([{ resumeContentHash: "hash-1" }]);
  });
});

describe("when a step or the store fails", () => {
  it("saves nothing when the Resume can't be structured", async () => {
    const { deps, store } = setup(tailoringJob(), scriptedSteps({ markdown: new Error("Claude is down") }));
    expect(await startTailoring(deps, "job-1")).toMatchObject({ ok: false, kind: "step_failed" });
    expect(store.tailorings()).toEqual([]);
  });

  it("saves nothing when the structured Markdown is empty", async () => {
    const { deps, store } = setup(tailoringJob(), scriptedSteps({ markdown: "  \n" }));
    expect(await startTailoring(deps, "job-1")).toMatchObject({ ok: false, kind: "step_failed" });
    expect(store.tailorings()).toEqual([]);
  });

  it("fails when the Tailoring can't be saved", async () => {
    const deps = { jobs: memoryJobs(tailoringJob()), store: memoryTailoringStore({ failSave: true }), steps: scriptedSteps(), careerStory: memoryCareerStory(), exampleWorks: memoryExampleWorks() };
    expect(await startTailoring(deps, "job-1")).toMatchObject({ ok: false, kind: "save_failed" });
  });

  it("fails when the Tailoring can't be loaded", async () => {
    const deps = { jobs: memoryJobs(tailoringJob()), store: memoryTailoringStore({ failFind: true }), steps: scriptedSteps(), careerStory: memoryCareerStory(), exampleWorks: memoryExampleWorks() };
    expect(await getTailoring(deps, "job-1")).toMatchObject({ ok: false, kind: "save_failed" });
    expect(await startTailoring(deps, "job-1")).toMatchObject({ ok: false, kind: "save_failed" });
  });

  it("fails when the Job can't be loaded", async () => {
    const jobs = { find: async () => Promise.reject(new Error("db down")) };
    const deps = { jobs, store: memoryTailoringStore(), steps: scriptedSteps(), careerStory: memoryCareerStory(), exampleWorks: memoryExampleWorks() };
    expect(await getTailoring(deps, "job-1")).toMatchObject({ ok: false, kind: "save_failed" });
  });
});
