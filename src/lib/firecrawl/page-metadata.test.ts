import { describe, expect, it } from "vitest";
import {
  findAtsPostingUrl,
  findListingDescription,
  withListingDescription,
} from "./page-metadata";

const CAREERS_URL =
  "https://www.withforerunner.com/careers?ashby_jid=b04d78cc-616e-4f02-84c0-4754e792f6b2";
const ASHBY_URL =
  "https://jobs.ashbyhq.com/forerunner/b04d78cc-616e-4f02-84c0-4754e792f6b2";
const TAGLINE = "Join Forerunner and help build AI-powered geospatial tools.";
const LISTING =
  "HI! WE'RE FORERUNNER.\n\nABOUT THE ROLE\n\nAs a Deployment Specialist, you will own the end-to-end deployment experience. " +
  "- Lead structured workshops with customers. ".repeat(15) +
  "\n\nThe salary range for this position is 120,000-165,000.";

describe("findAtsPostingUrl", () => {
  it("finds an Ashby posting in a raw og:url tag", () => {
    expect(findAtsPostingUrl(CAREERS_URL, { "og:url": ASHBY_URL })).toBe(ASHBY_URL);
  });

  it("reads array values and camelCase keys", () => {
    expect(
      findAtsPostingUrl(CAREERS_URL, { ogUrl: [CAREERS_URL, ASHBY_URL] }),
    ).toBe(ASHBY_URL);
  });

  it("matches Workday subdomains", () => {
    const url = "https://acme.wd5.myworkdayjobs.com/en-US/careers/job/123";
    expect(findAtsPostingUrl("https://acme.com/jobs", { "og:url": url })).toBe(url);
  });

  it("ignores a page that is already on the ATS", () => {
    expect(findAtsPostingUrl(ASHBY_URL, { "og:url": ASHBY_URL })).toBeNull();
  });

  it("ignores non-ATS and invalid URLs", () => {
    expect(
      findAtsPostingUrl(CAREERS_URL, {
        "og:url": ["https://www.withforerunner.com/careers", "not a url"],
      }),
    ).toBeNull();
    expect(findAtsPostingUrl(CAREERS_URL, undefined)).toBeNull();
  });

  it("ignores non-https URLs", () => {
    expect(
      findAtsPostingUrl(CAREERS_URL, { "og:url": ASHBY_URL.replace("https", "http") }),
    ).toBeNull();
  });
});

describe("findListingDescription", () => {
  it("picks the longest description", () => {
    expect(findListingDescription({ "og:description": [TAGLINE, LISTING] })).toBe(
      LISTING.trim(),
    );
  });

  it("ignores short taglines", () => {
    expect(findListingDescription({ ogDescription: TAGLINE })).toBeNull();
  });
});

describe("withListingDescription", () => {
  it("appends a listing the markdown is missing", () => {
    const text = withListingDescription("# Careers at Forerunner", {
      "og:description": [TAGLINE, LISTING],
    });
    expect(text).toContain("# Careers at Forerunner");
    expect(text).toContain("120,000-165,000");
  });

  it("doesn't repeat a listing that is already in the markdown", () => {
    const markdown = `**HI! WE'RE FORERUNNER.**\n\n## ABOUT THE ROLE\n\n${LISTING.split("ABOUT THE ROLE")[1]}`;
    expect(withListingDescription(markdown, { "og:description": LISTING })).toBe(markdown);
  });

  it("leaves the markdown alone without a listing", () => {
    expect(withListingDescription("# Job", { ogDescription: TAGLINE })).toBe("# Job");
  });
});
