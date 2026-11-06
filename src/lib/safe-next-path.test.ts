import { describe, expect, it } from "vitest";
import { safeNextPath } from "./safe-next-path";

describe("safeNextPath", () => {
  it("keeps paths on this site", () => {
    expect(safeNextPath("/reset-password")).toBe("/reset-password");
    expect(safeNextPath("/jobs/123?tab=match")).toBe("/jobs/123?tab=match");
  });

  it("falls back when next is missing", () => {
    expect(safeNextPath(null)).toBe("/jobs");
    expect(safeNextPath("")).toBe("/jobs");
  });

  it("rejects links to other sites", () => {
    expect(safeNextPath("https://evil.com")).toBe("/jobs");
    expect(safeNextPath("//evil.com")).toBe("/jobs");
    expect(safeNextPath("/\\evil.com")).toBe("/jobs");
    expect(safeNextPath("evil.com")).toBe("/jobs");
  });

  it("uses the given fallback", () => {
    expect(safeNextPath(null, "/login")).toBe("/login");
  });
});
