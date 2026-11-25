/** The Interview Prep module's production adapters, for the signed-in user. */
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadProfile } from "@/lib/profile/rebuild";
import { practiceCardWriter, sectionGenerators } from "./generators";
import { supabaseInterviewPrepJobs } from "./supabase-jobs";
import { supabaseInterviewPrepStore } from "./supabase-store";
import type { InterviewPrepDeps } from "./interview-prep";

export function interviewPrepDeps(supabase: SupabaseClient, userId: string): InterviewPrepDeps {
  return {
    jobs: supabaseInterviewPrepJobs(supabase, userId),
    store: supabaseInterviewPrepStore(supabase, userId),
    generators: sectionGenerators,
    careerStory: { load: () => loadProfile(supabase, userId) },
    practice: practiceCardWriter,
    now: () => new Date().toISOString(),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  };
}
