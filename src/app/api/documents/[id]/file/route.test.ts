import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { parseDocument } from "@/lib/ai/parse-document";
import { scheduleRebuild } from "@/lib/profile/auto-rebuild";
import { createClient } from "@/lib/supabase/server";
import { POST } from "./route";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/ai/parse-document", () => ({ parseDocument: vi.fn() }));
vi.mock("@/lib/profile/auto-rebuild", () => ({ scheduleRebuild: vi.fn() }));

const PDF = "application/pdf";
const OLD = { id: "doc-1", document_type: "resume", source: "uploaded", storage_bucket: "imported-documents", storage_path: "resumes/u1/1-old.pdf" };

/** A fake Supabase client that records what the route does, in order. */
function fake({ doc = OLD as unknown, updateFails = false } = {}) {
  const log: string[] = [];
  const chain = (result: unknown, label: string) => {
    const c: Record<string, unknown> = {};
    for (const m of ["select", "eq", "is"]) c[m] = () => c;
    c.maybeSingle = async () => {
      log.push(label);
      return result;
    };
    return c;
  };
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
    from: () => ({
      select: () => chain({ data: doc, error: null }, "load"),
      update: (row: Record<string, unknown>) => {
        log.push(`update ${row.storage_path}`);
        return chain(updateFails ? { data: null, error: { message: "db down" } } : { data: { ...OLD, ...row }, error: null }, "updated");
      },
    }),
    storage: {
      from: () => ({
        upload: async (path: string) => {
          log.push(`upload ${path}`);
          return { error: null };
        },
        remove: async (paths: string[]) => {
          log.push(`remove ${paths.join(",")}`);
          return { error: null };
        },
      }),
    },
  };
  vi.mocked(createClient).mockResolvedValue(client as never);
  return log;
}

function request(file: File | null) {
  const form = new FormData();
  if (file) form.append("file", file);
  return new NextRequest("http://localhost/api/documents/doc-1/file", { method: "POST", body: form });
}

const params = { params: Promise.resolve({ id: "doc-1" }) };
const newFile = () => new File(["%PDF-1.4"], "new.pdf", { type: PDF });

beforeEach(() => {
  vi.mocked(parseDocument).mockReset().mockResolvedValue({ markdown: "# New resume" });
  vi.mocked(scheduleRebuild).mockReset();
});

describe("POST /api/documents/[id]/file", () => {
  it("parses, uploads, points the document at the new file, then removes the old one", async () => {
    const log = fake();
    const res = await POST(request(newFile()), params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ id: "doc-1", original_filename: "new.pdf", parsed_markdown: "# New resume" });

    const upload = log.find((l) => l.startsWith("upload "))!;
    const newPath = upload.slice("upload ".length);
    expect(newPath).toMatch(/^resumes\/u1\/\d+-new\.pdf$/);
    expect(log).toEqual(["load", `upload ${newPath}`, `update ${newPath}`, "updated", `remove ${OLD.storage_path}`]);
    expect(parseDocument).toHaveBeenCalledOnce();
    expect(scheduleRebuild).toHaveBeenCalledOnce();
  });

  it("changes nothing when the new file can't be read", async () => {
    const log = fake();
    vi.mocked(parseDocument).mockRejectedValue(new Error("Could not extract any text"));
    const res = await POST(request(newFile()), params);
    expect(res.status).toBe(400);
    expect(log).toEqual(["load"]);
    expect(scheduleRebuild).not.toHaveBeenCalled();
  });

  it("keeps the old file and removes the new one when saving fails", async () => {
    const log = fake({ updateFails: true });
    const res = await POST(request(newFile()), params);
    expect(res.status).toBe(500);
    const newPath = log.find((l) => l.startsWith("upload "))!.slice("upload ".length);
    expect(log.at(-1)).toBe(`remove ${newPath}`);
    expect(log).not.toContain(`remove ${OLD.storage_path}`);
  });

  it.each([
    ["a missing document", null, 404],
    ["a project", { ...OLD, document_type: "project", source: "written" }, 400],
    ["a generated document", { ...OLD, source: "generated" }, 400],
  ])("refuses %s", async (_name, doc, status) => {
    const log = fake({ doc });
    expect((await POST(request(newFile()), params)).status).toBe(status);
    expect(log).toEqual(["load"]);
  });

  it("refuses an unsupported or missing file", async () => {
    fake();
    expect((await POST(request(new File(["x"], "a.png", { type: "image/png" })), params)).status).toBe(400);
    expect((await POST(request(null), params)).status).toBe(400);
    expect(parseDocument).not.toHaveBeenCalled();
  });
});
