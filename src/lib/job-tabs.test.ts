import { describe, expect, it } from "vitest";
import { getInitialTabs, getTabsWithContent } from "./job-tabs";
import type { MatchReport } from "@/lib/match-report/schema";

const emptyJob = {
  match_analysis: null,
  match_report: null,
  resume_suggestions: null,
  cover_letter_suggestions: null,
  interview_suggestions: null,
  notes: null,
};

describe("getTabsWithContent", () => {
  it("returns nothing for a job with no saved content", () => {
    expect(getTabsWithContent(emptyJob)).toEqual([]);
  });

  it("ignores empty and whitespace-only text", () => {
    expect(getTabsWithContent({ ...emptyJob, notes: "   ", resume_suggestions: "" })).toEqual([]);
  });

  it("shows the match tab for a structured report without legacy text", () => {
    expect(
      getTabsWithContent({ ...emptyJob, match_report: {} as MatchReport }),
    ).toEqual(["match_analysis"]);
  });

  it("returns tabs in menu order", () => {
    expect(
      getTabsWithContent({
        match_analysis: "a",
        match_report: null,
        resume_suggestions: "r",
        cover_letter_suggestions: "c",
        interview_suggestions: "i",
        notes: "n",
      }),
    ).toEqual([
      "match_analysis",
      "resume_suggestions",
      "cover_letter_suggestions",
      "interview_suggestions",
      "notes",
    ]);
  });
});

describe("getInitialTabs", () => {
  it("defaults to Description only", () => {
    expect(getInitialTabs(emptyJob, null)).toEqual(["description"]);
  });

  it("adds tabs with content when nothing is stored", () => {
    expect(getInitialTabs({ ...emptyJob, match_analysis: "a", notes: "n" }, null)).toEqual([
      "description",
      "match_analysis",
      "notes",
    ]);
  });

  it("keeps stored tabs in their order and appends missing content tabs", () => {
    expect(
      getInitialTabs({ ...emptyJob, match_analysis: "a", notes: "n" }, [
        "description",
        "notes",
        "interview_suggestions",
      ]),
    ).toEqual(["description", "notes", "interview_suggestions", "match_analysis"]);
  });

  it("always puts Description first and drops duplicates", () => {
    expect(getInitialTabs(emptyJob, ["notes", "description", "notes"])).toEqual([
      "description",
      "notes",
    ]);
  });
});
