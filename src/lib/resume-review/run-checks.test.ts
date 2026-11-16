import { describe, expect, it } from "vitest";
import { makeDocx, makePdf, para } from "./__fixtures__/files";
import { DOCX, PDF } from "./__fixtures__/helpers";
import { GOOD_RESUME_LINES, input } from "./__fixtures__/resumes";
import { runCodeChecks } from "./run-checks";
import { readAsSoftware } from "./software-view";
import { CODE_CHECKS, MAX_EVIDENCE, SECTIONS } from "./types";

describe("runCodeChecks", () => {
  it("passes a well-written PDF resume on every check", async () => {
    const software = await readAsSoftware(makePdf({ pages: [GOOD_RESUME_LINES] }), PDF);
    const results = runCodeChecks(input({ software }));
    expect(results.filter((r) => r.label !== "good")).toEqual([]);
    expect(results).toHaveLength(32);
  });

  it("passes the same resume as a .docx", async () => {
    const software = await readAsSoftware(await makeDocx({ body: GOOD_RESUME_LINES.map(para).join(""), pages: 1 }), DOCX);
    const results = runCodeChecks(input({ software, mimeType: DOCX, filename: "Jane-Doe-Resume.docx" }));
    expect(results.filter((r) => r.label !== "good")).toEqual([]);
  });

  it("gives the same results for the same input", async () => {
    const software = await readAsSoftware(makePdf({ pages: [GOOD_RESUME_LINES] }), PDF);
    expect(runCodeChecks(input({ software }))).toEqual(runCodeChecks(input({ software })));
  });

  it("returns checks in section order, each with its own section and capped evidence", () => {
    const results = runCodeChecks(input());
    const order = results.map((r) => SECTIONS.indexOf(r.section));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    for (const r of results) {
      expect(r.section).toBe(CODE_CHECKS[r.id]);
      expect(r.evidence.length).toBeLessThanOrEqual(MAX_EVIDENCE);
    }
  });

  it("never marks Questions a recruiter may ask as a problem", () => {
    const results = runCodeChecks(input()).filter((r) => r.section === "questions");
    expect(results.every((r) => r.label === "good" || r.label === "info")).toBe(true);
  });

  it("works on an empty resume", () => {
    expect(() => runCodeChecks(input({ markdown: "", extraction: null }))).not.toThrow();
  });
});

it("check IDs are grouped by section name", () => {
  for (const [id, section] of Object.entries(CODE_CHECKS)) {
    expect(id.startsWith(`${section}.`)).toBe(true);
  }
});
