import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { documentDeps } from "@/lib/documents/deps";
import { UnreadableFileError, type DocumentDeps } from "@/lib/documents/document";
import { memoryStore, rebuildRecorder, scriptedReader, type MemoryStore } from "@/lib/documents/testing";
import { createClient } from "@/lib/supabase/server";
import { POST } from "./route";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/documents/deps", () => ({ documentDeps: vi.fn() }));

const PDF = "application/pdf";
const OLD_PATH = "resumes/u1/1-old.pdf";

let store: MemoryStore;
let rebuild: ReturnType<typeof rebuildRecorder>;
let docId: string;

function signIn(user: { id: string } | null, reader = scriptedReader({ markdown: "# New resume" })) {
  vi.mocked(createClient).mockResolvedValue({ auth: { getUser: async () => ({ data: { user } }) } } as never);
  vi.mocked(documentDeps).mockReturnValue({ userId: "u1", store, reader, rebuild } satisfies DocumentDeps);
}

function request(file: File | null) {
  const form = new FormData();
  if (file) form.append("file", file);
  return new NextRequest(`http://localhost/api/documents/${docId}/file`, { method: "POST", body: form });
}

const params = () => ({ params: Promise.resolve({ id: docId }) });
const newFile = () => new File(["%PDF-1.4"], "new.pdf", { type: PDF });

beforeEach(() => {
  store = memoryStore();
  rebuild = rebuildRecorder();
  docId = store.seed({
    document_type: "resume",
    storage_bucket: "imported-documents",
    storage_path: OLD_PATH,
    original_filename: "old.pdf",
  }).id;
});

describe("POST /api/documents/[id]/file", () => {
  it("replaces the file and sends back the Document and what changed", async () => {
    signIn({ id: "u1" });
    const res = await POST(request(newFile()), params());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      documents: [{ id: docId, original_filename: "new.pdf", parsed_markdown: "# New resume" }],
      rebuildRequested: true,
      changed: ["file", "text"],
    });
    expect(store.files()).not.toContain(OLD_PATH);
    expect(rebuild.requests).toBe(1);
  });

  it("refuses someone who isn't signed in", async () => {
    signIn(null);
    expect((await POST(request(newFile()), params())).status).toBe(401);
    expect(store.files()).toEqual([OLD_PATH]);
  });

  it("sends a missing file as a 400", async () => {
    signIn({ id: "u1" });
    const res = await POST(request(null), params());
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "No file provided", kind: "invalid" });
  });

  it("sends a file that can't be read as a 422", async () => {
    signIn({ id: "u1" }, scriptedReader({ markdown: new UnreadableFileError("Could not extract any text from the document") }));
    const res = await POST(request(newFile()), params());
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "Could not extract any text from the document", kind: "unreadable" });
  });

  it("sends a missing Document as a 404", async () => {
    signIn({ id: "u1" });
    docId = "nope";
    expect((await POST(request(newFile()), params())).status).toBe(404);
  });
});
