import { describe, expect, it } from "vitest";
import { pickDocument, describeDocument, type JobDocument } from "./resolve-job-documents";

function doc(overrides: Partial<JobDocument>): JobDocument {
  return {
    id: "id",
    document_type: "resume",
    display_name: "Resume",
    target_role: null,
    is_default: false,
    parsed_markdown: "text",
    ...overrides,
  };
}

const pm = doc({ id: "pm", display_name: "PM Resume", is_default: true });
const data = doc({ id: "data", display_name: "Data Resume" });
const letter = doc({ id: "letter", document_type: "cover_letter", is_default: true });
const docs = [pm, data, letter];

describe("pickDocument", () => {
  it("uses the selected document", () => {
    expect(pickDocument("data", docs, "resume")).toBe(data);
  });

  it("falls back to the default when nothing is selected", () => {
    expect(pickDocument(null, docs, "resume")).toBe(pm);
  });

  it("falls back to the default when the selection is gone", () => {
    expect(pickDocument("deleted", docs, "resume")).toBe(pm);
  });

  it("ignores a selection of the wrong type", () => {
    expect(pickDocument("letter", docs, "resume")).toBe(pm);
  });

  it("returns null when there is no document of that type", () => {
    expect(pickDocument(null, [letter], "resume")).toBeNull();
  });
});

describe("describeDocument", () => {
  it("includes the target role when set", () => {
    expect(describeDocument({ display_name: "PM", target_role: "Product Manager" })).toBe(
      "PM (targeting Product Manager)",
    );
    expect(describeDocument({ display_name: "PM", target_role: null })).toBe("PM");
  });
});
