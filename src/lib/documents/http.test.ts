import { describe, expect, it } from "vitest";
import { failure, type FailureKind } from "./document";
import { documentResponse } from "./http";

describe("documentResponse", () => {
  it.each<[FailureKind, number]>([
    ["not_found", 404],
    ["invalid", 400],
    ["unsupported_type", 400],
    ["too_large", 413],
    ["limit_reached", 409],
    ["unreadable", 422],
    ["save_failed", 500],
  ])("sends %s as %i with its message", async (kind, status) => {
    const res = documentResponse(failure(kind, "Something's wrong"));
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({ error: "Something's wrong", kind });
  });

  it("sends a change with the Documents and what it changed", async () => {
    const res = documentResponse({ ok: true, documents: [], rebuildRequested: true, contentChanged: false }, 201);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ documents: [], rebuildRequested: true, contentChanged: false });
  });
});
