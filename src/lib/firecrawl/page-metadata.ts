// Helpers for reading a scraped page's metadata. Firecrawl returns meta tags
// under both camelCase keys (ogUrl) and raw tag names ("og:url"), and a tag
// that appears more than once comes back as an array.
type Metadata = Record<string, unknown> | undefined;

// Hosts of applicant tracking systems whose postings are often embedded in a
// company's own careers page. The embedded frame isn't in the scraped
// markdown, so we scrape the posting on the ATS directly.
const ATS_HOSTS = [
  "jobs.ashbyhq.com",
  "boards.greenhouse.io",
  "job-boards.greenhouse.io",
  "jobs.lever.co",
  "apply.workable.com",
  "jobs.smartrecruiters.com",
  "jobs.jobvite.com",
];
const ATS_HOST_SUFFIXES = [".myworkdayjobs.com"];

// Shorter descriptions are usually a site-wide tagline, not a job listing.
const MIN_LISTING_DESCRIPTION_LENGTH = 500;

function metaValues(metadata: Metadata, keys: string[]): string[] {
  if (!metadata) return [];
  return keys.flatMap((key) => {
    const value = metadata[key];
    const values = Array.isArray(value) ? value : [value];
    return values.filter(
      (v): v is string => typeof v === "string" && v.trim() !== "",
    );
  });
}

function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function isAtsHost(host: string): boolean {
  return (
    ATS_HOSTS.includes(host) ||
    ATS_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))
  );
}

// The page's canonical posting on an applicant tracking system, if it points
// to one on a different host from the page that was scraped.
export function findAtsPostingUrl(
  scrapedUrl: string,
  metadata: Metadata,
): string | null {
  const scrapedHost = parseUrl(scrapedUrl)?.host;
  for (const candidate of metaValues(metadata, ["ogUrl", "og:url", "canonical"])) {
    const url = parseUrl(candidate);
    if (url && url.protocol === "https:" && url.host !== scrapedHost && isAtsHost(url.host)) {
      return url.toString();
    }
  }
  return null;
}

// The longest meta description on the page, if it's long enough to be a job
// listing rather than a tagline.
export function findListingDescription(metadata: Metadata): string | null {
  const longest = metaValues(metadata, [
    "og:description",
    "ogDescription",
    "twitter:description",
  ])
    .map((v) => v.trim())
    .reduce<string | null>(
      (best, v) => (!best || v.length > best.length ? v : best),
      null,
    );
  return longest && longest.length >= MIN_LISTING_DESCRIPTION_LENGTH
    ? longest
    : null;
}

// The scraped markdown plus the page's meta description, when that adds a
// listing the markdown doesn't already contain.
export function withListingDescription(
  markdown: string,
  metadata: Metadata,
): string {
  const description = findListingDescription(metadata);
  if (!description) return markdown;

  // Compare letters and digits only, since markdown adds formatting.
  const normalize = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  if (normalize(markdown).includes(normalize(description).slice(0, 150))) {
    return markdown;
  }
  return `${markdown}\n\n---\n\nThe page's meta description:\n\n${description}`;
}
