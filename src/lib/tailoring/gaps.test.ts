import { describe, expect, it } from "vitest";
import { decide, fillGap, getTailoring, startTailoring } from "./lifecycle";
import {
  add,
  memoryCareerStory,
  memoryExampleWorks,
  memoryJobs,
  memoryTailoringStore,
  requirement,
  rewrite,
  scriptedSteps,
  tailoringJob,
  withReport,
} from "./testing";
import type { TailoringDeps } from "./tailoring";

const MARKDOWN = "## Experience\n\n- Shipped billing\n- Ran weekly planning\n\n## Skills\n\n- SQL";
const PROJECT = {
  title: "Cluster migration at Ledgerly",
  description: "I moved our services onto Kubernetes and cut deploy time from an hour to ten minutes.",
};

type Written = ReturnType<typeof add>[];

/** A started Tailoring; `gapAnswer` is what Claude writes for a gap's Example Work. */
async function setup(gapAnswer: Written | Error = [add("Kubernetes", { after: "Shipped billing" }, "- Moved services onto Kubernetes")]) {
  const job = withReport(tailoringJob(), {
    requirements: [requirement("Kubernetes"), requirement("Roadmapping", { match: "partial" })],
  });
  const steps = scriptedSteps({
    markdown: MARKDOWN,
    suggestions: (requests) => {
      if (requests.every((r) => r.basis !== "example_work")) {
        return [rewrite("Roadmapping", "Ran weekly planning", "Ran weekly roadmap planning")];
      }
      if (gapAnswer instanceof Error) throw gapAnswer;
      return gapAnswer;
    },
  });
  const store = memoryTailoringStore();
  const exampleWorks = memoryExampleWorks();
  const deps: TailoringDeps = {
    jobs: memoryJobs(job),
    store,
    steps,
    careerStory: memoryCareerStory(),
    exampleWorks,
  };
  const started = await startTailoring(deps, "job-1");
  if (!started.ok || !started.tailoring) throw new Error("Didn't start");
  const idOf = (text: string) => started.tailoring!.items.find((i) => i.target.text === text)!.id;
  return { deps, steps, store, exampleWorks, kubernetes: idOf("Kubernetes"), roadmapping: idOf("Roadmapping") };
}

const itemOf = async (deps: TailoringDeps, itemId: string) => {
  const result = await getTailoring(deps, "job-1");
  return result.ok ? result.tailoring?.items.find((i) => i.id === itemId) : undefined;
};

describe("filling a gap with an Example Work", () => {
  it("adds the Example Work and writes the item's Suggestion from it", async () => {
    const { deps, exampleWorks, kubernetes } = await setup();

    const result = await fillGap(deps, "job-1", kubernetes, PROJECT);

    expect(exampleWorks.added()).toEqual([{ documentId: "example-work-1", ...PROJECT }]);
    expect(result).toMatchObject({ ok: true });
    const item = await itemOf(deps, kubernetes);
    expect(item).toMatchObject({
      gap: false,
      decision: { status: "undecided" },
      suggestion: {
        kind: "add",
        anchor: { type: "after", quote: "Shipped billing" },
        text: "- Moved services onto Kubernetes",
        evidence: [{ source: "example_work", documentId: "example-work-1", title: PROJECT.title }],
      },
    });
  });

  it("asks Claude for a Suggestion based only on the Example Work, against the Tailoring's Markdown", async () => {
    const { deps, steps, kubernetes } = await setup();

    await fillGap(deps, "job-1", kubernetes, PROJECT);

    expect(steps.requested.at(-1)).toEqual([
      {
        itemId: kubernetes,
        target: { kind: "requirement", text: "Kubernetes", importance: "must_have", category: "experience", match: "missing" },
        basis: "example_work",
        sources: [{ label: PROJECT.title, quotes: [PROJECT.description] }],
      },
    ]);
  });

  it("replaces a partial item's rewording Suggestion, and undoes skipping it", async () => {
    const { deps, roadmapping } = await setup([
      rewrite("Roadmapping", "Ran weekly planning", "Ran weekly roadmap planning for four teams"),
    ]);
    await decide(deps, "job-1", roadmapping, { status: "skipped" });

    const result = await fillGap(deps, "job-1", roadmapping, PROJECT);

    expect(result).toMatchObject({ ok: true });
    expect(await itemOf(deps, roadmapping)).toMatchObject({
      gap: false,
      decision: { status: "undecided" },
      suggestion: {
        kind: "rewrite",
        quote: "Ran weekly planning",
        text: "Ran weekly roadmap planning for four teams",
        evidence: [{ source: "example_work", documentId: "example-work-1", title: PROJECT.title }],
      },
    });
  });

  it("keeps decisions saved on other items while the Suggestion was written", async () => {
    const { deps, steps, kubernetes, roadmapping } = await setup();
    const answer = [add("Kubernetes", { section: "Skills" }, "- Kubernetes")];
    steps.requested.length = 0;
    const write = steps.writeSuggestions.bind(steps);
    steps.writeSuggestions = async (markdown, requests) => {
      await decide(deps, "job-1", roadmapping, { status: "accepted" });
      await write(markdown, requests);
      return answer.map((w) => ({ ...w, itemId: kubernetes }));
    };

    await fillGap(deps, "job-1", kubernetes, PROJECT);

    expect(await itemOf(deps, roadmapping)).toMatchObject({ decision: { status: "accepted" } });
    expect(await itemOf(deps, kubernetes)).toMatchObject({ gap: false, suggestion: { anchor: { type: "section", heading: "Skills" } } });
  });

  it("works on a Tailoring that's an Earlier version", async () => {
    const { deps, kubernetes } = await setup();
    deps.jobs = memoryJobs({ ...tailoringJob(), matchReport: { ...tailoringJob().matchReport!, generatedAt: "2026-11-05T00:00:00.000Z" } });

    const result = await fillGap(deps, "job-1", kubernetes, PROJECT);

    expect(result).toMatchObject({ ok: true, earlierVersion: true, tailoring: { items: expect.arrayContaining([expect.objectContaining({ id: kubernetes, gap: false })]) } });
  });
});

describe("when a gap can't be filled", () => {
  it("needs a title and a description, and adds nothing without them", async () => {
    const { deps, exampleWorks, kubernetes } = await setup();

    expect(await fillGap(deps, "job-1", kubernetes, { title: "  ", description: PROJECT.description })).toMatchObject({
      ok: false,
      kind: "invalid_example_work",
    });
    expect(await fillGap(deps, "job-1", kubernetes, { title: PROJECT.title, description: "" })).toMatchObject({
      ok: false,
      kind: "invalid_example_work",
    });
    expect(await fillGap(deps, "job-1", kubernetes, { title: "x".repeat(201), description: PROJECT.description })).toMatchObject({
      ok: false,
      kind: "invalid_example_work",
    });
    expect(exampleWorks.added()).toEqual([]);
  });

  it("keeps the Example Work and the gap when its Rewrite overlaps another item's Rewrite", async () => {
    const { deps, exampleWorks, kubernetes } = await setup([rewrite("Kubernetes", "Ran weekly planning", "Ran weekly Kubernetes planning")]);

    expect(await fillGap(deps, "job-1", kubernetes, PROJECT)).toMatchObject({ ok: false, kind: "step_failed" });

    expect(exampleWorks.added()).toHaveLength(1);
    expect(await itemOf(deps, kubernetes)).toMatchObject({ gap: true, suggestion: null });
  });

  it("only fills a gap", async () => {
    const { deps, exampleWorks, kubernetes } = await setup();
    await fillGap(deps, "job-1", kubernetes, PROJECT);

    expect(await fillGap(deps, "job-1", kubernetes, PROJECT)).toMatchObject({ ok: false, kind: "invalid_example_work" });
    expect(exampleWorks.added()).toHaveLength(1);
  });

  it("fails for an item that isn't in the Tailoring", async () => {
    const { deps, exampleWorks } = await setup();
    expect(await fillGap(deps, "job-1", "no-such-item", PROJECT)).toMatchObject({ ok: false, kind: "not_found" });
    expect(await fillGap(deps, "job-2", "no-such-item", PROJECT)).toMatchObject({ ok: false, kind: "not_found" });
    expect(exampleWorks.added()).toEqual([]);
  });

  it("passes on why the Example Work couldn't be added", async () => {
    const { deps, kubernetes } = await setup();
    deps.exampleWorks = memoryExampleWorks({ ok: false, invalid: true, message: "You can keep up to 50 projects." });
    expect(await fillGap(deps, "job-1", kubernetes, PROJECT)).toEqual({
      ok: false,
      kind: "invalid_example_work",
      message: "You can keep up to 50 projects.",
    });

    deps.exampleWorks = memoryExampleWorks(new Error("insert failed"));
    expect(await fillGap(deps, "job-1", kubernetes, PROJECT)).toMatchObject({ ok: false, kind: "save_failed" });
    expect(await itemOf(deps, kubernetes)).toMatchObject({ gap: true, suggestion: null });
  });

  for (const [what, answer] of [
    ["Claude fails", new Error("Claude is down")],
    ["no usable Suggestion is written", [rewrite("Kubernetes", "Ran weekly roadmapping", "Ran Kubernetes")]],
  ] as const) {
    it(`keeps the Example Work and the gap when ${what}`, async () => {
      const { deps, exampleWorks, kubernetes } = await setup(answer instanceof Error ? answer : [...answer]);

      const result = await fillGap(deps, "job-1", kubernetes, PROJECT);

      expect(result).toMatchObject({ ok: false, kind: "step_failed", message: expect.stringContaining("Example Works") });
      expect(exampleWorks.added()).toHaveLength(1);
      expect(await itemOf(deps, kubernetes)).toMatchObject({ gap: true, suggestion: null });
    });
  }
});
