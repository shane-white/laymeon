/**
 * Splits a parsed resume (markdown) into its header, sections and bullets,
 * and finds dates and contact details in it. Everything here is plain code,
 * so the same resume always gives the same result.
 */
import { normalizeText } from "@/lib/match-report/evidence";

export type SectionKind =
  | "summary"
  | "objective"
  | "experience"
  | "education"
  | "skills"
  | "projects"
  | "certifications"
  | "references"
  | "other_standard"
  | "unknown";

/** Headings resume parsers expect, by kind. Matched against the cleaned, lowercased heading. */
const HEADING_PATTERNS: [SectionKind, RegExp][] = [
  ["summary", /^(professional |career |executive |personal )?(summary|profile)( of qualifications)?$|^summary of qualifications$/],
  ["objective", /^(career |professional |job )?objective$/],
  [
    "experience",
    /^((professional|work|relevant|career|employment|industry|related) )?(experience|history)$|^(employment|work|career)( history)?$|^experience$/,
  ],
  ["education", /^education( (and|&) (training|certifications?))?$|^academic (background|history)$/],
  [
    "skills",
    /^((technical|core|key|professional|relevant) )?(skills|competencies|expertise|proficiencies)( (and|&) (tools|technologies|expertise|certifications|interests))?$|^(technologies|tools|tech stack|technical proficiencies)$/,
  ],
  ["projects", /^((selected|key|personal|academic|relevant) )?projects$/],
  ["certifications", /^(certifications?|licenses?|licenses? (and|&) certifications?|certifications? (and|&) (licenses?|training))$/],
  ["references", /^references$/],
  [
    "other_standard",
    /^(portfolio|work samples|samples of work|awards?|honou?rs|honou?rs (and|&) awards|awards (and|&) honou?rs|achievements|key achievements|publications|volunteer(ing| experience| work)?|languages|interests|hobbies|leadership( experience)?|activities|training|courses|professional development|affiliations|memberships|professional affiliations|patents|presentations|research( experience)?|teaching( experience)?|additional information)$/,
  ],
];

/** Removes markdown formatting, keeping the words and link text. */
export function stripMarkdown(line: string): string {
  return line
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\(([^)]*)\)/g, "$1 $2")
    .replace(/\\([\\`*_{}[\]()#+\-.!|>])/g, "$1")
    .replace(/^\s*#{1,6}\s+/, "")
    .replace(/^\s*>\s?/, "")
    .replace(/(\*\*|__|`)/g, "")
    .replace(/(^|\s)[*_](\S[^*_]*\S|\S)[*_](?=\s|$|[.,;:])/g, "$1$2")
    .trim();
}

export function classifyHeading(heading: string): SectionKind {
  const cleaned = stripMarkdown(heading)
    .toLowerCase()
    .replace(/[:.]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
  for (const [kind, pattern] of HEADING_PATTERNS) {
    if (pattern.test(cleaned)) return kind;
  }
  return "unknown";
}

export interface ResumeSection {
  /** The heading as written, without markdown. */
  heading: string;
  kind: SectionKind;
  /** The lines under the heading, as markdown. */
  lines: string[];
}

export interface ParsedResume {
  /** The lines before the first section: name and contact details, usually. */
  header: string[];
  sections: ResumeSection[];
}

const HEADING_LINE = /^\s*(#{1,6})\s+(.+?)\s*#*\s*$/;
const BOLD_ONLY_LINE = /^\s*(\*\*|__)([^*_]+)\1\s*:?\s*$/;
const BULLET_LINE = /^\s*(?:[-*+•▪◦‣]|\d+[.)])\s+(.*)$/;

/**
 * Finds the resume's sections. Section headings are the shallowest markdown
 * heading level, apart from a leading `#` heading that holds the person's
 * name. A bold line on its own also starts a section when it's a standard
 * heading ("**EXPERIENCE**").
 */
export function parseResume(markdown: string): ParsedResume {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");

  const headings = lines
    .map((line, index) => ({ index, match: HEADING_LINE.exec(line) }))
    .filter((h): h is { index: number; match: RegExpExecArray } => h.match !== null);

  // A first `#` heading that isn't a section is the person's name.
  let candidates = headings;
  const first = headings[0];
  if (first && first.match[1].length === 1 && classifyHeading(first.match[2]) === "unknown") {
    candidates = headings.slice(1);
  }
  const sectionLevel = candidates.length ? Math.min(...candidates.map((h) => h.match[1].length)) : null;
  const sectionStarts = new Set(
    candidates.filter((h) => h.match[1].length === sectionLevel).map((h) => h.index),
  );

  const header: string[] = [];
  const sections: ResumeSection[] = [];
  for (const [index, line] of lines.entries()) {
    const heading = HEADING_LINE.exec(line);
    const bold = BOLD_ONLY_LINE.exec(line);
    const isSection =
      (heading && sectionStarts.has(index)) || (bold && classifyHeading(bold[2]) !== "unknown");
    if (isSection) {
      const text = stripMarkdown(heading ? heading[2] : bold![2]).replace(/:$/, "");
      sections.push({ heading: text, kind: classifyHeading(text), lines: [] });
    } else if (sections.length) {
      sections.at(-1)!.lines.push(line);
    } else {
      header.push(line);
    }
  }
  return { header: header.filter((l) => l.trim()), sections };
}

/** The bullet points in some lines, without markers or markdown. */
export function bulletsIn(lines: string[]): string[] {
  return lines
    .map((line) => BULLET_LINE.exec(line))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => stripMarkdown(m[1]))
    .filter((text) => text.length > 0);
}

/** Lines that are prose: not headings, bullets or blank. */
export function paragraphsIn(lines: string[]): string[] {
  return lines
    .filter((line) => line.trim() && !HEADING_LINE.test(line) && !BULLET_LINE.test(line))
    .map(stripMarkdown)
    .filter(Boolean);
}

export function sectionsOfKind(resume: ParsedResume, ...kinds: SectionKind[]): ResumeSection[] {
  return resume.sections.filter((s) => kinds.includes(s.kind));
}

/** The bullets that describe work: from Experience and Projects, or every section but Skills and Education if there's no Experience heading. */
export function workBullets(resume: ParsedResume): string[] {
  const work = sectionsOfKind(resume, "experience", "projects");
  const sections = work.length
    ? work
    : resume.sections.filter((s) => !["skills", "education", "certifications", "references"].includes(s.kind));
  return sections.flatMap((s) => bulletsIn(s.lines));
}

export function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/** Words for comparing two versions of the same text: lowercase, three or more characters, not only digits. */
export function tokens(text: string): string[] {
  return normalizeText(text)
    .split(/[^a-z0-9+#]+/)
    .filter((t) => t.length >= 3 && !/^\d+$/.test(t));
}

export function truncate(text: string, max = 160): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}

/** Escapes text for use inside a RegExp. */
export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** How many times a term appears as a whole word or phrase, ignoring case. */
export function countTerm(text: string, term: string): number {
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(term)}(?![\\p{L}\\p{N}+#])`, "giu");
  return text.match(pattern)?.length ?? 0;
}

// --- Dates -------------------------------------------------------------------

const MONTH =
  "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?";
const SEASON = "(?:spring|summer|fall|autumn|winter)";
const DATE = `(?:${MONTH}\\s+\\d{4}|${SEASON}\\s+\\d{4}|\\d{1,2}\\/\\d{4}|\\d{4}-\\d{2}(?!\\d)|\\d{4})`;
const END = `(?:${DATE}|present|current|now|today|ongoing)`;
const RANGE = new RegExp(`(?<![\\w/-])(${DATE})\\s*(?:-|–|—|to|until)\\s*(${END})(?![\\w/])`, "gi");

export type DateStyle = "month_name" | "numeric" | "iso" | "year" | "season";

export function dateStyle(date: string): DateStyle | null {
  const d = date.trim().toLowerCase();
  if (/^(present|current|now|today|ongoing)$/.test(d)) return null;
  if (new RegExp(`^${MONTH}\\s+\\d{4}$`).test(d)) return "month_name";
  if (new RegExp(`^${SEASON}\\s+\\d{4}$`).test(d)) return "season";
  if (/^\d{1,2}\/\d{4}$/.test(d)) return "numeric";
  if (/^\d{4}-\d{2}$/.test(d)) return "iso";
  if (/^\d{4}$/.test(d)) return "year";
  return null;
}

export interface DateRange {
  text: string;
  start: string;
  end: string;
}

/** Date ranges such as "Jan 2020 – Present" or "2018 - 2021". */
export function findDateRanges(text: string): DateRange[] {
  return [...text.matchAll(RANGE)]
    .map((m) => ({ text: m[0], start: m[1], end: m[2] }))
    .filter((r) => {
      // "1999-2001" style years must be plausible, so phone numbers and IDs don't count.
      const years = r.text.match(/\d{4}/g)?.map(Number) ?? [];
      return years.every((y) => y >= 1950 && y <= 2100);
    });
}

// --- Contact details ---------------------------------------------------------

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const URL_LIKE =
  /\b(?:https?:\/\/)?(?:www\.)?(?:linkedin\.com\/in\/[\w-]+|github\.com\/[\w-]+|[\w-]+\.(?:com|io|dev|me|net|org|design|co|site|page|portfolio)(?:\/[\w\-./]*)?)/gi;
const PHONE_CANDIDATE = /(?:\+\d{1,3}[\s.-]?)?\(?\d[\d\s().-]{7,}\d/g;
// "Austin, TX", "Leeds, United Kingdom", or "Remote".
const LOCATION = /\b[A-Z][a-zA-Z.'-]+(?:\s[A-Z][a-zA-Z.'-]+)*,\s*(?:[A-Z]{2}\b|[A-Z][a-z]+)/;
const REMOTE = /\bremote\b/i;

export function findEmails(text: string): string[] {
  return [...new Set(text.match(EMAIL) ?? [])];
}

export function findPhones(text: string): string[] {
  const phones = (text.match(PHONE_CANDIDATE) ?? [])
    .map((p) => p.trim())
    .filter((p) => {
      const digits = p.replace(/\D/g, "");
      if (digits.length < 9 || digits.length > 15) return false;
      // Not a year range like "2019 - 2021".
      return !/^(19|20)\d{2}\s*[-–]\s*(19|20)\d{2}$/.test(p);
    });
  // The same number written once, whatever its formatting.
  const seen = new Set<string>();
  return phones.filter((p) => {
    const digits = p.replace(/\D/g, "");
    if (seen.has(digits)) return false;
    seen.add(digits);
    return true;
  });
}

export function findLinks(text: string): string[] {
  const withoutEmails = text.replace(EMAIL, " ");
  return [...new Set(withoutEmails.match(URL_LIKE) ?? [])];
}

export function hasLocation(text: string): boolean {
  return LOCATION.test(text) || REMOTE.test(text);
}
