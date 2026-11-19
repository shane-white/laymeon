import { describe, expect, it } from "vitest";
import { UnreadableFileError } from "./document";
import { addUploadedDocument, addWrittenExampleWork, importExampleWorks } from "./lifecycle";
import { memoryStore, rebuildRecorder, scriptedReader } from "./testing";

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

    expect(result).toMatchObject({ ok: true, rebuildRequested: true, contentChanged: true });
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
    ["an RTF file", new File(["{\\rtf1}"], "resume.rtf", { type: "application/rtf" }), "unsupported_type", "Please upload a PDF or Word file"],
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
      contentChanged: true,
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
    expect(result).toMatchObject({ ok: true, rebuildRequested: true, contentChanged: true });
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
