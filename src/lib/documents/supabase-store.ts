/** The Document store in production: the `documents` table and the uploads bucket. */
import type { SupabaseClient } from "@supabase/supabase-js";
import { DefaultTakenError, type Document, type DocumentStore } from "./document";
import { UPLOAD_BUCKET } from "./files";

const UNIQUE_VIOLATION = "23505";

export function supabaseStore(supabase: SupabaseClient, userId: string): DocumentStore {
  return {
    async count(type, filter = {}) {
      let query = supabase
        .from("documents")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("document_type", type)
        .is("deleted_at", null);
      if (filter.source) query = query.eq("source", filter.source);
      const { count, error } = await query;
      if (error) throw new Error(`Couldn't count documents: ${error.message}`);
      return count ?? 0;
    },

    async insert(rows) {
      const { data, error } = await supabase
        .from("documents")
        .insert(rows.map((r) => ({ ...r, user_id: userId })))
        .select();
      if (error) {
        // Only one Default document per type (idx_documents_one_default).
        if (error.code === UNIQUE_VIOLATION && rows.some((r) => r.is_default)) throw new DefaultTakenError();
        throw new Error(`Couldn't insert documents: ${error.message}`);
      }
      return data as Document[];
    },

    async putFile(path, file) {
      const bytes = Buffer.from(await file.arrayBuffer());
      const { error } = await supabase.storage.from(UPLOAD_BUCKET).upload(path, bytes, { contentType: file.type });
      if (error) throw new Error(`Couldn't store the file: ${error.message}`);
    },

    async removeFile(path) {
      const { error } = await supabase.storage.from(UPLOAD_BUCKET).remove([path]);
      if (error) throw new Error(`Couldn't remove the file: ${error.message}`);
    },
  };
}
