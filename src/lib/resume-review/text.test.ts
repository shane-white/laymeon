import { describe, expect, it } from "vitest";
import {
  bulletsIn,
  classifyHeading,
  countTerm,
  dateStyle,
  findDateRanges,
  findLinks,
  findPhones,
  hasLocation,
  parseResume,
  truncate,
} from "./text";
import { GOOD_RESUME } from "./__fixtures__/resumes";

describe("parseResume", () => {
  it("treats a leading # heading as the name and ## headings as sections", () => {
    const resume = parseResume(GOOD_RESUME);
    expect(resume.header[0]).toBe("# Jane Doe");
    expect(resume.sections.map((s) => [s.heading, s.kind])).toEqual([
      ["Summary", "summary"],
      ["Experience", "experience"],
      ["Education", "education"],
      ["Skills", "skills"],
    ]);
  });

  it("keeps ### role headings inside their section", () => {
    const experience = parseResume(GOOD_RESUME).sections[1];
    expect(experience.lines).toContain("### Senior Data Engineer, Lumen Analytics");
  });

  it("treats a ## heading on the first line as the name", () => {
    const resume = parseResume("## Jane Doe\n\nAustin, TX\n\n## Experience\n- Did things");
    expect(resume.header).toEqual(["## Jane Doe", "Austin, TX"]);
    expect(resume.sections.map((s) => s.kind)).toEqual(["experience"]);
  });

  it("uses ### as sections when there are no ## headings", () => {
    const resume = parseResume("Jane Doe\n\n### WORK HISTORY\n- Did things\n\n### Education\nB.A.");
    expect(resume.header).toEqual(["Jane Doe"]);
    expect(resume.sections.map((s) => s.kind)).toEqual(["experience", "education"]);
  });

  it("recognizes a bold line that is a standard heading", () => {
    const resume = parseResume("Jane Doe\n\n**PROFESSIONAL EXPERIENCE**\n- Did things\n\n**Skills:**\nPython");
    expect(resume.sections.map((s) => s.kind)).toEqual(["experience", "skills"]);
  });
});

describe("classifyHeading", () => {
  it.each([
    ["Work Experience", "experience"],
    ["Professional Experience:", "experience"],
    ["Technical Skills", "skills"],
    ["Skills & Tools", "skills"],
    ["Career Objective", "objective"],
    ["Licenses and Certifications", "certifications"],
    ["Volunteer Experience", "other_standard"],
    ["Work Samples", "other_standard"],
    ["My Journey", "unknown"],
    ["Where I've Made an Impact", "unknown"],
  ])("%s → %s", (heading, kind) => {
    expect(classifyHeading(heading)).toBe(kind);
  });
});

describe("bulletsIn", () => {
  it("finds -, *, • and numbered bullets, without markdown", () => {
    expect(bulletsIn(["- **Built** a thing", "* Led", "• Cut costs", "1. Shipped", "Not a bullet"])).toEqual([
      "Built a thing",
      "Led",
      "Cut costs",
      "Shipped",
    ]);
  });
});

describe("dates", () => {
  it("finds date ranges in different styles", () => {
    const ranges = findDateRanges("Jan 2021 – Present\n06/2017 - 12/2020\n2014 to 2016\nSept. 2010 — May 2012");
    expect(ranges.map((r) => [r.start, r.end])).toEqual([
      ["Jan 2021", "Present"],
      ["06/2017", "12/2020"],
      ["2014", "2016"],
      ["Sept. 2010", "May 2012"],
    ]);
  });

  it("doesn't mistake phone numbers or IDs for dates", () => {
    expect(findDateRanges("Call 555-1234-5678 or 0412-3456")).toEqual([]);
  });

  it("names each date's style", () => {
    expect(["Jan 2020", "January 2020", "01/2020", "2020-01", "2020", "Fall 2020", "Present"].map(dateStyle)).toEqual([
      "month_name",
      "month_name",
      "numeric",
      "iso",
      "year",
      "season",
      null,
    ]);
  });
});

describe("contact details", () => {
  it("finds phone numbers but not year ranges", () => {
    expect(findPhones("(512) 555-0147 · +44 20 7946 0958 · 2019 - 2021")).toEqual(["(512) 555-0147", "+44 20 7946 0958"]);
  });

  it("finds each phone number once", () => {
    expect(findPhones("512-555-0147 and (512) 555-0147")).toEqual(["512-555-0147"]);
  });

  it("finds links but not email domains", () => {
    expect(findLinks("jane@example.com | linkedin.com/in/jane | janedoe.dev")).toEqual(["linkedin.com/in/jane", "janedoe.dev"]);
  });

  it("finds a location", () => {
    expect(hasLocation("Austin, TX")).toBe(true);
    expect(hasLocation("Leeds, United Kingdom")).toBe(true);
    expect(hasLocation("Remote")).toBe(true);
    expect(hasLocation("jane@example.com")).toBe(false);
  });
});

describe("truncate", () => {
  it("leaves short text alone", () => {
    expect(truncate("Built a tool.", 40)).toBe("Built a tool.");
  });

  it("cuts out the middle, between words, so the ending stays visible", () => {
    const line =
      "Designed and led college-level Python programming and data analytics courses, developing hands-on coding labs and scaffolded problem sets.";
    const short = truncate(line, 80);
    expect(short.length).toBeLessThanOrEqual(80);
    expect(short).toMatch(/^Designed and led college-level Python.* … .*problem sets\.$/);
    // Whole words on both sides of the cut.
    const [head, tail] = short.split(" … ");
    expect(line.startsWith(head)).toBe(true);
    expect(line.endsWith(tail)).toBe(true);
  });
});

describe("countTerm", () => {
  it("counts whole words and phrases, ignoring case", () => {
    expect(countTerm("SQL and NoSQL and sql", "SQL")).toBe(2);
    expect(countTerm("Used C++ and C", "C")).toBe(1);
    expect(countTerm("Team player. A true team player.", "team player")).toBe(2);
  });
});
