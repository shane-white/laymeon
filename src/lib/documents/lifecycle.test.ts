import { describe, expect, it } from "vitest";
import { UnreadableFileError, type Document } from "./document";
import {
  addUploadedDocument,
  addWrittenExampleWork,
  deleteDocument,
  editDocument,
  importExampleWorks,
  replaceFile,
  setDefaultDocument,
} from "./lifecycle";
import { memoryStore, rebuildRecorder, scriptedReader, type MemoryStore } from "./testing";

const PDF = "application/pdf";
const pdf = (name = "resume.pdf", size?: number) => {
  const file = new File(["%PDF-1.4"], name, { type: PDF });
  if (size !== undefined) Object.defineProperty(file, "size", { value: size });
  return file;
};

function setup(reader = scriptedReader({ markdown: "# My resume" }), store = memoryStore()) {
  const rebuild = rebuildRecorder();
  return { deps: { userId: "u1", store, reader, rebuild }, store, rebuild };
}

describe("adding an uploaded Resume or Cover letter", () => {
  it("reads the file, stores it, saves the Document and requests a Rebuild", async () => {
    const { deps, store, rebuild } = setup();
    const result = await addUploadedDocument(deps, {
      file: pdf(),
      documentType: "resume",
      displayName: "  Design resume ",
      targetRole: "Product Designer",
    });

    expect(result).toMatchObject({ ok: true, rebuildRequested: true, changed: ["added"] });
    if (!result.ok) return;
    expect(result.documents).toHaveLength(1);
    const [doc] = result.documents;
    expect(doc).toMatchObject({
      document_type: "resume",
      source: "uploaded",
      display_name: "Design resume",
      target_role: "Product Designer",
      original_filename: "resume.pdf",
      mime_type: PDF,
      parsed_markdown: "# My resume",
      is_default: true,
    });
    expect(doc.storage_path).toMatch(/^resumes\/u1\/\d+-resume\.pdf$/);
    expect(store.files()).toEqual([doc.storage_path]);
    expect(store.documents()).toEqual([doc]);
    expect(rebuild.requests).toBe(1);
  });

  it("names the Document after its file when no name is given, and only the first of a type is the default", async () => {
    const { deps } = setup();
    await addUploadedDocument(deps, { file: pdf("first.pdf"), documentType: "cover_letter" });
    const second = await addUploadedDocument(deps, { file: pdf("second.pdf"), documentType: "cover_letter", displayName: "  " });
    expect(second).toMatchObject({ ok: true, documents: [{ display_name: "second.pdf", is_default: false, target_role: null }] });
  });

  it("isn't the default when a concurrent upload claimed it first", async () => {
    const store = memoryStore({
      beforeInsert: (s) => {
        if (s.documents().length === 0) s.seed({ document_type: "resume", is_default: true });
      },
    });
    const { deps } = setup(undefined, store);
    const result = await addUploadedDocument(deps, { file: pdf(), documentType: "resume" });
    expect(result).toMatchObject({ ok: true, documents: [{ is_default: false }] });
    expect(store.documents().filter((d) => d.is_default)).toHaveLength(1);
  });

  it.each([
    ["a file over 10 MB", pdf("big.pdf", 10 * 1024 * 1024 + 1), "too_large", "File is too large. Maximum size is 10 MB."],
    ["a text file", new File(["hi"], "resume.txt", { type: "text/plain" }), "unsupported_type", "Please upload a PDF, Word, RTF or ODT file"],
    ["no file", null, "invalid", "No file provided"],
  ])("refuses %s before reading or storing anything", async (_name, file, kind, message) => {
    const reader = scriptedReader({ markdown: "# x" });
    const { deps, store, rebuild } = setup(reader);
    const result = await addUploadedDocument(deps, { file, documentType: "resume" });
    expect(result).toEqual({ ok: false, kind, message });
    expect(reader.calls).toBe(0);
    expect(store.files()).toEqual([]);
    expect(rebuild.requests).toBe(0);
  });

  it("accepts an RTF file the browser gave no type, and saves it with the standard RTF type", async () => {
    const reader = scriptedReader({ markdown: "# My resume" });
    const { deps } = setup(reader);
    const file = new File(["{\rtf1 Jane}"], "resume.rtf", { type: "" });
    const result = await addUploadedDocument(deps, { file, documentType: "resume" });
    expect(result).toMatchObject({ ok: true, documents: [{ mime_type: "application/rtf", original_filename: "resume.rtf" }] });
    expect(reader.files.map((f) => [f.name, f.type])).toEqual([["resume.rtf", "application/rtf"]]);
  });

  it("accepts a file of exactly 10 MB", async () => {
    const { deps } = setup();
    const result = await addUploadedDocument(deps, { file: pdf("max.pdf", 10 * 1024 * 1024), documentType: "resume" });
    expect(result.ok).toBe(true);
  });

  it("refuses an Example Work or unknown document type", async () => {
    const { deps } = setup();
    for (const documentType of ["project", "photo", undefined]) {
      expect(await addUploadedDocument(deps, { file: pdf(), documentType })).toMatchObject({ ok: false, kind: "invalid" });
    }
  });

  it("refuses a 21st upload of a type, but counts each type separately", async () => {
    const store = memoryStore();
    for (let i = 0; i < 20; i++) store.seed({ document_type: "resume" });
    store.seed({ document_type: "resume", source: "generated" });
    const { deps } = setup(undefined, store);

    expect(await addUploadedDocument(deps, { file: pdf(), documentType: "resume" })).toEqual({
      ok: false,
      kind: "limit_reached",
      message: "You can keep up to 20 of each document type. Delete one to upload another.",
    });
    expect(await addUploadedDocument(deps, { file: pdf(), documentType: "cover_letter" })).toMatchObject({ ok: true });
  });

  it("stores nothing when the file can't be read", async () => {
    const { deps, store, rebuild } = setup(scriptedReader({ markdown: new UnreadableFileError("Could not extract any text from the document") }));
    expect(await addUploadedDocument(deps, { file: pdf(), documentType: "resume" })).toEqual({
      ok: false,
      kind: "unreadable",
      message: "Could not extract any text from the document",
    });
    expect(store.files()).toEqual([]);
    expect(store.documents()).toEqual([]);
    expect(rebuild.requests).toBe(0);
  });

  it("reports a reader outage as a failure to retry, not an unreadable file", async () => {
    const { deps, store } = setup(scriptedReader({ markdown: new Error("529 overloaded") }));
    const result = await addUploadedDocument(deps, { file: pdf(), documentType: "resume" });
    expect(result).toMatchObject({ ok: false, kind: "save_failed" });
    expect(store.files()).toEqual([]);
  });

  it("removes the stored file when saving the Document fails", async () => {
    const { deps, store, rebuild } = setup(undefined, memoryStore({ failInsert: true }));
    const result = await addUploadedDocument(deps, { file: pdf(), documentType: "resume" });
    expect(result).toEqual({ ok: false, kind: "save_failed", message: "Couldn't save the document. Please try again." });
    expect(store.files()).toEqual([]);
    expect(store.documents()).toEqual([]);
    expect(rebuild.requests).toBe(0);
  });

  it("saves nothing when storing the file fails", async () => {
    const { deps, store } = setup(undefined, memoryStore({ failPutFile: true }));
    expect(await addUploadedDocument(deps, { file: pdf(), documentType: "resume" })).toMatchObject({ ok: false, kind: "save_failed" });
    expect(store.documents()).toEqual([]);
  });
});

describe("adding a written Example Work", () => {
  it("saves it with no file and requests a Rebuild", async () => {
    const { deps, store, rebuild } = setup();
    const result = await addWrittenExampleWork(deps, { title: " Checkout redesign ", description: " I led it. " });
    expect(result).toMatchObject({
      ok: true,
      rebuildRequested: true,
      changed: ["added"],
      documents: [
        {
          document_type: "project",
          source: "written",
          display_name: "Checkout redesign",
          parsed_markdown: "I led it.",
          storage_path: null,
          is_default: false,
        },
      ],
    });
    expect(store.files()).toEqual([]);
    expect(rebuild.requests).toBe(1);
  });

  it.each([
    [{ title: "", description: "x" }, "Give the project a title"],
    [{ title: "x", description: "  " }, "Describe the project"],
    [{ title: 42, description: "x" }, "Give the project a title"],
    [{ title: "x".repeat(201), description: "x" }, "Titles can be up to 200 characters"],
    [{ title: "x", description: "x".repeat(10001) }, "Descriptions can be up to 10,000 characters"],
  ])("refuses %o", async (input, message) => {
    const { deps, store } = setup();
    expect(await addWrittenExampleWork(deps, input)).toEqual({ ok: false, kind: "invalid", message });
    expect(store.documents()).toEqual([]);
  });

  it("refuses a 51st Example Work, written or uploaded", async () => {
    const store = memoryStore();
    for (let i = 0; i < 25; i++) store.seed({ document_type: "project", source: "written" });
    for (let i = 0; i < 25; i++) store.seed({ document_type: "project", source: "uploaded" });
    const { deps } = setup(undefined, store);
    expect(await addWrittenExampleWork(deps, { title: "x", description: "y" })).toEqual({
      ok: false,
      kind: "limit_reached",
      message: "You can keep up to 50 projects. Delete one to add another.",
    });
  });

  it("reports a failed save", async () => {
    const { deps, rebuild } = setup(undefined, memoryStore({ failInsert: true }));
    expect(await addWrittenExampleWork(deps, { title: "x", description: "y" })).toMatchObject({ ok: false, kind: "save_failed" });
    expect(rebuild.requests).toBe(0);
  });
});

describe("importing Example Works from a file", () => {
  const works = (n: number) => Array.from({ length: n }, (_, i) => ({ title: `Work ${i + 1}`, description: `Did thing ${i + 1}` }));

  it("adds one Example Work per project in the file, all sharing one stored file", async () => {
    const { deps, store, rebuild } = setup(scriptedReader({ exampleWorks: works(2) }));
    const result = await importExampleWorks(deps, { file: pdf("portfolio.pdf") });
    expect(result).toMatchObject({ ok: true, rebuildRequested: true, changed: ["added"] });
    if (!result.ok) return;
    expect(result.documents).toMatchObject([
      { document_type: "project", source: "uploaded", display_name: "Work 1", parsed_markdown: "Did thing 1", original_filename: "portfolio.pdf" },
      { document_type: "project", source: "uploaded", display_name: "Work 2", parsed_markdown: "Did thing 2", original_filename: "portfolio.pdf" },
    ]);
    const [path] = store.files();
    expect(store.files()).toHaveLength(1);
    expect(path).toMatch(/^projects\/u1\/\d+-portfolio\.pdf$/);
    expect(result.documents.map((d) => d.storage_path)).toEqual([path, path]);
    expect(rebuild.requests).toBe(1);
  });

  it("saves an ODT file the browser gave a generic type with the standard ODT type", async () => {
    const reader = scriptedReader({ exampleWorks: works(1) });
    const { deps } = setup(reader);
    const file = new File(["PK"], "portfolio.odt", { type: "application/octet-stream" });
    const result = await importExampleWorks(deps, { file });
    expect(result).toMatchObject({ ok: true, documents: [{ mime_type: "application/vnd.oasis.opendocument.text" }] });
    expect(reader.files.map((f) => f.type)).toEqual(["application/vnd.oasis.opendocument.text"]);
  });

  it("refuses a file over 10 MB before reading it", async () => {
    const reader = scriptedReader({ exampleWorks: works(1) });
    const { deps, store } = setup(reader);
    expect(await importExampleWorks(deps, { file: pdf("big.pdf", 10 * 1024 * 1024 + 1) })).toMatchObject({ ok: false, kind: "too_large" });
    expect(reader.calls).toBe(0);
    expect(store.files()).toEqual([]);
  });

  it("refuses when the user already has 50 Example Works, before reading the file", async () => {
    const store = memoryStore();
    for (let i = 0; i < 50; i++) store.seed({ document_type: "project", source: "written" });
    const reader = scriptedReader({ exampleWorks: works(1) });
    const { deps } = setup(reader, store);
    expect(await importExampleWorks(deps, { file: pdf() })).toMatchObject({ ok: false, kind: "limit_reached" });
    expect(reader.calls).toBe(0);
  });

  it("refuses a file with more Example Works than there's room for, storing nothing", async () => {
    const store = memoryStore();
    for (let i = 0; i < 48; i++) store.seed({ document_type: "project", source: "written" });
    const { deps } = setup(scriptedReader({ exampleWorks: works(3) }), store);
    expect(await importExampleWorks(deps, { file: pdf() })).toEqual({
      ok: false,
      kind: "limit_reached",
      message: "That document has 3 projects, but you have room for 2 more. You can keep up to 50.",
    });
    expect(store.files()).toEqual([]);
    expect(store.documents()).toHaveLength(48);
  });

  it("stores nothing when the file has no projects in it", async () => {
    const { deps, store } = setup(scriptedReader({ exampleWorks: [] }));
    expect(await importExampleWorks(deps, { file: pdf() })).toEqual({
      ok: false,
      kind: "unreadable",
      message: "We couldn't find any projects in that document.",
    });
    expect(store.files()).toEqual([]);
  });

  it("stores nothing when the file can't be read", async () => {
    const { deps, store } = setup(scriptedReader({ exampleWorks: new UnreadableFileError("The document was too long to process") }));
    expect(await importExampleWorks(deps, { file: pdf() })).toEqual({
      ok: false,
      kind: "unreadable",
      message: "The document was too long to process",
    });
    expect(store.files()).toEqual([]);
  });

  it("removes the stored file when saving fails", async () => {
    const { deps, store, rebuild } = setup(scriptedReader({ exampleWorks: works(2) }), memoryStore({ failInsert: true }));
    expect(await importExampleWorks(deps, { file: pdf() })).toMatchObject({ ok: false, kind: "save_failed" });
    expect(store.files()).toEqual([]);
    expect(store.documents()).toEqual([]);
    expect(rebuild.requests).toBe(0);
  });
});

describe("replacing a file", () => {
  const OLD_PATH = "resumes/u1/1-old.pdf";
  const seedResume = (store: MemoryStore, doc: Partial<Document> = {}) =>
    store.seed({
      document_type: "resume",
      display_name: "Design resume",
      target_role: "Product Designer",
      is_default: true,
      original_filename: "old.pdf",
      storage_bucket: "imported-documents",
      storage_path: OLD_PATH,
      parsed_markdown: "# Old resume",
      ...doc,
    });

  it("reads the new file, points the Document at it, removes the old file and requests a Rebuild", async () => {
    const store = memoryStore();
    const old = seedResume(store);
    const { deps, rebuild } = setup(scriptedReader({ markdown: "# New resume" }), store);

    const result = await replaceFile(deps, old.id, { file: pdf("new.pdf") });

    expect(result).toMatchObject({ ok: true, rebuildRequested: true, changed: ["file", "text"] });
    if (!result.ok) return;
    const [doc] = result.documents;
    expect(doc).toMatchObject({
      id: old.id,
      display_name: "Design resume",
      target_role: "Product Designer",
      is_default: true,
      original_filename: "new.pdf",
      mime_type: PDF,
      parsed_markdown: "# New resume",
      storage_bucket: "imported-documents",
    });
    expect(doc.storage_path).toMatch(/^resumes\/u1\/\d+-new\.pdf$/);
    expect(store.files()).toEqual([doc.storage_path]);
    expect(store.documents()).toEqual([doc]);
    expect(rebuild.requests).toBe(1);
  });

  it("saves a replacement RTF file with the standard RTF type", async () => {
    const store = memoryStore();
    const old = seedResume(store);
    const { deps } = setup(scriptedReader({ markdown: "# New resume" }), store);
    const result = await replaceFile(deps, old.id, { file: new File(["{\rtf1}"], "new.rtf", { type: "text/rtf" }) });
    expect(result).toMatchObject({ ok: true, documents: [{ mime_type: "application/rtf", original_filename: "new.rtf" }] });
  });

  it("changes nothing when the new file can't be read", async () => {
    const store = memoryStore();
    const old = seedResume(store);
    const { deps, rebuild } = setup(scriptedReader({ markdown: new UnreadableFileError("Could not extract any text from the document") }), store);
    expect(await replaceFile(deps, old.id, { file: pdf("new.pdf") })).toEqual({
      ok: false,
      kind: "unreadable",
      message: "Could not extract any text from the document",
    });
    expect(store.files()).toEqual([OLD_PATH]);
    expect(store.documents()).toEqual([old]);
    expect(rebuild.requests).toBe(0);
  });

  it("keeps the old file and removes the new one when saving fails", async () => {
    const store = memoryStore({ failUpdate: true });
    const old = seedResume(store);
    const { deps, rebuild } = setup(undefined, store);
    expect(await replaceFile(deps, old.id, { file: pdf("new.pdf") })).toEqual({
      ok: false,
      kind: "save_failed",
      message: "Couldn't save the document. Please try again.",
    });
    expect(store.files()).toEqual([OLD_PATH]);
    expect(store.documents()).toEqual([old]);
    expect(rebuild.requests).toBe(0);
  });

  it("changes nothing when storing the new file fails", async () => {
    const store = memoryStore({ failPutFile: true });
    const old = seedResume(store);
    const { deps, rebuild } = setup(undefined, store);
    expect(await replaceFile(deps, old.id, { file: pdf("new.pdf") })).toMatchObject({ ok: false, kind: "save_failed" });
    expect(store.documents()).toEqual([old]);
    expect(store.files()).toEqual([OLD_PATH]);
    expect(rebuild.requests).toBe(0);
  });

  it("still succeeds when the old file can't be removed", async () => {
    const store = memoryStore({ failRemoveFile: true });
    const old = seedResume(store);
    const { deps } = setup(undefined, store);
    expect(await replaceFile(deps, old.id, { file: pdf("new.pdf") })).toMatchObject({ ok: true });
  });

  it.each([
    ["an Example Work", { document_type: "project", source: "written", is_default: false }],
    ["a generated Document", { source: "generated" }],
  ] as const)("refuses %s before reading the file", async (_name, doc) => {
    const store = memoryStore();
    const old = seedResume(store, doc);
    const reader = scriptedReader({ markdown: "# x" });
    const { deps } = setup(reader, store);
    expect(await replaceFile(deps, old.id, { file: pdf() })).toEqual({
      ok: false,
      kind: "invalid",
      message: "Only uploaded resumes and cover letters can have their file replaced",
    });
    expect(reader.calls).toBe(0);
  });

  it("refuses a missing Document", async () => {
    const { deps } = setup();
    expect(await replaceFile(deps, "nope", { file: pdf() })).toEqual({ ok: false, kind: "not_found", message: "Document not found" });
  });

  it.each([
    ["a file over 10 MB", pdf("big.pdf", 10 * 1024 * 1024 + 1), "too_large"],
    ["a text file", new File(["hi"], "resume.txt", { type: "text/plain" }), "unsupported_type"],
    ["no file", null, "invalid"],
  ])("refuses %s before reading or storing anything", async (_name, file, kind) => {
    const store = memoryStore();
    const old = seedResume(store);
    const reader = scriptedReader({ markdown: "# x" });
    const { deps } = setup(reader, store);
    expect(await replaceFile(deps, old.id, { file })).toMatchObject({ ok: false, kind });
    expect(reader.calls).toBe(0);
    expect(store.files()).toEqual([OLD_PATH]);
  });
});

describe("editing a Document", () => {
  function seeded(doc: Partial<Document> & Pick<Document, "document_type">) {
    const store = memoryStore();
    const seededDoc = store.seed({ display_name: "Old name", target_role: "Designer", parsed_markdown: "Old text", ...doc });
    const { deps, rebuild } = setup(undefined, store);
    return { deps, rebuild, store, id: seededDoc.id };
  }

  it("renames a Resume without a Rebuild", async () => {
    const { deps, rebuild, store, id } = seeded({ document_type: "resume" });
    const result = await editDocument(deps, id, { displayName: "  New name " });
    expect(result).toMatchObject({
      ok: true,
      rebuildRequested: false,
      changed: ["name"],
      documents: [{ id, display_name: "New name" }],
    });
    expect(store.documents()[0].display_name).toBe("New name");
    expect(rebuild.requests).toBe(0);
  });

  it("renames a Cover letter without a Rebuild", async () => {
    const { deps, rebuild, id } = seeded({ document_type: "cover_letter" });
    expect(await editDocument(deps, id, { displayName: "New name" })).toMatchObject({ ok: true, rebuildRequested: false });
    expect(rebuild.requests).toBe(0);
  });

  it("requests a Rebuild when an Example Work is renamed", async () => {
    const { deps, rebuild, id } = seeded({ document_type: "project", source: "written" });
    expect(await editDocument(deps, id, { displayName: "New title" })).toMatchObject({
      ok: true,
      rebuildRequested: true,
      changed: ["name"],
      documents: [{ display_name: "New title" }],
    });
    expect(rebuild.requests).toBe(1);
  });

  it("requests a Rebuild when an Example Work's text changes", async () => {
    const { deps, rebuild, id } = seeded({ document_type: "project", source: "written" });
    expect(await editDocument(deps, id, { parsedMarkdown: " New text " })).toMatchObject({
      ok: true,
      rebuildRequested: true,
      changed: ["text"],
      documents: [{ parsed_markdown: "New text" }],
    });
    expect(rebuild.requests).toBe(1);
  });

  it("requests a Rebuild when the Target role changes", async () => {
    const { deps, rebuild, id } = seeded({ document_type: "resume" });
    expect(await editDocument(deps, id, { displayName: "New name", targetRole: "Researcher" })).toMatchObject({
      ok: true,
      rebuildRequested: true,
      changed: ["name", "target_role"],
      documents: [{ display_name: "New name", target_role: "Researcher" }],
    });
    expect(rebuild.requests).toBe(1);
  });

  it.each([null, "  "])("clears the Target role when given %o", async (targetRole) => {
    const { deps, rebuild, id } = seeded({ document_type: "resume" });
    expect(await editDocument(deps, id, { targetRole })).toMatchObject({ ok: true, changed: ["target_role"], documents: [{ target_role: null }] });
    expect(rebuild.requests).toBe(1);
  });

  it("doesn't request a Rebuild when nothing actually changed", async () => {
    const { deps, rebuild, id } = seeded({ document_type: "project", source: "written" });
    expect(await editDocument(deps, id, { displayName: "Old name", targetRole: " Designer ", parsedMarkdown: "Old text" })).toMatchObject({
      ok: true,
      rebuildRequested: false,
      changed: [],
      documents: [{ id }],
    });
    expect(rebuild.requests).toBe(0);
  });

  it("refuses to edit a Resume's text", async () => {
    const { deps, store, id } = seeded({ document_type: "resume" });
    expect(await editDocument(deps, id, { parsedMarkdown: "New text" })).toEqual({
      ok: false,
      kind: "invalid",
      message: "Only a project's description can be edited",
    });
    expect(store.documents()[0].parsed_markdown).toBe("Old text");
  });

  it.each([
    [{ displayName: "  " }, "Name can't be empty"],
    [{ displayName: 3 }, "Name can't be empty"],
    [{ targetRole: 3 }, "Invalid target role"],
    [{ parsedMarkdown: " " }, "Description can't be empty"],
    [{ parsedMarkdown: "x".repeat(10001) }, "Descriptions can be up to 10,000 characters"],
    [{}, "No fields to update"],
  ])("refuses %o", async (input, message) => {
    const { deps, rebuild, id } = seeded({ document_type: "project", source: "written" });
    expect(await editDocument(deps, id, input)).toEqual({ ok: false, kind: "invalid", message });
    expect(rebuild.requests).toBe(0);
  });

  it("refuses a missing Document", async () => {
    const { deps } = setup();
    expect(await editDocument(deps, "nope", { displayName: "x" })).toEqual({ ok: false, kind: "not_found", message: "Document not found" });
  });

  it("reports a failed save", async () => {
    const store = memoryStore({ failUpdate: true });
    const { id } = store.seed({ document_type: "resume", target_role: null });
    const { deps, rebuild } = setup(undefined, store);
    expect(await editDocument(deps, id, { targetRole: "Researcher" })).toMatchObject({ ok: false, kind: "save_failed" });
    expect(rebuild.requests).toBe(0);
  });
});

describe("setting the Default document", () => {
  it("makes it the default in place of the old one, without a Rebuild", async () => {
    const store = memoryStore();
    store.seed({ document_type: "resume", is_default: true });
    const second = store.seed({ document_type: "resume" });
    const letter = store.seed({ document_type: "cover_letter", is_default: true });
    const { deps, rebuild } = setup(undefined, store);

    expect(await setDefaultDocument(deps, second.id)).toMatchObject({
      ok: true,
      rebuildRequested: false,
      changed: ["default"],
      documents: [{ id: second.id, is_default: true }],
    });
    expect(store.documents().filter((d) => d.is_default).map((d) => d.id)).toEqual([second.id, letter.id]);
    expect(rebuild.requests).toBe(0);
  });

  it.each([
    ["a missing Document", undefined],
    ["an Example Work", { document_type: "project", source: "written" }],
    ["a generated Document", { document_type: "resume", source: "generated" }],
  ] as const)("refuses %s", async (_name, doc) => {
    const store = memoryStore();
    const id = doc ? store.seed(doc).id : "nope";
    const { deps } = setup(undefined, store);
    expect(await setDefaultDocument(deps, id)).toEqual({ ok: false, kind: "not_found", message: "Document not found" });
  });
});

describe("deleting a Document", () => {
  it("removes it, keeps its file and requests a Rebuild", async () => {
    const store = memoryStore();
    const doc = store.seed({ document_type: "resume", storage_path: "resumes/u1/1-a.pdf" });
    const { deps, rebuild } = setup(undefined, store);

    expect(await deleteDocument(deps, doc.id)).toMatchObject({ ok: true, documents: [{ id: doc.id }], rebuildRequested: true, changed: ["deleted"] });
    expect(store.documents()).toEqual([]);
    expect(store.files()).toEqual(["resumes/u1/1-a.pdf"]);
    expect(rebuild.requests).toBe(1);
  });

  it("refuses a missing Document", async () => {
    const { deps, rebuild } = setup();
    expect(await deleteDocument(deps, "nope")).toEqual({ ok: false, kind: "not_found", message: "Document not found" });
    expect(rebuild.requests).toBe(0);
  });
});
