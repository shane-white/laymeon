/**
 * Rebuilds the Career Story in the background when the user's documents
 * change, one rebuild at a time per user (see the career_profile_rebuilds
 * migration). A failed rebuild leaves the last good profile in place.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { after } from "next/server";
import { rebuildProfile, type RebuildResult } from "./rebuild";

// A rebuild can run for up to the route's maxDuration (5 minutes). A lock older
// than this belongs to a run that died, so it's taken over.
const STALE_LOCK_MS = 6 * 60 * 1000;
// A request that no run has picked up yet still counts as "updating" for this long.
const PENDING_MS = 60 * 1000;
// Changes that keep arriving during rebuilds are picked up by at most this many runs.
const MAX_RUNS = 3;

const TABLE = "career_profile_rebuilds";

export interface RebuildStatus {
  /** A rebuild is running, or about to. */
  running: boolean;
  /** The last rebuild failed, and none has finished since. */
  error: string | null;
}

interface RebuildRow {
  requested_at: string;
  started_at: string | null;
  finished_at: string | null;
  failed_at: string | null;
  error: string | null;
}

const time = (iso: string | null) => (iso ? Date.parse(iso) : 0);

export function statusOf(row: RebuildRow | null, now = Date.now()): RebuildStatus {
  if (!row) return { running: false, error: null };
  const locked = row.started_at !== null && now - time(row.started_at) < STALE_LOCK_MS;
  const lastDone = Math.max(time(row.finished_at), time(row.failed_at));
  const pending = time(row.requested_at) > lastDone && now - time(row.requested_at) < PENDING_MS;
  const failed = row.failed_at !== null && time(row.failed_at) >= time(row.finished_at);
  return { running: locked || pending, error: failed ? (row.error ?? "The last update failed") : null };
}

export async function getRebuildStatus(supabase: SupabaseClient, userId: string): Promise<RebuildStatus> {
  const { data, error } = await supabase
    .from(TABLE)
    .select("requested_at, started_at, finished_at, failed_at, error")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load the rebuild status: ${error.message}`);
  return statusOf(data as RebuildRow | null);
}

/** Records that the documents changed. */
export async function requestRebuild(supabase: SupabaseClient, userId: string): Promise<void> {
  const { error } = await supabase
    .from(TABLE)
    .upsert({ user_id: userId, requested_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) throw new Error(`Failed to request a rebuild: ${error.message}`);
}

/** Takes the lock if no live run holds it. Returns when the run started, or null if another run is going. */
async function claim(supabase: SupabaseClient, userId: string): Promise<string | null> {
  const now = new Date().toISOString();
  const staleBefore = new Date(Date.now() - STALE_LOCK_MS).toISOString();
  // One UPDATE, so two runs can't both take the lock.
  const { data, error } = await supabase
    .from(TABLE)
    .update({ started_at: now })
    .eq("user_id", userId)
    .or(`started_at.is.null,started_at.lt.${staleBefore}`)
    .select("user_id");
  if (error) throw new Error(`Failed to start a rebuild: ${error.message}`);
  return data && data.length > 0 ? now : null;
}

async function update(supabase: SupabaseClient, userId: string, fields: Partial<RebuildRow>): Promise<void> {
  const { error } = await supabase.from(TABLE).update(fields).eq("user_id", userId);
  if (error) throw new Error(`Failed to update the rebuild status: ${error.message}`);
}

/**
 * Runs the requested rebuild, and again if more changes arrive meanwhile.
 * Returns null without doing anything if a rebuild is already running: that
 * run will pick up the latest request when it finishes.
 */
export async function runRebuilds(supabase: SupabaseClient, userId: string): Promise<RebuildResult | null> {
  let startedAt = await claim(supabase, userId);
  if (!startedAt) return null;

  try {
    let result: RebuildResult | null = null;
    for (let run = 0; run < MAX_RUNS; run++) {
      result = await rebuildProfile(supabase, userId);
      const { data } = await supabase.from(TABLE).select("requested_at").eq("user_id", userId).maybeSingle();
      if (!data || time(data.requested_at) <= time(startedAt)) break;
      // Something changed during this run: go again, keeping the lock fresh.
      startedAt = new Date().toISOString();
      await update(supabase, userId, { started_at: startedAt });
    }
    await update(supabase, userId, {
      started_at: null,
      finished_at: new Date().toISOString(),
      failed_at: null,
      error: null,
    });
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await update(supabase, userId, { started_at: null, failed_at: new Date().toISOString(), error: message }).catch(
      () => {},
    );
    throw err;
  }
}

/**
 * Call after a document is added, edited or deleted: rebuilds the Career
 * Story once the response has been sent. Never throws, so a problem here
 * can't fail the document change itself.
 */
export async function scheduleRebuild(supabase: SupabaseClient, userId: string): Promise<void> {
  try {
    await requestRebuild(supabase, userId);
  } catch (err) {
    console.error("Couldn't request a Career Story rebuild", err);
    return;
  }
  after(async () => {
    try {
      await runRebuilds(supabase, userId);
    } catch (err) {
      console.error("Career Story rebuild failed", err);
    }
  });
}
