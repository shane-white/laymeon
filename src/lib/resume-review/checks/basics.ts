/** Contact details, and personal details a resume should leave out. */
import { check, type CheckContext } from "../context";
import { findEmails, findLinks, findPhones, hasLocation, sectionsOfKind, stripMarkdown, tokens, truncate } from "../text";
import type { CheckLabel, CheckResult } from "../types";

// How many lines from the top count as the header when there are no section headings.
const HEADER_FALLBACK_LINES = 8;

export function basicsChecks(ctx: CheckContext): CheckResult[] {
  return [contact(ctx), email(ctx), personalDetails(ctx), outdatedLines(ctx)];
}

/** The name and contact block, plus header and footer text from a .docx, .odt or .rtf. */
function headerText(ctx: CheckContext): string {
  const lines = ctx.resume.sections.length
    ? ctx.resume.header
    : ctx.input.markdown.split("\n").filter((l) => l.trim()).slice(0, HEADER_FALLBACK_LINES);
  return [...lines.map(stripMarkdown), ctx.input.software?.layout?.headerFooterText ?? ""].join("\n");
}

function contact(ctx: CheckContext): CheckResult {
  const header = headerText(ctx);
  // Contact details anywhere count, but they belong at the top.
  const all = `${header}\n${ctx.input.markdown}`;
  const present = {
    email: findEmails(all).length > 0,
    phone: findPhones(all).length > 0,
    location: hasLocation(header),
    link: findLinks(all).length > 0,
  };
  const missingEssential = [!present.email && "an email address", !present.phone && "a phone number"].filter(Boolean);
  const missingNice = [!present.location && "your city and region", !present.link && "a LinkedIn or portfolio link"].filter(
    Boolean,
  );

  if (missingEssential.length) {
    return check(
      "basics.contact",
      "fix",
      `Add ${[...missingEssential, ...missingNice].join(", ")} at the top, so a recruiter can reach you.`,
      [],
      present,
    );
  }
  if (missingNice.length) {
    return check(
      "basics.contact",
      "could_improve",
      `Add ${missingNice.join(" and ")} next to your contact details. Recruiters often filter by location, and many check LinkedIn.`,
      [],
      present,
    );
  }
  return check("basics.contact", "good", "Your contact details are complete.", [], present);
}

// A birth year in an email suggests your age; some words just look unprofessional.
const BIRTH_YEAR = /(19[5-9]\d|200\d)/;
const UNPROFESSIONAL = /(sexy|hottie|cutie|babe|baby|princess|420|69|xxx|lover|killa|gamer|partyboy|partygirl)/i;

function email(ctx: CheckContext): CheckResult {
  const emails = findEmails(`${headerText(ctx)}\n${ctx.input.markdown}`);
  if (emails.length === 0) return check("basics.email", "good", "No email address to check.");
  const local = (e: string) => e.split("@")[0];
  const birthYear = emails.filter((e) => BIRTH_YEAR.test(local(e)));
  const unprofessional = emails.filter((e) => UNPROFESSIONAL.test(local(e)));

  if (unprofessional.length) {
    return check(
      "basics.email",
      "fix",
      "Use a plain email address based on your name. Recruiters notice nicknames and jokes in email addresses.",
      unprofessional,
    );
  }
  if (birthYear.length) {
    return check(
      "basics.email",
      "could_improve",
      "Your email address may include a birth year, which tells employers your age. An address with just your name is safer.",
      birthYear,
    );
  }
  return check("basics.email", "good", "Your email address looks professional.", emails);
}

interface DetailPattern {
  label: Exclude<CheckLabel, "good" | "info">;
  what: string;
  pattern: RegExp;
  /** Only look in the header block. */
  headerOnly?: boolean;
}

const PERSONAL_DETAILS: DetailPattern[] = [
  { label: "fix", what: "an ID number", pattern: /\b\d{3}-\d{2}-\d{4}\b/ },
  {
    label: "fix",
    what: "an ID number",
    pattern: /\b(social security|ssn|passport (no|number|#)|national (id|insurance) (no|number)|driver'?s licen[cs]e (no|number|#))\b/i,
  },
  { label: "fix", what: "your date of birth", pattern: /\b(date of birth|d\.o\.b\.?|dob|birth ?date|born on)\b\s*[:\-]?/i },
  { label: "fix", what: "your age", pattern: /\bage\s*[:\-]\s*\d{2}\b/i },
  { label: "could_improve", what: "your marital or family status", pattern: /\b(marital status|married|divorced|widowed|number of children|children\s*:)/i },
  { label: "could_improve", what: "personal details", pattern: /\b(nationality|religion|gender|sex)\s*:/i },
  {
    label: "could_improve",
    what: "your street address",
    pattern:
      /\b\d{1,5}\s+(?:[A-Z][a-z]+\s+){1,3}(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Court|Ct|Way|Place|Pl|Terrace|Circle|Parkway|Pkwy)\b\.?/,
    headerOnly: true,
  },
];

/** The line a match is on, for evidence. */
function lineWith(text: string, pattern: RegExp): string | null {
  const line = text.split("\n").find((l) => pattern.test(l));
  return line ? truncate(stripMarkdown(line), 120) : null;
}

function personalDetails(ctx: CheckContext): CheckResult {
  const header = headerText(ctx);
  const found: { label: DetailPattern["label"]; what: string; evidence: string }[] = [];
  for (const d of PERSONAL_DETAILS) {
    const evidence = lineWith(d.headerOnly ? header : `${header}\n${ctx.input.markdown}`, d.pattern);
    if (evidence) found.push({ label: d.label, what: d.what, evidence });
  }

  // A good-sized, roughly square image near the top is usually a photo. In a
  // file with no text, the image is the whole page: a scan, not a photo.
  const software = ctx.input.software;
  const hasText = software !== null && tokens(software.text).length >= 20;
  const photo = (hasText ? software.images : []).find(
    (img) => (img.page === null || img.page === 1) && img.width / img.height > 0.6 && img.width / img.height < 1.5,
  );
  if (photo) found.push({ label: "could_improve", what: "a photo", evidence: `An image (${photo.width}×${photo.height}px)` });

  if (found.length === 0) {
    return check("basics.personal_details", "good", "No personal details that employers shouldn't see.");
  }
  const whats = [...new Set(found.map((f) => f.what))];
  return check(
    "basics.personal_details",
    found.some((f) => f.label === "fix") ? "fix" : "could_improve",
    `Remove ${whats.join(", ")}. In the US, UK and Canada employers don't expect them, and they can lead to unfair bias or identity theft.`,
    found.map((f) => f.evidence),
    { found: whats.join(",") },
  );
}

const REFERENCES_LINE = /references\s+(are\s+)?(available\s+)?(up)?on\s+request/i;

function outdatedLines(ctx: CheckContext): CheckResult {
  const found: string[] = [];
  const references = lineWith(ctx.input.markdown, REFERENCES_LINE);
  if (references) found.push(references);
  for (const s of sectionsOfKind(ctx.resume, "objective")) found.push(s.heading);

  if (found.length) {
    return check(
      "basics.outdated_lines",
      "could_improve",
      'Drop "References available upon request" (employers ask when they need them) and replace an Objective with a short Summary of what you offer.',
      found,
    );
  }
  return check("basics.outdated_lines", "good", "No outdated sections.");
}
