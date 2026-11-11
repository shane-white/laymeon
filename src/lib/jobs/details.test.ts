import { describe, expect, it } from "vitest";
import { formatLocation, formatSeniorityLevel } from "@/lib/jobs/details";

describe("formatLocation", () => {
  it("joins place and arrangement", () => {
    expect(formatLocation({ location: "Austin, TX", work_arrangement: "hybrid" })).toBe(
      "Austin, TX · Hybrid",
    );
  });

  it("shows whichever part is present", () => {
    expect(formatLocation({ location: "Berlin", work_arrangement: null })).toBe("Berlin");
    expect(formatLocation({ location: null, work_arrangement: "remote" })).toBe("Remote");
    expect(formatLocation({ location: "  ", work_arrangement: "on_site" })).toBe("On-site");
  });

  it("doesn't repeat Remote", () => {
    expect(formatLocation({ location: "remote", work_arrangement: "remote" })).toBe("Remote");
  });

  it("returns null when there is nothing to show", () => {
    expect(formatLocation({ location: null, work_arrangement: null })).toBeNull();
    expect(formatLocation({ location: null, work_arrangement: "unknown" })).toBeNull();
  });
});

describe("formatSeniorityLevel", () => {
  it("labels known levels", () => {
    expect(formatSeniorityLevel("vp")).toBe("VP");
    expect(formatSeniorityLevel("mid")).toBe("Mid-level");
  });

  it("returns null for missing or unknown levels", () => {
    expect(formatSeniorityLevel(null)).toBeNull();
    expect(formatSeniorityLevel("wizard")).toBeNull();
  });
});
