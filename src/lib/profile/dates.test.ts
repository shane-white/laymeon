import { describe, expect, it } from "vitest";
import {
  cleanProfileDate,
  formatMonth,
  monthOfIsoDate,
  rangeToInterval,
  toMonthIndex,
  totalMonths,
} from "./dates";

const NOV_2026 = toMonthIndex(2026, 11);
const months = (start: string | null, end: string | null, asOf = NOV_2026) => {
  const interval = rangeToInterval(start, end, asOf);
  return interval ? interval.end - interval.start : null;
};

describe("cleanProfileDate", () => {
  it("accepts YYYY and YYYY-MM", () => {
    expect(cleanProfileDate("2019")).toBe("2019");
    expect(cleanProfileDate("2019-3")).toBe("2019-03");
    expect(cleanProfileDate(" 2019-03 ")).toBe("2019-03");
  });

  it("rejects anything else", () => {
    expect(cleanProfileDate("March 2019")).toBeNull();
    expect(cleanProfileDate("2019-13")).toBeNull();
    expect(cleanProfileDate("present")).toBeNull();
    expect(cleanProfileDate(null)).toBeNull();
  });
});

describe("rangeToInterval", () => {
  it("counts both end months", () => {
    expect(months("2020-01", "2020-03")).toBe(3);
    expect(months("2020-01", "2020-01")).toBe(1);
  });

  it("treats year-only dates as mid-year", () => {
    expect(months("2019", "2021")).toBe(24);
    expect(months("2019-03", "2021")).toBe(2 * 12 + 4);
  });

  it("counts a same-year range as half a year", () => {
    expect(months("2021", "2021")).toBe(6);
  });

  it("ends 'present' at the document's month", () => {
    expect(months("2026-01", "present")).toBe(11);
    expect(months("2020-01", "present", toMonthIndex(2020, 6))).toBe(6);
  });

  it("caps dates after the document's month", () => {
    expect(months("2026-01", "2027-12")).toBe(11);
    expect(months("2027-01", "2027-12")).toBeNull();
  });

  it("can't count a range without a start or an end", () => {
    expect(months(null, "2020")).toBeNull();
    expect(months("2020", null)).toBeNull();
  });

  it("gives a reversed range one month", () => {
    expect(months("2021-05", "2020-01")).toBe(1);
  });
});

describe("totalMonths", () => {
  it("counts overlapping months once", () => {
    const a = rangeToInterval("2020-01", "2020-12", NOV_2026);
    const b = rangeToInterval("2020-07", "2021-06", NOV_2026);
    expect(totalMonths([a, b])).toBe(18);
  });

  it("adds gaps separately and ignores unknown ranges", () => {
    const a = rangeToInterval("2018-01", "2018-12", NOV_2026);
    const b = rangeToInterval("2020-01", "2020-06", NOV_2026);
    expect(totalMonths([a, null, b])).toBe(18);
    expect(totalMonths([null])).toBeNull();
  });
});

describe("month helpers", () => {
  it("round-trips months", () => {
    expect(formatMonth(toMonthIndex(2024, 1))).toBe("2024-01");
    expect(formatMonth(monthOfIsoDate("2026-11-13T19:00:00Z"))).toBe("2026-11");
  });
});
