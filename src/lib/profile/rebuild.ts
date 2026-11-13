import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildProfile, type ExtractedDocument, type ProfileSourceDocument } from "./build";
import { extractDocument } from "./extract";
import {
  careerProfileSchema,
  EXTRACTION_VERSION,
  extractionSchema,
  PROFILE_VERSION,
  type CareerProfile,
  type Extraction,
} from "./schema";

// Documents are extracted in parallel, a few at a time.
const EXTRACTION_CONCURRENCY = 4;

interface DocumentRow {
  id: string;
  display_name: string;
  document_type: ProfileSourceDocument["type"];
  target_role: string | null;
  parsed_markdown: string | null;
  created_at: string;
}

interface ExtractionRow {
  document_id: string;
  content_hash: string;
  extraction: unknown;
}

/** Changes when the extractor, the document's date or its content changes, and not on a rename. */
export function contentHash(markdown: string, asOf: string): string {
  return createHash("sha256")
    .update(`${EXTRACTION_VERSION}\n${asOf}\n${markdown}`)
    .digest("hex");
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export interface RebuildResult {
  profile: CareerProfile;
  extracted: number;
  reused: number;
}

/**
 * Rebuilds the user's Career Story from their résumés, cover letters and
 * projects, and saves it. Only documents that changed since the last rebuild
 * are sent to the model.
 *
 * Until user changes are applied (LAY-55), `data` is the same as `base`.
 */
export async function rebuildProfile(
  supabase: SupabaseClient,
  userId: string,
): Promise<RebuildResult> {
  const { data: docRows, error: docError } = await supabase
    .from("documents")
    .select("id, display_name, document_type, target_role, parsed_markdown, created_at")
    .eq("user_id", userId)
    .in("document_type", ["resume", "cover_letter", "project"])
    // Generated documents aren't the user's own account of their experience.
    .in("source", ["uploaded", "written"])
    .is("deleted_at", null);
  if (docError) throw new Error(`Failed to load documents: ${docError.message}`);

  const documents = ((docRows ?? []) as DocumentRow[]).filter((d) => d.parsed_markdown?.trim());

  const { data: cachedRows, error: cacheError } = await supabase
    .from("career_profile_extractions")
    .select("document_id, content_hash, extraction")
    .eq("user_id", userId);
  if (cacheError) throw new Error(`Failed to load extractions: ${cacheError.message}`);

  const cached = new Map(((cachedRows ?? []) as ExtractionRow[]).map((r) => [r.document_id, r]));

  let extracted = 0;
  let reused = 0;
  const inputs = await mapWithConcurrency(
    documents,
    EXTRACTION_CONCURRENCY,
    async (doc): Promise<ExtractedDocument> => {
      // A project's title is stored apart from its description.
      const markdown =
        doc.document_type === "project"
          ? `# ${doc.display_name}

${doc.parsed_markdown!}`
          : doc.parsed_markdown!;
      const hash = contentHash(markdown, doc.created_at);
      const source: ProfileSourceDocument = {
        id: doc.id,
        name: doc.display_name,
        type: doc.document_type,
        markdown,
        asOf: doc.created_at,
        targetRole: doc.target_role,
      };

      const hit = cached.get(doc.id);
      if (hit?.content_hash === hash) {
        const parsed = extractionSchema.safeParse(hit.extraction);
        if (parsed.success) {
          reused++;
          return { document: source, extraction: parsed.data };
        }
      }

      const extraction: Extraction = await extractDocument(
        markdown,
        doc.display_name,
        doc.document_type,
        doc.created_at,
      );
      extracted++;
      const { error } = await supabase.from("career_profile_extractions").upsert(
        {
          user_id: userId,
          document_id: doc.id,
          content_hash: hash,
          extraction,
          created_at: new Date().toISOString(),
        },
        { onConflict: "document_id" },
      );
      if (error) throw new Error(`Failed to save extraction: ${error.message}`);
      return { document: source, extraction };
    },
  );

  // Drop cached extractions of documents that were deleted.
  const liveIds = new Set(documents.map((d) => d.id));
  const staleIds = [...cached.keys()].filter((id) => !liveIds.has(id));
  if (staleIds.length) {
    const { error } = await supabase
      .from("career_profile_extractions")
      .delete()
      .eq("user_id", userId)
      .in("document_id", staleIds);
    if (error) throw new Error(`Failed to clean up extractions: ${error.message}`);
  }

  const now = new Date().toISOString();
  const profile = buildProfile(inputs, now);

  const { error: saveError } = await supabase.from("career_profiles").upsert(
    {
      user_id: userId,
      version: PROFILE_VERSION,
      base: profile,
      data: profile,
      built_at: now,
      updated_at: now,
    },
    { onConflict: "user_id" },
  );
  if (saveError) throw new Error(`Failed to save profile: ${saveError.message}`);

  return { profile, extracted, reused };
}

/** The user's saved Career Story, or null if it hasn't been built (or is an older version). */
export async function loadProfile(
  supabase: SupabaseClient,
  userId: string,
): Promise<CareerProfile | null> {
  const { data, error } = await supabase
    .from("career_profiles")
    .select("data")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load profile: ${error.message}`);
  if (!data) return null;
  const parsed = careerProfileSchema.safeParse(data.data);
  return parsed.success ? parsed.data : null;
}
