import { describe, expect, it } from "vitest";
import { startTailoring } from "./lifecycle";
import {
  add,
  careerStory,
  memoryCareerStory,
  memoryExampleWorks,
  memoryJobs,
  memoryTailoringStore,
  requirement,
  rewrite,
  screener,
  scriptedSteps,
  tailoringJob,
  withReport,
} from "./testing";
import type { TailoringDeps, TailoringJob } from "./tailoring";

const MARKDOWN = `# Jane Doe

## Experience

### Product Manager · Ledgerly
2021 – present

- Shipped **billing** for 3,000 customers
- Ran weekly planning

## Skills

- SQL, Payments`;

const story = careerStory();

function setup(job: TailoringJob, suggestions: NonNullable<Parameters<typeof scriptedSteps>[0]>["suggestions"] = []) {
  const steps = scriptedSteps({ markdown: MARKDOWN, suggestions });
  const store = memoryTailoringStore();
  const deps: TailoringDeps = { jobs: memoryJobs(job), store, steps, careerStory: memoryCareerStory(story.profile), exampleWorks: memoryExampleWorks() };
  return { deps, steps, store };
}

async function started(deps: TailoringDeps) {
  const result = await startTailoring(deps, "job-1");
  if (!result.ok || !result.tailoring) throw new Error(`Didn't start: ${JSON.stringify(result)}`);
  return result.tailoring;
}


describe("the items a Tailoring covers", () => {
  it("are missing and partial Requirements and Screeners not shown: must-have before nice-to-have, missing before partial", async () => {
    const job = withReport(tailoringJob(), {
      requirements: [
        requirement("Nice partial", { importance: "nice_to_have", match: "partial" }),
        requirement("Must strong", { match: "strong" }),
        requirement("Must partial", { match: "partial" }),
        requirement("Nice missing", { importance: "nice_to_have" }),
        requirement("Must missing", { category: "tool" }),
      ],
      screeners: [screener("Work authorization"), screener("Shown screener", { shown: true })],
      searchWords: [{ word: "payments", inResume: false }] as never,
    });
    const { deps } = setup(job);

    const tailoring = await started(deps);

    expect(tailoring.items.map((i) => i.target)).toEqual([
      { kind: "screener", text: "Work authorization" },
      { kind: "requirement", text: "Must missing", importance: "must_have", category: "tool", match: "missing" },
      { kind: "requirement", text: "Must partial", importance: "must_have", category: "experience", match: "partial" },
      { kind: "requirement", text: "Nice missing", importance: "nice_to_have", category: "experience", match: "missing" },
      { kind: "requirement", text: "Nice partial", importance: "nice_to_have", category: "experience", match: "partial" },
    ]);
    expect(new Set(tailoring.items.map((i) => i.id)).size).toBe(5);
    expect(tailoring.items.every((i) => i.decision.status === "undecided")).toBe(true);
  });
});

describe("sorting items by coverage", () => {
  const job = () =>
    withReport(tailoringJob(), {
      requirements: [
        requirement("Payments experience", { careerStory: [story.ref("skill", "Payments")] }),
        requirement("Kubernetes"),
        requirement("Roadmapping", { match: "partial" }),
      ],
      screeners: [screener("US work authorization")],
    });

  it("asks for a Suggestion from the linked Career Story items, and a rewording one for a partial Requirement with none", async () => {
    const { deps, steps } = setup(job());
    await started(deps);

    expect(steps.requested).toHaveLength(1);
    expect(steps.requested[0]).toMatchObject([
      { target: { text: "Payments experience" }, basis: "career_story", sources: [{ label: "Payments", quotes: ["Payments"] }] },
      { target: { text: "Roadmapping" }, basis: "resume", sources: [] },
    ]);
  });

  it("makes gaps of uncovered missing Requirements and Screeners, and offers a rewording Suggestion as a gap too", async () => {
    const { deps } = setup(job(), [
      rewrite("Payments experience", "Shipped billing for 3,000 customers", "Shipped card and ACH payments for 3,000 customers"),
      rewrite("Roadmapping", "Ran weekly planning", "Ran weekly roadmap planning"),
    ]);
    const tailoring = await started(deps);
    const byText = (text: string) => tailoring.items.find((i) => i.target.text === text)!;

    expect(byText("Payments experience")).toMatchObject({ gap: false, suggestion: { kind: "rewrite" } });
    expect(byText("Roadmapping")).toMatchObject({ gap: true, suggestion: { kind: "rewrite" } });
    expect(byText("Kubernetes")).toMatchObject({ gap: true, suggestion: null });
    expect(byText("US work authorization")).toMatchObject({ gap: true, suggestion: null });
  });

  it("doesn't call Claude when nothing can have a Suggestion", async () => {
    const { deps, steps } = setup(withReport(tailoringJob(), { requirements: [requirement("Kubernetes")] }));
    const tailoring = await started(deps);
    expect(steps.requested).toEqual([]);
    expect(tailoring.items).toMatchObject([{ gap: true, suggestion: null }]);
  });
});

describe("the Suggestions written", () => {
  const job = () =>
    withReport(tailoringJob(), {
      requirements: [
        requirement("Payments experience", {
          careerStory: [story.ref("skill", "Payments"), story.ref("accomplishment", "Built ACH payouts for invoice payments")],
        }),
        requirement("SQL", { match: "partial", careerStory: [story.ref("skill", "SQL")] }),
        requirement("Roadmapping", { match: "partial" }),
      ],
    });

  it("keep a Rewrite's quote exactly as the Markdown has it, with the Career Story items as Evidence", async () => {
    const { deps } = setup(job(), [
      rewrite(
        "Payments experience",
        '"shipped billing for 3,000 customers."',
        "Shipped card and ACH payments for 3,000 customers",
        "Shows payments work",
      ),
    ]);
    const tailoring = await started(deps);

    expect(tailoring.items[0].suggestion).toEqual({
      kind: "rewrite",
      quote: "Shipped **billing** for 3,000 customers",
      text: "Shipped card and ACH payments for 3,000 customers",
      why: "Shows payments work",
      evidence: [
        {
          source: "career_story",
          ...story.ref("skill", "Payments"),
          quotes: [{ documentId: "doc-1", documentName: "Résumé", quote: "Payments" }],
        },
        {
          source: "career_story",
          ...story.ref("accomplishment", "Built ACH payouts for invoice payments"),
          quotes: [{ documentId: "doc-1", documentName: "Résumé", quote: "Built ACH payouts for invoice payments" }],
        },
      ],
    });
  });

  it("keep an Add's anchor: after a quoted line, or in a section by its heading", async () => {
    const { deps } = setup(job(), [
      add("Payments experience", { after: "ran weekly planning" }, "- Built ACH payouts for invoice payments"),
      add("SQL", { section: "skills" }, "- SQL reporting"),
    ]);
    const tailoring = await started(deps);

    expect(tailoring.items[0].suggestion).toMatchObject({ kind: "add", anchor: { type: "after", quote: "Ran weekly planning" } });
    expect(tailoring.items[1].suggestion).toMatchObject({ kind: "add", anchor: { type: "section", heading: "Skills" } });
  });

  it("give a rewording Suggestion the Resume's text as its Evidence", async () => {
    const { deps } = setup(job(), [rewrite("Roadmapping", "Ran weekly planning", "Ran weekly roadmap planning")]);
    const tailoring = await started(deps);
    expect(tailoring.items[2].suggestion?.evidence).toEqual([{ source: "resume", quote: "Ran weekly planning" }]);
  });

  it("are dropped when a quote, line or section isn't in the Markdown, leaving a gap", async () => {
    const { deps } = setup(job(), [
      rewrite("Payments experience", "Shipped invoicing for 3,000 customers", "Shipped payments"),
      add("SQL", { section: "Projects" }, "- SQL reporting"),
      rewrite("Roadmapping", "Ran sprint planning", "Owned the roadmap"),
    ]);
    const tailoring = await started(deps);
    expect(tailoring.items.map((i) => [i.suggestion, i.gap])).toEqual([
      [null, true],
      [null, true],
      [null, true],
    ]);
  });

  it("are dropped when a quote has an ellipsis, when text is missing, when nothing changes, or when a rewording one adds text", async () => {
    const { deps } = setup(job(), [
      rewrite("Payments experience", "Shipped ... customers", "Shipped payments"),
      rewrite("SQL", "SQL, Payments", "  "),
      rewrite("SQL", "SQL, Payments", "sql, payments"),
      add("Roadmapping", { after: "Ran weekly planning" }, "- Owned the roadmap"),
    ]);
    const tailoring = await started(deps);
    expect(tailoring.items.map((i) => i.suggestion)).toEqual([null, null, null]);
  });

  it("are at most one per item, and only for items that were asked for", async () => {
    const report = job().matchReport!.report;
    const { deps } = setup(withReport(job(), { requirements: [...report.requirements, requirement("Kubernetes")] }), [
      rewrite("Payments experience", "Shipped invoicing", "Not there"),
      rewrite("Payments experience", "Ran weekly planning", "Ran weekly payments planning"),
      rewrite("Payments experience", "Shipped billing for 3,000 customers", "A second usable one"),
      rewrite("Kubernetes", "Ran weekly planning", "Ran Kubernetes planning"),
      rewrite("not-an-item", "Ran weekly planning", "Nothing"),
    ]);
    const tailoring = await started(deps);
    expect(tailoring.items[0].suggestion).toMatchObject({ text: "Ran weekly payments planning" });
    expect(tailoring.items.find((i) => i.target.text === "Kubernetes")).toMatchObject({ suggestion: null, gap: true });
  });

  it("still have their links as Evidence when the Career Story can't be loaded", async () => {
    const { deps } = setup(job(), [rewrite("SQL", "SQL, Payments", "SQL (reporting, dashboards), Payments")]);
    deps.careerStory = memoryCareerStory(new Error("db down"));
    const tailoring = await started(deps);
    expect(tailoring.items[1].suggestion?.evidence).toEqual([{ source: "career_story", ...story.ref("skill", "SQL"), quotes: [] }]);
  });

  it("fail the start when Claude can't write them, saving nothing", async () => {
    const { deps, store } = setup(job(), new Error("Claude is down"));
    expect(await startTailoring(deps, "job-1")).toMatchObject({ ok: false, kind: "step_failed" });
    expect(store.tailorings()).toEqual([]);
  });
});
