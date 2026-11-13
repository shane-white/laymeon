import { describe, expect, it, vi } from "vitest";

// statusOf is pure; the module also imports next/server and the rebuild code.
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("./rebuild", () => ({ rebuildProfile: vi.fn() }));

const { statusOf, runRebuilds } = await import("./auto-rebuild");
const { rebuildProfile } = await import("./rebuild");

type Row = {
  requested_at: string;
  started_at: string | null;
  finished_at: string | null;
  failed_at: string | null;
  error: string | null;
};

/** Just enough of the Supabase client for the rebuilds table. */
function fakeSupabase(row: Row) {
  const state = { row };
  const result = <T,>(data: T) => Promise.resolve({ data, error: null });
  const client = {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: () => result({ ...state.row }) }) }),
      update: (fields: Partial<Row>) => {
        const apply = () => Object.assign(state.row, fields);
        return {
          eq: () => ({
            // update(...).eq(...).or(...).select(): only applies when the filter matches.
            or: (filter: string) => {
              const before = filter.match(/started_at\.lt\.(.+)$/)![1];
              const free = state.row.started_at === null || Date.parse(state.row.started_at) < Date.parse(before);
              if (free) apply();
              return { select: () => result(free ? [{ user_id: "u" }] : []) };
            },
            // update(...).eq(...) awaited directly.
            then: (resolve: (v: unknown) => void) => {
              apply();
              resolve({ error: null });
            },
          }),
        };
      },
    }),
  };
  return { state, client: client as never };
}

const idle = (): Row => ({
  requested_at: new Date().toISOString(),
  started_at: null,
  finished_at: null,
  failed_at: null,
  error: null,
});

describe("runRebuilds", () => {
  it("rebuilds and releases the lock", async () => {
    vi.mocked(rebuildProfile).mockReset().mockResolvedValue({ profile: {} as never, extracted: 1, reused: 0 });
    const { state, client } = fakeSupabase(idle());
    expect(await runRebuilds(client, "u")).not.toBeNull();
    expect(rebuildProfile).toHaveBeenCalledTimes(1);
    expect(state.row.started_at).toBeNull();
    expect(state.row.finished_at).not.toBeNull();
  });

  it("leaves it to the running rebuild when one holds the lock", async () => {
    vi.mocked(rebuildProfile).mockReset();
    const { client } = fakeSupabase({ ...idle(), started_at: new Date().toISOString() });
    expect(await runRebuilds(client, "u")).toBeNull();
    expect(rebuildProfile).not.toHaveBeenCalled();
  });

  it("runs again when a document changes during a rebuild", async () => {
    const { state, client } = fakeSupabase(idle());
    vi.mocked(rebuildProfile)
      .mockReset()
      .mockImplementationOnce(async () => {
        // Another document change arrives while this run is going.
        await new Promise((resolve) => setTimeout(resolve, 5));
        state.row.requested_at = new Date().toISOString();
        return { profile: {} as never, extracted: 1, reused: 0 };
      })
      .mockResolvedValue({ profile: {} as never, extracted: 0, reused: 1 });
    await runRebuilds(client, "u");
    expect(rebuildProfile).toHaveBeenCalledTimes(2);
    expect(state.row.started_at).toBeNull();
  });

  it("records a failure and releases the lock", async () => {
    vi.mocked(rebuildProfile).mockReset().mockRejectedValue(new Error("Claude declined"));
    const { state, client } = fakeSupabase(idle());
    await expect(runRebuilds(client, "u")).rejects.toThrow("Claude declined");
    expect(state.row).toMatchObject({ started_at: null, error: "Claude declined" });
    expect(statusOf(state.row).error).toBe("Claude declined");
  });
});

const NOW = Date.parse("2026-11-13T12:00:00Z");
const ago = (seconds: number) => new Date(NOW - seconds * 1000).toISOString();
const row = (r: Partial<Parameters<typeof statusOf>[0] & object>) => ({
  requested_at: ago(600),
  started_at: null,
  finished_at: ago(590),
  failed_at: null,
  error: null,
  ...r,
});

describe("statusOf", () => {
  it("is idle with no row or nothing pending", () => {
    expect(statusOf(null, NOW)).toEqual({ running: false, error: null });
    expect(statusOf(row({}), NOW)).toEqual({ running: false, error: null });
  });

  it("is running while a run holds the lock", () => {
    expect(statusOf(row({ started_at: ago(30) }), NOW).running).toBe(true);
  });

  it("isn't running once the lock is stale", () => {
    expect(statusOf(row({ started_at: ago(7 * 60) }), NOW).running).toBe(false);
  });

  it("counts a fresh request no run has picked up yet as running", () => {
    expect(statusOf(row({ requested_at: ago(5) }), NOW).running).toBe(true);
    expect(statusOf(row({ requested_at: ago(5 * 60) }), NOW).running).toBe(false);
  });

  it("reports a failure until a rebuild finishes", () => {
    const failed = row({ failed_at: ago(10), finished_at: ago(600), requested_at: ago(700), error: "Claude declined" });
    expect(statusOf(failed, NOW)).toEqual({ running: false, error: "Claude declined" });
    expect(statusOf({ ...failed, finished_at: ago(5) }, NOW).error).toBeNull();
  });
});
