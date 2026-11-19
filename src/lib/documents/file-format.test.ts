import { describe, expect, it } from "vitest";
import { DROPZONE_ACCEPT, kindOf, uploadProblem } from "./file-format";

describe("DROPZONE_ACCEPT", () => {
  it("lets dialogs pick .pdf, .docx and .doc files, and only types the server accepts", () => {
    expect(Object.values(DROPZONE_ACCEPT).flat().sort()).toEqual([".doc", ".docx", ".pdf"]);
    for (const type of Object.keys(DROPZONE_ACCEPT)) expect(kindOf(type)).not.toBe("unsupported");
  });
});

const MB = 1024 * 1024;

describe("uploadProblem", () => {
  it("accepts PDF and Word files up to 10 MB", () => {
    expect(uploadProblem({ type: "application/pdf", size: 10 * MB })).toBeNull();
    expect(uploadProblem({ type: "application/msword", size: 1 })).toBeNull();
  });

  it("turns away RTF and ODT files", () => {
    expect(uploadProblem({ type: "application/rtf", size: 1 })).toBe("Please upload a PDF or Word file");
    expect(uploadProblem({ type: "application/vnd.oasis.opendocument.text", size: 1 })).toBe(
      "Please upload a PDF or Word file",
    );
  });

  it("turns away files over 10 MB", () => {
    expect(uploadProblem({ type: "application/pdf", size: 10 * MB + 1 })).toBe("File is too large. Maximum size is 10 MB.");
  });
});

describe("kindOf", () => {
  it("reads PDFs as pdf", () => {
    expect(kindOf("application/pdf")).toBe("pdf");
  });

  it("reads .docx and old .doc files as word", () => {
    expect(kindOf("application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBe("word");
    expect(kindOf("application/msword")).toBe("word");
  });

  it("turns away RTF, ODT and anything else", () => {
    expect(kindOf("application/rtf")).toBe("unsupported");
    expect(kindOf("application/vnd.oasis.opendocument.text")).toBe("unsupported");
    expect(kindOf("text/plain")).toBe("unsupported");
    expect(kindOf("")).toBe("unsupported");
  });
});
