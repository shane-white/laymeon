import { describe, expect, it } from "vitest";
import { DROPZONE_ACCEPT, kindOf, resolveType, uploadProblem } from "./file-format";

const RTF = "application/rtf";
const ODT = "application/vnd.oasis.opendocument.text";

describe("DROPZONE_ACCEPT", () => {
  it("lets dialogs pick .pdf, .docx, .doc, .rtf and .odt files, and only types the server accepts", () => {
    expect([...new Set(Object.values(DROPZONE_ACCEPT).flat())].sort()).toEqual([".doc", ".docx", ".odt", ".pdf", ".rtf"]);
    for (const type of Object.keys(DROPZONE_ACCEPT)) expect(kindOf(type)).not.toBe("unsupported");
  });
});

const MB = 1024 * 1024;

describe("uploadProblem", () => {
  it("accepts PDF, Word, RTF and ODT files up to 10 MB", () => {
    expect(uploadProblem({ type: "application/pdf", name: "a.pdf", size: 10 * MB })).toBeNull();
    expect(uploadProblem({ type: "application/msword", name: "a.doc", size: 1 })).toBeNull();
    expect(uploadProblem({ type: RTF, name: "a.rtf", size: 1 })).toBeNull();
    expect(uploadProblem({ type: ODT, name: "a.odt", size: 1 })).toBeNull();
  });

  it("accepts a file the browser gave no type by its extension", () => {
    expect(uploadProblem({ type: "", name: "Resume.RTF", size: 1 })).toBeNull();
    expect(uploadProblem({ type: "application/octet-stream", name: "resume.odt", size: 1 })).toBeNull();
  });

  it("turns away other files", () => {
    const message = "Please upload a PDF, Word, RTF or ODT file";
    expect(uploadProblem({ type: "text/plain", name: "resume.txt", size: 1 })).toBe(message);
    expect(uploadProblem({ type: "", name: "resume", size: 1 })).toBe(message);
    expect(uploadProblem({ type: "application/octet-stream", name: "resume.exe", size: 1 })).toBe(message);
  });

  it("turns away files over 10 MB", () => {
    expect(uploadProblem({ type: "application/pdf", name: "a.pdf", size: 10 * MB + 1 })).toBe(
      "File is too large. Maximum size is 10 MB.",
    );
  });
});

describe("resolveType", () => {
  it("stores one standard type per kind", () => {
    expect(resolveType({ type: "text/rtf", name: "a.rtf" })).toBe(RTF);
    expect(resolveType({ type: RTF, name: "a.rtf" })).toBe(RTF);
    expect(resolveType({ type: ODT, name: "a.odt" })).toBe(ODT);
    expect(resolveType({ type: "application/msword", name: "a.doc" })).toBe("application/msword");
  });

  it("decides by extension when the browser gave no type, for every accepted type", () => {
    expect(resolveType({ type: "", name: "a.pdf" })).toBe("application/pdf");
    expect(resolveType({ type: "", name: "a.docx" })).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    expect(resolveType({ type: "application/octet-stream", name: "a.doc" })).toBe("application/msword");
    expect(resolveType({ type: "", name: "my.resume.rtf" })).toBe(RTF);
    expect(resolveType({ type: "application/octet-stream", name: "a.ODT" })).toBe(ODT);
  });

  it("is null for types it doesn't accept", () => {
    expect(resolveType({ type: "text/plain", name: "a.rtf" })).toBeNull();
    expect(resolveType({ type: "", name: "a.txt" })).toBeNull();
    expect(resolveType({ type: "", name: "rtf" })).toBeNull();
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

  it("reads RTF and ODT files as rtf and odt", () => {
    expect(kindOf(RTF)).toBe("rtf");
    expect(kindOf("text/rtf")).toBe("rtf");
    expect(kindOf(ODT)).toBe("odt");
  });

  it("turns away anything else", () => {
    expect(kindOf("text/plain")).toBe("unsupported");
    expect(kindOf("")).toBe("unsupported");
  });
});
