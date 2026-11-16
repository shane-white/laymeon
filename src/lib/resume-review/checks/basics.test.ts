import { describe, expect, it } from "vitest";
import { makeDocx, makePdf, para } from "../__fixtures__/files";
import { context, DOCX, editResume, PDF, result } from "../__fixtures__/helpers";
import { GOOD_RESUME, GOOD_RESUME_LINES } from "../__fixtures__/resumes";
import { readAsSoftware } from "../software-view";
import type { CodeCheckInput } from "../types";
import { basicsChecks } from "./basics";

const CONTACT_LINE = "Data Engineer | Austin, TX | jane.doe@example.com | (512) 555-0147 | linkedin.com/in/janedoe";

function checks(p: Partial<CodeCheckInput> = {}) {
  return basicsChecks(context(p));
}

it("passes the example resume", () => {
  expect(checks().filter((r) => r.label !== "good")).toEqual([]);
});

describe("contact details", () => {
  it("marks a missing phone number as Fix this", () => {
    const markdown = editResume([CONTACT_LINE, "Data Engineer | Austin, TX | jane.doe@example.com | linkedin.com/in/janedoe"]);
    const check = result(checks({ markdown }), "basics.contact");
    expect(check.label).toBe("fix");
    expect(check.summary).toMatch(/a phone number/);
  });

  it("suggests a location and a link", () => {
    const markdown = editResume([CONTACT_LINE, "jane.doe@example.com | (512) 555-0147"]);
    const check = result(checks({ markdown }), "basics.contact");
    expect(check.label).toBe("could_improve");
    expect(check.summary).toMatch(/city and region and a LinkedIn/);
  });

  it("finds contact details in a .docx header", async () => {
    const markdown = editResume([CONTACT_LINE, "Data Engineer | Austin, TX | linkedin.com/in/janedoe"]);
    const software = await readAsSoftware(
      await makeDocx({ body: GOOD_RESUME_LINES.map(para).join(""), header: ["jane.doe@example.com · (512) 555-0147"] }),
      DOCX,
    );
    expect(result(checks({ markdown, software, mimeType: DOCX }), "basics.contact").label).toBe("good");
  });
});

describe("email", () => {
  it("flags a birth year", () => {
    const markdown = editResume(["jane.doe@example.com", "janedoe1987@example.com"]);
    expect(result(checks({ markdown }), "basics.email")).toMatchObject({
      label: "could_improve",
      evidence: ["janedoe1987@example.com"],
    });
  });

  it("marks a joke address as Fix this", () => {
    const markdown = editResume(["jane.doe@example.com", "partygirl99@example.com"]);
    expect(result(checks({ markdown }), "basics.email").label).toBe("fix");
  });
});

describe("personal details", () => {
  it("marks a date of birth as Fix this", () => {
    const markdown = editResume([CONTACT_LINE, `${CONTACT_LINE}\nDate of birth: 04/12/1990`]);
    const check = result(checks({ markdown }), "basics.personal_details");
    expect(check.label).toBe("fix");
    expect(check.evidence).toEqual(["Date of birth: 04/12/1990"]);
  });

  it("marks an ID number as Fix this", () => {
    const markdown = editResume([CONTACT_LINE, `${CONTACT_LINE} | SSN 123-45-6789`]);
    expect(result(checks({ markdown }), "basics.personal_details").label).toBe("fix");
  });

  it("suggests removing marital status and a street address", () => {
    const markdown = editResume([CONTACT_LINE, `1200 Barton Springs Road, Austin, TX\n${CONTACT_LINE}\nMarital status: Married`]);
    const check = result(checks({ markdown }), "basics.personal_details");
    expect(check.label).toBe("could_improve");
    expect(check.data?.found).toBe("your marital or family status,your street address");
  });

  it("doesn't count a street name in a job bullet as an address", () => {
    const markdown = editResume(["- Mentored 3 junior engineers", "- Moved the office to 100 Congress Avenue"]);
    expect(result(checks({ markdown }), "basics.personal_details").label).toBe("good");
  });

  it("flags a photo", async () => {
    const software = await readAsSoftware(makePdf({ pages: [GOOD_RESUME_LINES], image: { width: 200, height: 240 } }), PDF);
    const check = result(checks({ software }), "basics.personal_details");
    expect(check.label).toBe("could_improve");
    expect(check.summary).toMatch(/a photo/);
  });

  it("doesn't call a wide logo or banner a photo", async () => {
    const software = await readAsSoftware(makePdf({ pages: [GOOD_RESUME_LINES], image: { width: 400, height: 80 } }), PDF);
    expect(result(checks({ software }), "basics.personal_details").label).toBe("good");
  });

  it("doesn't call a scanned page a photo", async () => {
    const software = await readAsSoftware(makePdf({ pages: [GOOD_RESUME_LINES], scanned: true }), PDF);
    expect(result(checks({ software }), "basics.personal_details").label).toBe("good");
  });
});

describe("outdated lines", () => {
  it("flags an objective and references line", () => {
    const markdown = `${GOOD_RESUME.replace("## Summary", "## Objective")}\nReferences available upon request.`;
    const check = result(checks({ markdown }), "basics.outdated_lines");
    expect(check.label).toBe("could_improve");
    expect(check.evidence).toEqual(["References available upon request.", "Objective"]);
  });
});
