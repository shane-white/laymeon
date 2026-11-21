import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { tailoringDeps } from "@/lib/tailoring/deps";
import { startTailoring } from "@/lib/tailoring/lifecycle";
import {
  add,
  memoryCareerStory,
  memoryExampleWorks,
  memoryJobs,
  memoryTailoringStore,
  requirement,
  scriptedSteps,
  tailoringJob,
  withReport,
} from "@/lib/tailoring/testing";
import type { TailoringDeps } from "@/lib/tailoring/tailoring";
import { POST } from "./route";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/tailoring/deps", () => ({ tailoringDeps: vi.fn() }));

let deps: TailoringDeps;
let itemId: string;

function signIn(user: { id: string } | null) {
  vi.mocked(createClient).mockResolvedValue({ auth: { getUser: async () => ({ data: { user } }) } } as never);
}

const params = () => ({ params: Promise.resolve({ id: "job-1" }) });
const post = (body: unknown) =>
  new NextRequest("http://localhost/api/jobs/job-1/tailoring/example-work", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
const PROJECT = { title: "Cluster migration", description: "I moved our services onto Kubernetes." };

beforeEach(async () => {
  const job = withReport(tailoringJob(), { requirements: [requirement("Kubernetes")] });
  deps = {
    jobs: memoryJobs(job),
    store: memoryTailoringStore(),
    steps: scriptedSteps({
      markdown: "## Experience\n\n- Ran weekly planning",
      suggestions: [add("Kubernetes", { section: "Experience" }, "- Moved services onto Kubernetes")],
    }),
    careerStory: memoryCareerStory(),
    exampleWorks: memoryExampleWorks(),
  };
  vi.mocked(tailoringDeps).mockReturnValue(deps);
  signIn({ id: "u1" });
  const started = await startTailoring(deps, "job-1");
  itemId = started.ok ? started.tailoring!.items[0].id : "";
});

describe("/api/jobs/[id]/tailoring/example-work", () => {
  it("adds the Example Work and sends back the Tailoring with the gap's Suggestion", async () => {
    const response = await POST(post({ itemId, ...PROJECT }), params());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      tailoring: { items: [{ id: itemId, gap: false, suggestion: { evidence: [{ source: "example_work", title: PROJECT.title }] } }] },
      earlierVersion: false,
    });
  });

  it("needs a signed-in user", async () => {
    signIn(null);
    expect((await POST(post({ itemId, ...PROJECT }), params())).status).toBe(401);
  });

  it("rejects a body that isn't an Example Work for an item", async () => {
    for (const body of ["not json", {}, { itemId, title: "Cluster migration" }, { ...PROJECT }]) {
      expect((await POST(post(body), params())).status).toBe(400);
    }
  });

  it("says why the gap can't be filled", async () => {
    expect((await POST(post({ itemId: "gone", ...PROJECT }), params())).status).toBe(404);
    const response = await POST(post({ itemId, title: " ", description: PROJECT.description }), params());
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ kind: "invalid_example_work" });
  });
});
