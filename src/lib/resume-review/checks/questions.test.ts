import { describe, expect, it } from "vitest";
import { context, result } from "../__fixtures__/helpers";
import { extraction, position } from "../__fixtures__/resumes";
import type { Extraction } from "@/lib/profile/schema";
import { questionChecks } from "./questions";

function checks(e: Extraction) {
  return questionChecks(context({ extraction: e }));
}

it("passes the example resume", () => {
  expect(questionChecks(context()).filter((r) => r.label !== "good")).toEqual([]);
});

it("isn't run without an extraction", () => {
  expect(questionChecks(context({ extraction: null }))).toEqual([]);
});

describe("gaps", () => {
  it("lists gaps of 6 months or more as information", () => {
    const check = result(
      checks(
        extraction({
          positions: [
            position({ start: "2022-03", end: "present" }),
            position({ start: "2018-01", end: "2021-05" }),
            position({ start: "2016-01", end: "2017-10" }),
          ],
        }),
      ),
      "questions.gaps",
    );
    expect(check.label).toBe("info");
    // Jun 2021 – Feb 2022 is 9 months; Nov – Dec 2017 is too short to list.
    expect(check.evidence).toEqual(["Jun 2021 – Feb 2022 (9 months)"]);
  });

  it("doesn't count overlapping jobs as gaps", () => {
    const e = extraction({
      positions: [position({ start: "2020-01", end: "present" }), position({ start: "2015-01", end: "2020-06" })],
    });
    expect(result(checks(e), "questions.gaps").label).toBe("good");
  });

  it("lists time since the last job ended", () => {
    const e = extraction({ positions: [position({ start: "2020-01", end: "2025-12" })] });
    // The resume was added in Nov 2026.
    expect(result(checks(e), "questions.gaps").evidence).toEqual(["Since Jan 2026 (11 months)"]);
  });
});

describe("short jobs", () => {
  const shortJobs = (employmentType: Extraction["positions"][number]["employmentType"]) =>
    extraction({
      positions: [
        position({ start: "2024-01", end: "present" }),
        position({ title: "A", start: "2023-01", end: "2023-08", employmentType }),
        position({ title: "B", start: "2022-01", end: "2022-09", employmentType }),
        position({ title: "C", start: "2021-01", end: "2021-06", employmentType }),
      ],
    });

  it("lists a pattern of jobs under a year as information", () => {
    const check = result(checks(shortJobs("full_time")), "questions.short_jobs");
    expect(check.label).toBe("info");
    expect(check.evidence).toEqual(["A, Acme (2023-01 – 2023-08)", "B, Acme (2022-01 – 2022-09)", "C, Acme (2021-01 – 2021-06)"]);
  });

  it("doesn't count contracts and internships", () => {
    expect(result(checks(shortJobs("contract")), "questions.short_jobs").label).toBe("good");
  });
});
