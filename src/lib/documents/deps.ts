/** The Document lifecycle's production adapters, for the signed-in user. */
import type { SupabaseClient } from "@supabase/supabase-js";
import { scheduleRebuild } from "@/lib/profile/auto-rebuild";
import { claudeReader } from "./claude-reader";
import type { DocumentDeps } from "./document";
import { supabaseStore } from "./supabase-store";

export function documentDeps(supabase: SupabaseClient, userId: string): DocumentDeps {
  return {
    userId,
    store: supabaseStore(supabase, userId),
    reader: claudeReader,
    rebuild: { request: () => scheduleRebuild(supabase, userId) },
  };
}
