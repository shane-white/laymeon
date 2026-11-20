/**
 * Every change to a user's Documents: adding, replacing, editing, deleting and
 * setting the Default document. Each one decides whether it touched Source
 * material, and so whether a Rebuild is requested. Routes only check who's signed in, read the
 * request and send back the result (see `http.ts`).
 */
import {
  DefaultTakenError,
  DocumentNotFoundError,
  failure,
  UnreadableFileError,
  type Document,
  type DocumentAspect,
  type DocumentChange,
  type DocumentDeps,
  type DocumentResult,
  type DocumentType,
  type DocumentUpdate,
  type Failure,
  type NewDocument,
} from "./document";
import { FILE_TOO_LARGE_MESSAGE, resolveType, uploadProblem } from "./file-format";
import { storagePathFor, UPLOAD_BUCKET } from "./files";
import { MAX_PROJECTS, MAX_PROJECT_DESCRIPTION_LENGTH, MAX_PROJECT_TITLE_LENGTH } from "@/lib/projects";

const MAX_UPLOADS_PER_TYPE = 20;
const MAX_LABEL_LENGTH = 200;

function cleanLabel(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, MAX_LABEL_LENGTH);
  return trimmed || null;
}

/**
 * Whether a change touched Source material, which the Career Story is built
 * from: every aspect but the Default document, and a name only when it's an
 * Example Work's title.
 */
function touchesSourceMaterial(type: DocumentType, changed: DocumentAspect[]): boolean {
  return changed.some((aspect) => aspect !== "default" && (aspect !== "name" || type === "project"));
}

/** Ends a successful change, requesting a Rebuild if it touched Source material. */
async function finish(deps: DocumentDeps, documents: Document[], changed: DocumentAspect[]): Promise<DocumentChange> {
  const rebuildRequested = documents.length > 0 && touchesSourceMaterial(documents[0].document_type, changed);
  if (rebuildRequested) await deps.rebuild.request();
  return { ok: true, documents, changed, rebuildRequested };
}

/**
 * The uploaded file with the standard MIME type for its kind, or why it can't
 * be uploaded. Readers, storage and the saved Document all use that type, even
 * when the browser gave the file none.
 */
function normaliseUpload(file: File): File | Failure {
  const problem = uploadProblem(file);
  if (problem) return failure(problem === FILE_TOO_LARGE_MESSAGE ? "too_large" : "unsupported_type", problem);
  const type = resolveType(file) ?? file.type;
  return type === file.type ? file : new File([file], file.name, { type, lastModified: file.lastModified });
}

/** Runs a reader call, turning its errors into failures. */
async function readFile<T>(run: () => Promise<T>): Promise<T | Failure> {
  try {
    return await run();
  } catch (err) {
    if (err instanceof UnreadableFileError) return failure("unreadable", err.message);
    console.error("Couldn't read an uploaded file", err);
    return failure("save_failed", "Something went wrong reading that file. Please try again.");
  }
}

const EXAMPLE_WORK_LIMIT_MESSAGE = `You can keep up to ${MAX_PROJECTS} projects. Delete one to add another.`;

const COULDNT_SAVE = "Couldn't save the document. Please try again.";

/** How many more Example Works the user can add, or a failure. */
async function exampleWorkRoom(deps: DocumentDeps): Promise<number | Failure> {
  try {
    const remaining = MAX_PROJECTS - (await deps.store.count("project"));
    return remaining > 0 ? remaining : failure("limit_reached", EXAMPLE_WORK_LIMIT_MESSAGE);
  } catch (err) {
    console.error("Couldn't count documents", err);
    return failure("save_failed", COULDNT_SAVE);
  }
}

const isFailure = (value: unknown): value is Failure =>
  typeof value === "object" && value !== null && (value as Failure).ok === false;

/** Removes a stored file that nothing points at any more. Only logs if it can't. */
async function removeUnusedFile(deps: DocumentDeps, path: string, why: string): Promise<void> {
  try {
    await deps.store.removeFile(path);
  } catch (err) {
    console.error(`Couldn't remove the stored file ${path} ${why}`, err);
  }
}

/**
 * Stores the file, then inserts the rows pointing at it. If the insert fails,
 * the file is removed, so a failed add leaves nothing behind.
 */
async function storeAndInsert(
  deps: DocumentDeps,
  path: string,
  file: File,
  rows: NewDocument[],
): Promise<Document[] | Failure> {
  try {
    await deps.store.putFile(path, file);
  } catch (err) {
    console.error(`Couldn't store the uploaded file ${path}`, err);
    return failure("save_failed", "Couldn't save the file. Please try again.");
  }

  try {
    return await insertRetryingDefault(deps, rows);
  } catch (err) {
    console.error("Couldn't save the uploaded document", err);
    await removeUnusedFile(deps, path, "after a failed save");
    return failure("save_failed", COULDNT_SAVE);
  }
}

/** A concurrent add may have claimed the Default document first: then this one isn't the default. */
async function insertRetryingDefault(deps: DocumentDeps, rows: NewDocument[]): Promise<Document[]> {
  try {
    return await deps.store.insert(rows);
  } catch (err) {
    if (!(err instanceof DefaultTakenError)) throw err;
    return deps.store.insert(rows.map((r) => ({ ...r, is_default: false })));
  }
}

export interface UploadInput {
  file: File | null;
  documentType: unknown;
  displayName?: unknown;
  targetRole?: unknown;
}

/**
 * Adds an uploaded Resume or Cover letter. The file is checked, read, stored
 * and then saved; the first of its type becomes the Default document.
 */
export async function addUploadedDocument(deps: DocumentDeps, input: UploadInput): Promise<DocumentResult> {
  const { documentType } = input;
  if (documentType !== "resume" && documentType !== "cover_letter") {
    return failure("invalid", "Invalid document type");
  }
  if (!input.file) return failure("invalid", "No file provided");
  const file = normaliseUpload(input.file);
  if (isFailure(file)) return file;

  let existing: number;
  try {
    existing = await deps.store.count(documentType, { source: "uploaded" });
  } catch (err) {
    console.error("Couldn't count documents", err);
    return failure("save_failed", COULDNT_SAVE);
  }
  if (existing >= MAX_UPLOADS_PER_TYPE) {
    return failure(
      "limit_reached",
      `You can keep up to ${MAX_UPLOADS_PER_TYPE} of each document type. Delete one to upload another.`,
    );
  }

  const markdown = await readFile(() => deps.reader.toMarkdown(file));
  if (isFailure(markdown)) return markdown;

  const path = storagePathFor(documentType, deps.userId, file.name);
  const docs = await storeAndInsert(deps, path, file, [
    {
      document_type: documentType,
      source: "uploaded",
      original_filename: file.name,
      display_name: cleanLabel(input.displayName) ?? file.name,
      target_role: cleanLabel(input.targetRole),
      mime_type: file.type,
      file_size_bytes: file.size,
      storage_bucket: UPLOAD_BUCKET,
      storage_path: path,
      parsed_markdown: markdown,
      is_default: existing === 0,
    },
  ]);
  if (isFailure(docs)) return docs;

  return finish(deps, docs, ["added"]);
}

export interface WrittenExampleWorkInput {
  title: unknown;
  description: unknown;
}

/** Adds an Example Work the user typed into the app. */
export async function addWrittenExampleWork(
  deps: DocumentDeps,
  input: WrittenExampleWorkInput,
): Promise<DocumentResult> {
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const description = typeof input.description === "string" ? input.description.trim() : "";
  if (!title) return failure("invalid", "Give the project a title");
  if (!description) return failure("invalid", "Describe the project");
  if (title.length > MAX_PROJECT_TITLE_LENGTH) {
    return failure("invalid", `Titles can be up to ${MAX_PROJECT_TITLE_LENGTH} characters`);
  }
  if (description.length > MAX_PROJECT_DESCRIPTION_LENGTH) {
    return failure(
      "invalid",
      `Descriptions can be up to ${MAX_PROJECT_DESCRIPTION_LENGTH.toLocaleString("en-US")} characters`,
    );
  }

  const room = await exampleWorkRoom(deps);
  if (isFailure(room)) return room;

  let docs: Document[];
  try {
    docs = await deps.store.insert([
      {
        document_type: "project",
        source: "written",
        original_filename: null,
        display_name: title,
        target_role: null,
        mime_type: null,
        file_size_bytes: null,
        storage_bucket: null,
        storage_path: null,
        parsed_markdown: description,
        is_default: false,
      },
    ]);
  } catch (err) {
    console.error("Couldn't save a written Example Work", err);
    return failure("save_failed", COULDNT_SAVE);
  }

  return finish(deps, docs, ["added"]);
}

/**
 * Splits an uploaded file into Example Works and adds each one. They all
 * point at the one stored file. Either every Example Work is added or none is.
 */
export async function importExampleWorks(deps: DocumentDeps, input: { file: File | null }): Promise<DocumentResult> {
  if (!input.file) return failure("invalid", "No file provided");
  const file = normaliseUpload(input.file);
  if (isFailure(file)) return file;

  const room = await exampleWorkRoom(deps);
  if (isFailure(room)) return room;

  const works = await readFile(() => deps.reader.splitExampleWorks(file));
  if (isFailure(works)) return works;
  if (works.length === 0) return failure("unreadable", "We couldn't find any projects in that document.");
  if (works.length > room) {
    return failure(
      "limit_reached",
      `That document has ${works.length} projects, but you have room for ${room} more. You can keep up to ${MAX_PROJECTS}.`,
    );
  }

  const path = storagePathFor("project", deps.userId, file.name);
  const docs = await storeAndInsert(
    deps,
    path,
    file,
    works.map((w) => ({
      document_type: "project" as const,
      source: "uploaded" as const,
      original_filename: file.name,
      display_name: w.title,
      target_role: null,
      mime_type: file.type,
      file_size_bytes: file.size,
      storage_bucket: UPLOAD_BUCKET,
      storage_path: path,
      parsed_markdown: w.description,
      is_default: false,
    })),
  );
  if (isFailure(docs)) return docs;

  return finish(deps, docs, ["added"]);
}

const NOT_FOUND = failure("not_found", "Document not found");

/** The Document, or a failure if there's none or it can't be loaded. */
async function findDocument(deps: DocumentDeps, id: string): Promise<Document | Failure> {
  try {
    return (await deps.store.find(id)) ?? NOT_FOUND;
  } catch (err) {
    console.error(`Couldn't load document ${id}`, err);
    return failure("save_failed", "Couldn't load the document. Please try again.");
  }
}

/**
 * Replaces an uploaded Resume's or Cover letter's file. The Document keeps its
 * ID, name, Target role, Default document setting and Jobs.
 *
 * Order matters: the new file is read first, so a file that can't be read
 * changes nothing; the old file is removed only once the Document points at
 * the new one, and the new file is removed if that fails.
 */
export async function replaceFile(deps: DocumentDeps, id: string, input: { file: File | null }): Promise<DocumentResult> {
  const doc = await findDocument(deps, id);
  if (isFailure(doc)) return doc;
  if (doc.source !== "uploaded" || doc.document_type === "project") {
    return failure("invalid", "Only uploaded resumes and cover letters can have their file replaced");
  }
  if (!input.file) return failure("invalid", "No file provided");
  const file = normaliseUpload(input.file);
  if (isFailure(file)) return file;

  const markdown = await readFile(() => deps.reader.toMarkdown(file));
  if (isFailure(markdown)) return markdown;

  const path = storagePathFor(doc.document_type, deps.userId, file.name);
  try {
    await deps.store.putFile(path, file);
  } catch (err) {
    console.error(`Couldn't store the replacement file ${path}`, err);
    return failure("save_failed", "Couldn't save the file. Please try again.");
  }

  let updated: Document | null;
  try {
    updated = await deps.store.update(id, {
      storage_bucket: UPLOAD_BUCKET,
      storage_path: path,
      original_filename: file.name,
      mime_type: file.type,
      file_size_bytes: file.size,
      parsed_markdown: markdown,
    });
  } catch (err) {
    console.error(`Couldn't point document ${id} at its new file`, err);
    await removeUnusedFile(deps, path, "after a failed replace");
    return failure("save_failed", COULDNT_SAVE);
  }
  if (!updated) {
    // Deleted while the file was being read.
    await removeUnusedFile(deps, path, "after a failed replace");
    return NOT_FOUND;
  }

  // The Document already uses the new file; an old file left behind only costs storage.
  if (doc.storage_bucket === UPLOAD_BUCKET && doc.storage_path && doc.storage_path !== path) {
    await removeUnusedFile(deps, doc.storage_path, "after it was replaced");
  }

  return finish(deps, [updated], ["file", "text"]);
}

export interface EditInput {
  /** Each field left undefined is left as it is. */
  displayName?: unknown;
  /** null or blank clears it. */
  targetRole?: unknown;
  /** An Example Work's text. */
  parsedMarkdown?: unknown;
}

type EditFields = Pick<DocumentUpdate, "display_name" | "target_role" | "parsed_markdown">;

const EDITED_ASPECT: Record<keyof EditFields, DocumentAspect> = {
  display_name: "name",
  target_role: "target_role",
  parsed_markdown: "text",
};

/** The checked fields to save, or a failure. */
function editFields(input: EditInput): EditFields | Failure {
  const fields: EditFields = {};
  const { displayName, targetRole, parsedMarkdown } = input;

  if (displayName !== undefined) {
    const name = cleanLabel(displayName);
    if (!name) return failure("invalid", "Name can't be empty");
    fields.display_name = name;
  }
  if (targetRole !== undefined) {
    if (targetRole !== null && typeof targetRole !== "string") return failure("invalid", "Invalid target role");
    fields.target_role = cleanLabel(targetRole);
  }
  if (parsedMarkdown !== undefined) {
    const text = typeof parsedMarkdown === "string" ? parsedMarkdown.trim() : "";
    if (!text) return failure("invalid", "Description can't be empty");
    if (text.length > MAX_PROJECT_DESCRIPTION_LENGTH) {
      return failure(
        "invalid",
        `Descriptions can be up to ${MAX_PROJECT_DESCRIPTION_LENGTH.toLocaleString("en-US")} characters`,
      );
    }
    fields.parsed_markdown = text;
  }

  if (Object.keys(fields).length === 0) return failure("invalid", "No fields to update");
  return fields;
}

/**
 * Edits a Document's name, Target role or (for an Example Work) text. A
 * Rebuild is requested only if Source material changed: the Target role, or
 * an Example Work's title or text. A Resume's or Cover letter's name isn't.
 */
export async function editDocument(deps: DocumentDeps, id: string, input: EditInput): Promise<DocumentResult> {
  const fields = editFields(input);
  if (isFailure(fields)) return fields;

  const doc = await findDocument(deps, id);
  if (isFailure(doc)) return doc;
  const isExampleWork = doc.document_type === "project";
  if (fields.parsed_markdown !== undefined && !isExampleWork) {
    return failure("invalid", "Only a project's description can be edited");
  }

  const changedKeys = (Object.keys(fields) as (keyof EditFields)[]).filter((key) => fields[key] !== doc[key]);
  if (changedKeys.length === 0) return finish(deps, [doc], []);

  let updated: Document | null;
  try {
    updated = await deps.store.update(id, Object.fromEntries(changedKeys.map((key) => [key, fields[key]])));
  } catch (err) {
    console.error(`Couldn't update document ${id}`, err);
    return failure("save_failed", COULDNT_SAVE);
  }
  if (!updated) return NOT_FOUND;

  return finish(deps, [updated], changedKeys.map((key) => EDITED_ASPECT[key]));
}

/** Runs a store call, turning its `DocumentNotFoundError` into a not_found failure and other errors into save_failed. */
async function runOnDocument(id: string, what: string, run: () => Promise<void>): Promise<Failure | null> {
  try {
    await run();
    return null;
  } catch (err) {
    if (err instanceof DocumentNotFoundError) return NOT_FOUND;
    console.error(`Couldn't ${what} document ${id}`, err);
    return failure("save_failed", `Couldn't ${what} the document. Please try again.`);
  }
}

/**
 * Makes an uploaded Resume or Cover letter its type's Default document. Which
 * Document is the default isn't Source material, so there's no Rebuild.
 */
export async function setDefaultDocument(deps: DocumentDeps, id: string): Promise<DocumentResult> {
  const problem = await runOnDocument(id, "update", () => deps.store.setDefault(id));
  if (problem) return problem;
  const doc = await findDocument(deps, id);
  if (isFailure(doc)) return doc;
  return finish(deps, [doc], ["default"]);
}

/** Deletes a Document. Its file stays in storage. */
export async function deleteDocument(deps: DocumentDeps, id: string): Promise<DocumentResult> {
  const doc = await findDocument(deps, id);
  if (isFailure(doc)) return doc;
  const problem = await runOnDocument(id, "delete", () => deps.store.softDelete(id));
  if (problem) return problem;
  return finish(deps, [doc], ["deleted"]);
}
