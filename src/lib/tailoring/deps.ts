/** The Tailoring module's production adapters, for the signed-in user. */
import type { SupabaseClient } from "@supabase/supabase-js";
import { documentDeps } from "@/lib/documents/deps";
import { addWrittenExampleWork } from "@/lib/documents/lifecycle";
import { loadProfile } from "@/lib/profile/rebuild";
import { claudeSteps } from "./claude-steps";
import { supabaseTailoringJobs } from "./supabase-jobs";
import { supabaseTailoringStore } from "./supabase-store";
import type { TailoringDeps, TailoringExampleWorks } from "./tailoring";

/** Adds written Example Works through the Document lifecycle, which requests a Rebuild in the background. */
function documentExampleWorks(supabase: SupabaseClient, userId: string): TailoringExampleWorks {
  return {
    async add(input) {
      const result = await addWrittenExampleWork(documentDeps(supabase, userId), input);
      if (!result.ok) {
        return { ok: false, invalid: result.kind === "invalid" || result.kind === "limit_reached", message: result.message };
      }
      const [document] = result.documents;
      return { ok: true, documentId: document.id, title: document.display_name };
    },
  };
}

export function tailoringDeps(supabase: SupabaseClient, userId: string): TailoringDeps {
  return {
    jobs: supabaseTailoringJobs(supabase, userId),
    store: supabaseTailoringStore(supabase, userId),
    steps: claudeSteps,
    careerStory: { load: () => loadProfile(supabase, userId) },
    exampleWorks: documentExampleWorks(supabase, userId),
  };
}
