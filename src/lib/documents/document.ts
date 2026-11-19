/**
 * The Document lifecycle's types and the seams it works through. The
 * operations are in `lifecycle.ts`; the production adapters are in
 * `supabase-store.ts`, `claude-reader.ts` and `deps.ts`, and the test
 * adapters in `testing.ts`.
 */

export type DocumentType = "resume" | "cover_letter" | "project";
/** "written" is an Example Work typed into the app, with no file. */
export type DocumentSource = "uploaded" | "generated" | "written";

export interface Document {
  id: string;
  user_id: string;
  document_type: DocumentType;
  source: DocumentSource;
  original_filename: string | null;
  display_name: string;
  target_role: string | null;
  is_default: boolean;
  mime_type: string | null;
  file_size_bytes: number | null;
  storage_bucket: string | null;
  storage_path: string | null;
  parsed_markdown: string | null;
  created_at: string;
  updated_at: string;
}

/** A Document to insert. The store fills in its ID, user and timestamps. */
export type NewDocument = Omit<Document, "id" | "user_id" | "created_at" | "updated_at">;

/** An Example Work read out of an uploaded file. */
export interface SplitExampleWork {
  title: string;
  description: string;
}

/** The fields of a Document that can change after it's added. */
export type DocumentUpdate = Partial<
  Pick<
    Document,
    | "display_name"
    | "target_role"
    | "parsed_markdown"
    | "original_filename"
    | "mime_type"
    | "file_size_bytes"
    | "storage_bucket"
    | "storage_path"
  >
>;

/**
 * Where one user's Documents and their files are kept. Every method acts on
 * the signed-in user's own Documents only, and only on ones not deleted.
 */
export interface DocumentStore {
  /** The Document, or null if there's none. */
  find(id: string): Promise<Document | null>;
  count(type: DocumentType, filter?: { source?: DocumentSource }): Promise<number>;
  /** Inserts the rows together. Throws `DefaultTakenError` if one would make a second Default document. */
  insert(rows: NewDocument[]): Promise<Document[]>;
  /** Saves the changed fields and returns the Document, or null if there's none. */
  update(id: string, fields: DocumentUpdate): Promise<Document | null>;
  /**
   * Makes an uploaded Resume or Cover letter its type's Default document.
   * Throws `DocumentNotFoundError` if there's no such Document.
   */
  setDefault(id: string): Promise<void>;
  /**
   * Deletes the Document, keeping its file. If it was the Default document, the
   * newest remaining uploaded one of its type takes over. Throws
   * `DocumentNotFoundError` if there's none.
   */
  softDelete(id: string): Promise<void>;
  putFile(path: string, file: File): Promise<void>;
  removeFile(path: string): Promise<void>;
}

/** Thrown by `DocumentStore.insert` when the type already has a Default document. */
export class DefaultTakenError extends Error {
  constructor() {
    super("This document type already has a default");
    this.name = "DefaultTakenError";
  }
}

/** Thrown by `DocumentStore.setDefault` and `softDelete` when there's no such Document. */
export class DocumentNotFoundError extends Error {
  constructor() {
    super("Document not found");
    this.name = "DocumentNotFoundError";
  }
}

/** Reads an uploaded file's text. */
export interface FileReader {
  toMarkdown(file: File): Promise<string>;
  splitExampleWorks(file: File): Promise<SplitExampleWork[]>;
}

/**
 * Thrown by a `FileReader` when the file itself can't be read (no text, too
 * long, nothing recognisable), as opposed to the reader being unavailable.
 * Its message is shown to the user.
 */
export class UnreadableFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnreadableFileError";
  }
}

/** Asks for a Rebuild of the signed-in user's Career Story. Never throws. */
export interface RebuildTrigger {
  request(): Promise<void>;
}

export interface DocumentDeps {
  /** The signed-in user. */
  userId: string;
  store: DocumentStore;
  reader: FileReader;
  rebuild: RebuildTrigger;
}

export type FailureKind =
  | "not_found"
  | "invalid"
  | "unsupported_type"
  | "too_large"
  | "limit_reached"
  | "unreadable"
  | "save_failed";

export interface Failure {
  ok: false;
  kind: FailureKind;
  /** Shown to the user. */
  message: string;
}

/** What a Document change did. */
export interface DocumentChange {
  ok: true;
  /** The Documents added or changed. */
  documents: Document[];
  /** A Career Story Rebuild was requested. */
  rebuildRequested: boolean;
  /** Source material changed, so saved results made from it are now an Earlier version. */
  contentChanged: boolean;
}

export type DocumentResult = DocumentChange | Failure;

export function failure(kind: FailureKind, message: string): Failure {
  return { ok: false, kind, message };
}
