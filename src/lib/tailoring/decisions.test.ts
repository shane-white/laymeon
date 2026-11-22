import { describe, expect, it } from "vitest";
import { decide, getTailoring, startOver, startTailoring } from "./lifecycle";
import {
  careerStory,
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
import type { MemoryTailoringStoreOptions } from "./testing";
import type { Decision, TailoringDeps } from "./tailoring";

const MARKDOWN = "## Experience\n\n- Shipped billing\n- Ran weekly planning";
const story = careerStory();

async function setup(options: MemoryTailoringStoreOptions = {}) {
  const job = withReport(tailoringJob(), {
    requirements: [
      requirement("Payments experience", { careerStory: [story.ref("skill", "Payments")] }),
      requirement("Roadmapping", { match: "partial" }),
      requirement("Kubernetes"),
    ],
  });
  const steps = scriptedSteps({
    markdown: MARKDOWN,
    suggestions: [
      rewrite("Payments experience", "Shipped billing", "Shipped card payments"),
      rewrite("Roadmapping", "Ran weekly planning", "Ran weekly roadmap planning"),
    ],
  });
  const store = memoryTailoringStore(options);
  const deps: TailoringDeps = { jobs: memoryJobs(job), store, steps, careerStory: memoryCareerStory(story.profile), exampleWorks: memoryExampleWorks() };
  const result = await startTailoring(deps, "job-1");
  if (!result.ok || !result.tailoring) throw new Error("Didn't start");
  const idOf = (text: string) => result.tailoring!.items.find((i) => i.target.text === text)!.id;
  const [payments, roadmapping, kubernetes] = [idOf("Payments experience"), idOf("Roadmapping"), idOf("Kubernetes")];
  return { deps, store, payments, roadmapping, kubernetes };
}

const decisionOf = async (deps: TailoringDeps, itemId: string) => {
  const result = await getTailoring(deps, "job-1");
  return result.ok ? result.tailoring?.items.find((i) => i.id === itemId)?.decision : undefined;
};

describe("deciding on a Suggestion", () => {
  const decisions: Decision[] = [
    { status: "accepted" },
    { status: "edited", text: "Shipped card and ACH payments" },
    { status: "rejected" },
  ];
  for (const decision of decisions) {
    it(`records ${decision.status}`, async () => {
      const { deps, payments } = await setup();

      const result = await decide(deps, "job-1", payments, decision);

      expect(result.ok && result.tailoring?.items.find((i) => i.id === payments)?.decision).toEqual(decision);
      expect(await decisionOf(deps, payments)).toEqual(decision);
    });
  }

  it("can be changed at any time, and undone", async () => {
    const { deps, payments } = await setup();
    await decide(deps, "job-1", payments, { status: "rejected" });
    await decide(deps, "job-1", payments, { status: "edited", text: "Shipped payments" });
    expect(await decisionOf(deps, payments)).toEqual({ status: "edited", text: "Shipped payments" });

    await decide(deps, "job-1", payments, { status: "undecided" });
    expect(await decisionOf(deps, payments)).toEqual({ status: "undecided" });
  });

  it("only touches that item", async () => {
    const { deps, payments, roadmapping } = await setup();
    await decide(deps, "job-1", payments, { status: "accepted" });
    await decide(deps, "job-1", roadmapping, { status: "rejected" });
    expect(await decisionOf(deps, payments)).toEqual({ status: "accepted" });
  });

  it("trims edited text, and needs some", async () => {
    const { deps, payments } = await setup();
    await decide(deps, "job-1", payments, { status: "edited", text: "  Built payments  " });
    expect(await decisionOf(deps, payments)).toEqual({ status: "edited", text: "Built payments" });

    expect(await decide(deps, "job-1", payments, { status: "edited", text: "  " })).toMatchObject({
      ok: false,
      kind: "invalid_decision",
    });
    expect(await decide(deps, "job-1", payments, { status: "edited", text: "x".repeat(2001) })).toMatchObject({
      ok: false,
      kind: "invalid_decision",
    });
    expect(await decisionOf(deps, payments)).toEqual({ status: "edited", text: "Built payments" });
  });

  it("no longer takes new own text", async () => {
    const { deps, payments } = await setup();
    expect(await decide(deps, "job-1", payments, { status: "own_text", text: "Built payments" })).toMatchObject({
      ok: false,
      kind: "invalid_decision",
      message: "Edit the proposed text instead.",
    });
    expect(await decisionOf(deps, payments)).toEqual({ status: "undecided" });
  });

  it("still loads a saved own-text decision, and saves a change to it as edited", async () => {
    const { deps, store, payments } = await setup();
    const [saved] = store.tailorings();
    const items = saved.items.map((i) =>
      i.id === payments ? { ...i, decision: { status: "own_text" as const, text: "Built payments end to end" } } : i,
    );
    await store.saveItems(saved.id, items, saved.updatedAt);
    expect(await decisionOf(deps, payments)).toEqual({ status: "own_text", text: "Built payments end to end" });

    await decide(deps, "job-1", payments, { status: "edited", text: "Built card payments end to end" });
    expect(await decisionOf(deps, payments)).toEqual({ status: "edited", text: "Built card payments end to end" });
  });
});

describe("deciding on a gap", () => {
  it("can skip it, and change that", async () => {
    const { deps, kubernetes } = await setup();
    await decide(deps, "job-1", kubernetes, { status: "skipped" });
    expect(await decisionOf(deps, kubernetes)).toEqual({ status: "skipped" });
    await decide(deps, "job-1", kubernetes, { status: "undecided" });
    expect(await decisionOf(deps, kubernetes)).toEqual({ status: "undecided" });
  });

  it("can't accept, edit, write own text for or reject a gap with no Suggestion", async () => {
    const { deps, kubernetes } = await setup();
    for (const decision of [{ status: "accepted" }, { status: "own_text", text: "K8s" }, { status: "rejected" }] as Decision[]) {
      expect(await decide(deps, "job-1", kubernetes, decision)).toMatchObject({ ok: false, kind: "invalid_decision" });
    }
  });

  it("can skip a partial Requirement offered as a gap, or decide on its rewording Suggestion", async () => {
    const { deps, roadmapping } = await setup();
    expect(await decide(deps, "job-1", roadmapping, { status: "skipped" })).toMatchObject({ ok: true });
    expect(await decide(deps, "job-1", roadmapping, { status: "accepted" })).toMatchObject({ ok: true });
  });

  it("can't skip an item that isn't a gap", async () => {
    const { deps, payments } = await setup();
    expect(await decide(deps, "job-1", payments, { status: "skipped" })).toMatchObject({ ok: false, kind: "invalid_decision" });
  });
});

describe("deciding while the Tailoring changes", () => {
  it("keeps both of two decisions saved at once, as from two tabs", async () => {
    const { deps, payments, roadmapping } = await setup();

    const results = await Promise.all([
      decide(deps, "job-1", payments, { status: "accepted" }),
      decide(deps, "job-1", roadmapping, { status: "rejected" }),
    ]);

    expect(results).toMatchObject([{ ok: true }, { ok: true }]);
    expect(await decisionOf(deps, payments)).toEqual({ status: "accepted" });
    expect(await decisionOf(deps, roadmapping)).toEqual({ status: "rejected" });
  });

  it("doesn't bring back the old items when the Tailoring is started over while the decision is saved", async () => {
    // Another tab starts over after the decision's read, before its write.
    const later: { deps?: TailoringDeps } = {};
    const started = await setup({ beforeSaveItems: () => startOver(later.deps!, "job-1").then(() => undefined) });
    const deps = (later.deps = started.deps);

    const result = await decide(deps, "job-1", started.payments, { status: "accepted" });

    expect(result).toMatchObject({ ok: false, kind: "not_found" });
    const now = await getTailoring(deps, "job-1");
    const ids = now.ok ? now.tailoring?.items.map((i) => i.id) : [];
    expect(ids).not.toContain(started.payments);
    expect(now.ok && now.tailoring?.items.every((i) => i.decision.status === "undecided")).toBe(true);
  });
});

describe("when a decision can't be saved", () => {
  it("fails for an item that isn't in the Job's Tailoring, such as one from before a start over", async () => {
    const { deps, payments } = await setup();
    await startOver(deps, "job-1");
    expect(await decide(deps, "job-1", payments, { status: "accepted" })).toMatchObject({ ok: false, kind: "not_found" });
  });

  it("fails when the Job has no Tailoring", async () => {
    const { deps, payments } = await setup();
    deps.jobs = memoryJobs(tailoringJob({ resume: { ...tailoringJob().resume!, id: "resume-2" } }));
    expect(await decide(deps, "job-1", payments, { status: "accepted" })).toMatchObject({ ok: false, kind: "not_found" });
    expect(await decide(deps, "job-2", payments, { status: "accepted" })).toMatchObject({ ok: false, kind: "not_found" });
  });

  it("fails when the store can't save it", async () => {
    const { deps, payments } = await setup({ failSaveItems: true });
    expect(await decide(deps, "job-1", payments, { status: "accepted" })).toMatchObject({ ok: false, kind: "save_failed" });
  });

  it("still records decisions on a Tailoring that's an Earlier version", async () => {
    const { deps, payments } = await setup();
    const job = (await deps.jobs.find("job-1"))!;
    deps.jobs = memoryJobs({ ...job, matchReport: { ...job.matchReport!, generatedAt: "2026-11-09T00:00:00.000Z" } });
    expect(await decide(deps, "job-1", payments, { status: "accepted" })).toMatchObject({ ok: true, earlierVersion: true });
  });
});
