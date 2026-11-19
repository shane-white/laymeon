import { describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { onDocumentChanged } from "./use-documents";

/** Which cached queries a Document change refreshed. */
async function refreshedAfter(change: { rebuildRequested: boolean; contentChanged: boolean }) {
  const queryClient = new QueryClient();
  for (const key of [["documents"], ["career-profile"], ["resume-reviews"], ["resume-review", "doc-1"], ["jobs"]]) {
    queryClient.setQueryData(key, {});
  }
  await onDocumentChanged(queryClient, { documents: [], ...change });
  return queryClient
    .getQueryCache()
    .getAll()
    .filter((q) => q.state.isInvalidated)
    .map((q) => q.queryKey);
}

describe("onDocumentChanged", () => {
  it("refreshes only the Documents after a change that leaves Source material alone", async () => {
    expect(await refreshedAfter({ rebuildRequested: false, contentChanged: false })).toEqual([["documents"]]);
  });

  it("refreshes the Career Story after a Rebuild was requested", async () => {
    expect(await refreshedAfter({ rebuildRequested: true, contentChanged: false })).toEqual([["documents"], ["career-profile"]]);
  });

  it("refreshes the Resume Reviews after a Document's content changed", async () => {
    expect(await refreshedAfter({ rebuildRequested: false, contentChanged: true })).toEqual([
      ["documents"],
      ["resume-reviews"],
      ["resume-review", "doc-1"],
    ]);
  });
});
