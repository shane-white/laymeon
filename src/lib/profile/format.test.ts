import { describe, expect, it } from "vitest";
import {
  describeSkillUse,
  formatDateRange,
  formatDuration,
  formatDurationShort,
  formatProfileDate,
  isProfileStale,
} from "./format";
import type { CareerProfile } from "./schema";

describe("formatDuration", () => {
  it("writes years and months", () => {
    expect(formatDuration(14)).toBe("1 yr 2 mos");
    expect(formatDuration(24)).toBe("2 yrs");
    expect(formatDuration(1)).toBe("1 mo");
    expect(formatDuration(13)).toBe("1 yr 1 mo");
  });

  it("is null for no duration", () => {
    expect(formatDuration(null)).toBeNull();
    expect(formatDuration(0)).toBeNull();
  });
});

describe("formatDurationShort", () => {
  it("rounds to half years", () => {
    expect(formatDurationShort(8)).toBe("8 mos");
    expect(formatDurationShort(14)).toBe("1 yr");
    expect(formatDurationShort(30)).toBe("2.5 yrs");
    expect(formatDurationShort(55)).toBe("4.5 yrs");
  });
});

describe("dates", () => {
  it("formats profile dates", () => {
    expect(formatProfileDate("2021-03")).toBe("Mar 2021");
    expect(formatProfileDate("2019")).toBe("2019");
    expect(formatProfileDate("present")).toBe("Present");
    expect(formatProfileDate(null)).toBeNull();
  });

  it("formats ranges with a missing end", () => {
    expect(formatDateRange("2021-03", "present")).toBe("Mar 2021 – Present");
    expect(formatDateRange("2019", "2019")).toBe("2019");
    expect(formatDateRange(null, "2018")).toBe("2018");
    expect(formatDateRange(null, null)).toBeNull();
  });
});

describe("describeSkillUse", () => {
  it("adds when the skill was last used, unless it's current", () => {
    expect(describeSkillUse({ months: 36, lastUsed: "present" })).toBe("3 yrs");
    expect(describeSkillUse({ months: 36, lastUsed: "2021-06" })).toBe("3 yrs, until 2021");
    expect(describeSkillUse({ months: null, lastUsed: null })).toBeNull();
  });
});

describe("isProfileStale", () => {
  const profile = {
    builtAt: "2026-11-13T12:00:00.000Z",
    sources: [{ documentId: "a" }, { documentId: "b" }],
  } as CareerProfile;

  it("is fresh when no document changed since the build", () => {
    expect(
      isProfileStale(profile, [
        { id: "a", updated_at: "2026-11-12T00:00:00+00:00" },
        { id: "b", updated_at: "2026-11-13T11:59:59+00:00" },
      ]),
    ).toBe(false);
  });

  it("is stale when a document was edited, added or deleted", () => {
    expect(
      isProfileStale(profile, [
        { id: "a", updated_at: "2026-11-13T12:00:01+00:00" },
        { id: "b", updated_at: "2026-11-12T00:00:00+00:00" },
      ]),
    ).toBe(true);
    expect(
      isProfileStale(profile, [
        { id: "a", updated_at: "2026-11-12T00:00:00+00:00" },
        { id: "b", updated_at: "2026-11-12T00:00:00+00:00" },
        { id: "c", updated_at: "2026-11-12T00:00:00+00:00" },
      ]),
    ).toBe(true);
    expect(isProfileStale(profile, [{ id: "a", updated_at: "2026-11-12T00:00:00+00:00" }])).toBe(true);
  });
});
