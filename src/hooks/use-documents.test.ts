import { describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import type { Document, DocumentAspect, DocumentType } from "@/lib/documents/document";
import { onDocumentChanged } from "./use-documents";

const doc = (document_type: DocumentType) => ({ id: "doc-1", document_type }) as Document;

/** Which cached queries a Document change refreshed. */
async function refreshedAfter(type: DocumentType, changed: DocumentAspect[], rebuildRequested = false) {
  const queryClient = new QueryClient();
  for (const key of [["documents"], ["career-profile"], ["resume-reviews"], ["resume-review", "doc-1"], ["jobs"]]) {
    queryClient.setQueryData(key, {});
  }
  await onDocumentChanged(queryClient, { documents: [doc(type)], rebuildRequested, changed });
  return queryClient
    .getQueryCache()
    .getAll()
    .filter((q) => q.state.isInvalidated)
    .map((q) => q.queryKey);
}

const REVIEWS = [["resume-reviews"], ["resume-review", "doc-1"]];

describe("onDocumentChanged", () => {
  it("always refreshes the Documents, and the Career Story only after a Rebuild was requested", async () => {
    expect(await refreshedAfter("cover_letter", ["default"])).toEqual([["documents"]]);
    expect(await refreshedAfter("cover_letter", ["target_role"], true)).toEqual([["documents"], ["career-profile"]]);
  });

  it.each<DocumentAspect>(["file", "text", "target_role", "name", "deleted"])(
    "refreshes the Resume Reviews when a Resume's %s changed",
    async (aspect) => {
      expect(await refreshedAfter("resume", [aspect])).toEqual([["documents"], ...REVIEWS]);
    },
  );

  it.each<DocumentAspect>(["added", "default"])("leaves the Resume Reviews alone when a Resume is %s", async (aspect) => {
    expect(await refreshedAfter("resume", [aspect])).toEqual([["documents"]]);
  });

  it("leaves the Resume Reviews alone when anything but a Resume changed", async () => {
    expect(await refreshedAfter("project", ["text", "name"], true)).toEqual([["documents"], ["career-profile"]]);
    expect(await refreshedAfter("cover_letter", ["file", "text"], true)).toEqual([["documents"], ["career-profile"]]);
  });
});
