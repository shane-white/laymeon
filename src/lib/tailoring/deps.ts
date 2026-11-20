/** The Tailoring module's production adapters, for the signed-in user. */
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadProfile } from "@/lib/profile/rebuild";
import { claudeSteps } from "./claude-steps";
import { supabaseTailoringJobs } from "./supabase-jobs";
import { supabaseTailoringStore } from "./supabase-store";
import type { TailoringDeps } from "./tailoring";

export function tailoringDeps(supabase: SupabaseClient, userId: string): TailoringDeps {
  return {
    jobs: supabaseTailoringJobs(supabase, userId),
    store: supabaseTailoringStore(supabase, userId),
    steps: claudeSteps,
    careerStory: { load: () => loadProfile(supabase, userId) },
  };
}
