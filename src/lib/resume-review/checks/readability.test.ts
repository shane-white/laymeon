import { describe, expect, it } from "vitest";
import { makeDocx, makePdf, para, table, textBox } from "../__fixtures__/files";
import { context, DOCX, editResume, PDF, result } from "../__fixtures__/helpers";
import { extraction, GOOD_RESUME, GOOD_RESUME_LINES, position } from "../__fixtures__/resumes";
import { readAsSoftware } from "../software-view";
import type { CodeCheckInput } from "../types";
import { longestIncreasing, readabilityChecks } from "./readability";

async function checksForPdf(options: Parameters<typeof makePdf>[0], p: Partial<CodeCheckInput> = {}) {
  const software = await readAsSoftware(makePdf(options), PDF);
  return readabilityChecks(context({ software, ...p }));
}

async function checksForDocx(options: Parameters<typeof makeDocx>[0]) {
  const software = await readAsSoftware(await makeDocx(options), DOCX);
  return readabilityChecks(context({ software, mimeType: DOCX, filename: "Jane-Doe-Resume.docx" }));
}

describe("a clean single-column PDF", () => {
  it("passes every readability check", async () => {
    const results = await checksForPdf({ pages: [GOOD_RESUME_LINES] });
    expect(results.filter((r) => r.label !== "good")).toEqual([]);
    expect(results.map((r) => r.id)).toEqual([
      "readability.file_type",
      "readability.file_name",
      "readability.text_layer",
      "readability.reading_order",
      "readability.missing_content",
      "readability.hidden_text",
      "readability.contact_readable",
      "readability.headings",
      "readability.dates",
    ]);
  });
});

describe("a two-column PDF", () => {
  // Main content on the left, a sidebar with skills and contact details on the right.
  const left = GOOD_RESUME_LINES.filter((l) => !l.includes("@") && !l.startsWith("Python, SQL") && l !== "Skills");
  const right = ["Skills", "Python, SQL, Kafka", "Snowflake, dbt, Airflow", "Contact", "jane.doe@example.com", "(512) 555-0147"];

  it("is flagged because software mixes the columns together", async () => {
    const order = result(await checksForPdf({ pages: [left], rightColumn: right }), "readability.reading_order");
    expect(order.label).toBe("fix");
    // The evidence shows what software read: a heading merged with the sidebar.
    expect(order.evidence).toContain("Summary Python, SQL, Kafka");
  });

  it("still finds all the words, so nothing is reported missing", async () => {
    const results = await checksForPdf({ pages: [left], rightColumn: right });
    expect(result(results, "readability.missing_content").label).toBe("good");
  });
});

describe("a scanned PDF", () => {
  it("fails the text layer check and skips the comparisons", async () => {
    const results = await checksForPdf({ pages: [GOOD_RESUME_LINES], scanned: true });
    expect(result(results, "readability.text_layer").label).toBe("fix");
    const ids = results.map((r) => r.id);
    expect(ids).not.toContain("readability.reading_order");
    expect(ids).not.toContain("readability.missing_content");
    expect(ids).not.toContain("readability.contact_readable");
  });
});

describe("text software can't read", () => {
  it("flags contact details that are only in an image", async () => {
    const lines = GOOD_RESUME_LINES.filter((l) => !l.includes("@"));
    const contact = result(await checksForPdf({ pages: [lines] }), "readability.contact_readable");
    expect(contact.label).toBe("fix");
    expect(contact.evidence).toEqual(["jane.doe@example.com", "(512) 555-0147"]);
  });

  it("flags several resume lines missing from the file", async () => {
    const lines = GOOD_RESUME_LINES.filter((l) => !l.startsWith("• Built") && !l.startsWith("• Led") && !l.startsWith("• Designed"));
    const missing = result(await checksForPdf({ pages: [lines] }), "readability.missing_content");
    expect(missing.label).not.toBe("good");
    expect(missing.evidence[0]).toMatch(/^Built a streaming pipeline/);
  });
});

describe("hidden text", () => {
  it("flags white text stuffed with keywords", async () => {
    const hidden = [
      "Kubernetes Terraform Spark Hadoop Scala Java Golang Rust",
      "machine learning tensorflow pytorch pandas numpy scikit",
      "leadership communication stakeholder agile scrum kanban jira",
    ];
    const check = result(await checksForPdf({ pages: [GOOD_RESUME_LINES], hidden }), "readability.hidden_text");
    expect(check.label).toBe("could_improve");
    expect(check.evidence).toEqual(hidden);
  });

  it("ignores a header repeated on every page", async () => {
    const pages = [
      ["Jane Doe · jane.doe@example.com · Page", ...GOOD_RESUME_LINES.slice(0, 20)],
      ["Jane Doe · jane.doe@example.com · Page", ...GOOD_RESUME_LINES.slice(20)],
    ];
    const check = result(await checksForPdf({ pages }), "readability.hidden_text");
    expect(check.label).toBe("good");
  });
});

describe("DOCX layout", () => {
  const body = GOOD_RESUME_LINES.map(para).join("");

  it("passes a plain document", async () => {
    const results = await checksForDocx({ body });
    expect(result(results, "readability.layout_elements").label).toBe("good");
    expect(result(results, "readability.header_footer").label).toBe("good");
  });

  it("marks text boxes as Fix this", async () => {
    const check = result(await checksForDocx({ body: textBox(["Skills"]) + body }), "readability.layout_elements");
    expect(check.label).toBe("fix");
    expect(check.evidence).toEqual(["1 text box"]);
  });

  it("marks tables and columns as Could improve", async () => {
    const check = result(await checksForDocx({ body: table([["a", "b"]]) + body, columns: 2 }), "readability.layout_elements");
    expect(check.label).toBe("could_improve");
    expect(check.evidence).toEqual(["1 table", "2 text columns"]);
  });

  it("marks contact details in the header as Fix this", async () => {
    const results = await checksForDocx({ body, header: ["jane.doe@example.com | (512) 555-0147"] });
    expect(result(results, "readability.header_footer").label).toBe("fix");
  });

  it("marks other header text as Could improve", async () => {
    const results = await checksForDocx({ body, header: ["Data Engineer"] });
    expect(result(results, "readability.header_footer").label).toBe("could_improve");
  });
});

describe("file type and name", () => {
  it("suggests converting an old .doc", () => {
    const results = readabilityChecks(context({ mimeType: "application/msword", filename: "Jane Doe.doc" }));
    expect(result(results, "readability.file_type").label).toBe("could_improve");
  });

  it.each(["resume.pdf", "CV_final.pdf", "Jane Resume (1).pdf", "jane-resume-v3.pdf", "Resume copy.pdf"])(
    "flags %s",
    (filename) => {
      expect(result(readabilityChecks(context({ filename })), "readability.file_name").label).toBe("could_improve");
    },
  );

  it.each(["Jane-Doe-Resume.pdf", "Doe_Jane_CV.pdf"])("accepts %s", (filename) => {
    expect(result(readabilityChecks(context({ filename })), "readability.file_name").label).toBe("good");
  });
});

describe("headings", () => {
  it("flags unusual headings", () => {
    const markdown = editResume(["## Experience", "## Where I've Made an Impact\n\n## Experience"]);
    const check = result(readabilityChecks(context({ markdown })), "readability.headings");
    expect(check.label).toBe("could_improve");
    expect(check.evidence).toEqual(["Where I've Made an Impact"]);
  });

  it("marks a resume with no experience heading as Fix this", () => {
    const markdown = editResume(["## Experience", "## My Journey"]);
    expect(result(readabilityChecks(context({ markdown })), "readability.headings").label).toBe("fix");
  });
});

describe("dates", () => {
  it("flags mixed date styles", () => {
    const markdown = editResume(["Jun 2017 – Dec 2020", "06/2017 – 12/2020"]);
    const check = result(readabilityChecks(context({ markdown })), "readability.dates");
    expect(check.label).toBe("could_improve");
    expect(check.evidence).toEqual(["Jan 2021 – Present", "06/2017 – 12/2020"]);
  });

  it("suggests months when there are only years", () => {
    const markdown = editResume(["Jan 2021 – Present", "2021 – Present"], ["Jun 2017 – Dec 2020", "2017 – 2020"]);
    expect(result(readabilityChecks(context({ markdown })), "readability.dates").label).toBe("could_improve");
  });

  it("flags dates written as seasons", () => {
    const markdown = editResume(["Jan 2021 – Present", "Fall 2021 – Present"], ["Jun 2017 – Dec 2020", "Summer 2017 – Fall 2020"]);
    const check = result(readabilityChecks(context({ markdown })), "readability.dates");
    expect(check.label).toBe("could_improve");
    expect(check.summary).toMatch(/seasons/);
  });

  it("flags a job the Career Story found with no dates", () => {
    const e = extraction({
      positions: [position({ employer: "Self", title: "Developer", start: "", end: "" }), position({ start: "2020-01" })],
    });
    const check = result(readabilityChecks(context({ extraction: e })), "readability.dates");
    expect(check.label).toBe("could_improve");
    expect(check.evidence).toEqual(["Self (Developer)"]);
  });

  it("marks a resume with no job dates as Fix this", () => {
    const markdown = editResume(["Jan 2021 – Present", ""], ["Jun 2017 – Dec 2020", ""], ["Sep 2013 – May 2017", ""]);
    expect(result(readabilityChecks(context({ markdown })), "readability.dates").label).toBe("fix");
  });
});

describe("without a file", () => {
  it("runs only the checks that need the markdown", () => {
    const ids = readabilityChecks(context({ markdown: GOOD_RESUME, software: null })).map((r) => r.id);
    expect(ids).toEqual(["readability.file_type", "readability.file_name", "readability.headings", "readability.dates"]);
  });
});

it("longestIncreasing", () => {
  expect(longestIncreasing([1, 2, 3])).toBe(3);
  expect(longestIncreasing([1, 10, 2, 11, 3, 12])).toBe(4);
  expect(longestIncreasing([])).toBe(0);
});
