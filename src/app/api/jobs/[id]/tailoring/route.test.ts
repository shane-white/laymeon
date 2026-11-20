import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { tailoringDeps } from "@/lib/tailoring/deps";
import { memoryJobs, memoryTailoringStore, scriptedSteps, tailoringJob } from "@/lib/tailoring/testing";
import type { TailoringDeps } from "@/lib/tailoring/tailoring";
import { GET, POST } from "./route";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/tailoring/deps", () => ({ tailoringDeps: vi.fn() }));

let deps: TailoringDeps;
let steps: ReturnType<typeof scriptedSteps>;

function signIn(user: { id: string } | null) {
  vi.mocked(createClient).mockResolvedValue({ auth: { getUser: async () => ({ data: { user } }) } } as never);
}

const params = (id = "job-1") => ({ params: Promise.resolve({ id }) });
const post = (body?: string) =>
  new NextRequest("http://localhost/api/jobs/job-1/tailoring", { method: "POST", body });

beforeEach(() => {
  steps = scriptedSteps({ markdown: "## Experience" });
  deps = { jobs: memoryJobs(tailoringJob()), store: memoryTailoringStore(), steps };
  vi.mocked(tailoringDeps).mockReturnValue(deps);
  signIn({ id: "u1" });
});

describe("/api/jobs/[id]/tailoring", () => {
  it("needs a signed-in user", async () => {
    signIn(null);
    expect((await GET(new NextRequest("http://localhost"), params())).status).toBe(401);
    expect((await POST(post(), params())).status).toBe(401);
  });

  it("gets no Tailoring before one is started", async () => {
    const response = await GET(new NextRequest("http://localhost"), params());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ tailoring: null, earlierVersion: false, startBlocker: null });
  });

  it("starts a Tailoring, then gets it", async () => {
    const started = await POST(post(), params());
    expect(started.status).toBe(200);
    expect(await started.json()).toMatchObject({ tailoring: { markdown: "## Experience" }, earlierVersion: false });

    const got = await GET(new NextRequest("http://localhost"), params());
    expect(await got.json()).toMatchObject({ tailoring: { markdown: "## Experience" } });
  });

  it("starts over when asked", async () => {
    await POST(post(), params());
    await POST(post(JSON.stringify({ startOver: true })), params());
    expect(steps.structured).toHaveLength(2);
  });

  it("says why a Tailoring can't start", async () => {
    deps.jobs = memoryJobs(tailoringJob({ matchReport: null }));
    const response = await POST(post(), params());
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ kind: "no_match_report" });
  });

  it("fails for a Job that isn't the user's", async () => {
    expect((await GET(new NextRequest("http://localhost"), params("job-2"))).status).toBe(404);
  });

  it("rejects a body that isn't JSON", async () => {
    expect((await POST(post("not json"), params())).status).toBe(400);
  });
});
