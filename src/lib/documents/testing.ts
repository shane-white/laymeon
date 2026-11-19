/**
 * Test adapters for the Document lifecycle's seams: an in-memory store, a
 * scripted file reader and a Rebuild recorder. No Supabase or Claude.
 */
import {
  DefaultTakenError,
  type Document,
  type DocumentStore,
  type FileReader,
  type NewDocument,
  type RebuildTrigger,
  type SplitExampleWork,
} from "./document";

export interface MemoryStoreOptions {
  /** Make the next `insert` fail. */
  failInsert?: boolean;
  /** Make `putFile` fail. */
  failPutFile?: boolean;
  /** Runs just before each insert, e.g. to simulate a concurrent add. */
  beforeInsert?: (store: MemoryStore) => void;
}

export interface MemoryStore extends DocumentStore {
  /** The live Documents. */
  documents(): Document[];
  /** The paths of the stored files. */
  files(): string[];
  /** Adds a Document directly, bypassing the checks. */
  seed(doc: Partial<Document> & Pick<Document, "document_type">): Document;
}

export function memoryStore(options: MemoryStoreOptions = {}): MemoryStore {
  const userId = "u1";
  const docs: Document[] = [];
  const files = new Set<string>();
  let nextId = 1;
  let failInsert = options.failInsert ?? false;

  const make = (row: NewDocument): Document => {
    const now = new Date().toISOString();
    return { ...row, id: `doc-${nextId++}`, user_id: userId, created_at: now, updated_at: now };
  };

  const store: MemoryStore = {
    async count(type, filter = {}) {
      return docs.filter((d) => d.document_type === type && (!filter.source || d.source === filter.source)).length;
    },
    async insert(rows) {
      options.beforeInsert?.(store);
      if (failInsert) {
        failInsert = false;
        throw new Error("insert failed");
      }
      for (const row of rows.filter((r) => r.is_default)) {
        if (docs.some((d) => d.document_type === row.document_type && d.is_default)) throw new DefaultTakenError();
      }
      const created = rows.map(make);
      docs.push(...created);
      return created;
    },
    async putFile(path) {
      if (options.failPutFile) throw new Error("storage down");
      files.add(path);
    },
    async removeFile(path) {
      files.delete(path);
    },
    documents: () => [...docs],
    files: () => [...files],
    seed(doc) {
      const created = make({
        source: "uploaded",
        original_filename: null,
        display_name: "Seeded",
        target_role: null,
        is_default: false,
        mime_type: null,
        file_size_bytes: null,
        storage_bucket: null,
        storage_path: null,
        parsed_markdown: "Seeded",
        ...doc,
      });
      docs.push(created);
      return created;
    },
  };
  return store;
}

/** A file reader that returns what it's given, or throws it if it's an error. */
export function scriptedReader(script: {
  markdown?: string | Error;
  exampleWorks?: SplitExampleWork[] | Error;
}): FileReader & { calls: number } {
  const reader = {
    calls: 0,
    async toMarkdown() {
      reader.calls++;
      if (script.markdown instanceof Error) throw script.markdown;
      return script.markdown ?? "";
    },
    async splitExampleWorks() {
      reader.calls++;
      if (script.exampleWorks instanceof Error) throw script.exampleWorks;
      return script.exampleWorks ?? [];
    },
  };
  return reader;
}

/** Counts the Rebuilds requested. */
export function rebuildRecorder(): RebuildTrigger & { requests: number } {
  const recorder = {
    requests: 0,
    async request() {
      recorder.requests++;
    },
  };
  return recorder;
}
