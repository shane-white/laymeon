/**
 * "Can software read it?" Compares the resume Claude read (the markdown)
 * with what plain text extraction gets from the file, and checks the things
 * parsers rely on: headings, dates, file type.
 */
import { normalizeText } from "@/lib/match-report/evidence";
import { check, describePosition, plural, percent, share, type CheckContext } from "../context";
import {
  dateStyle,
  findDateRanges,
  findEmails,
  findPhones,
  sectionsOfKind,
  stripMarkdown,
  tokens,
  truncate,
  type DateStyle,
} from "../text";
import type { CheckResult, SoftwareView } from "../types";

const PDF = "application/pdf";
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const DOC = "application/msword";

// Below this share of the resume's words, the file is mostly an image.
const TEXT_LAYER_MIN_COVERAGE = 0.3;
const TEXT_LAYER_MIN_WORDS = 20;

// Share of the resume's words software must find.
const MISSING_FIX_BELOW = 0.75;
const MISSING_IMPROVE_BELOW = 0.92;

// Reading order: the share of lines software reads in the right order.
const ORDER_FIX_BELOW = 0.7;
const ORDER_IMPROVE_BELOW = 0.85;
const ORDER_MIN_LINES = 6;
const PROBE_WORDS = 4;

// Hidden text: words software reads that aren't in the resume people see.
const HIDDEN_MIN_WORDS = 15;
const HIDDEN_MIN_SHARE = 0.08;

export function readabilityChecks(ctx: CheckContext): CheckResult[] {
  const results = [fileType(ctx), fileName(ctx)];
  const software = ctx.input.software;
  if (software) {
    const textLayer = textLayerCheck(ctx, software);
    results.push(textLayer);
    // With no text to read, the other comparisons say nothing new.
    if (textLayer.label === "good") {
      // A .docx was parsed from the same plain text, so comparing the two finds nothing.
      // Its layout problems show in the file's structure instead.
      if (software.format === "pdf") {
        results.push(
          readingOrder(ctx, software),
          missingContent(ctx, software),
          hiddenText(ctx, software),
          contactReadable(ctx, software),
        );
      } else {
        results.push(layoutElements(software), headerFooter(software));
      }
    }
  }
  results.push(headings(ctx), dates(ctx));
  return results;
}

function fileType(ctx: CheckContext): CheckResult {
  const { mimeType } = ctx.input;
  if (mimeType === PDF || mimeType === DOCX) {
    return check("readability.file_type", "good", `${mimeType === PDF ? "PDF" : "Word (.docx)"} files work with resume-reading software.`);
  }
  if (mimeType === DOC) {
    return check(
      "readability.file_type",
      "could_improve",
      "This is the old Word format (.doc). Some systems read it poorly. Save it as .docx or PDF.",
    );
  }
  return check("readability.file_type", "fix", "Upload the resume as a PDF or Word (.docx) file.");
}

// Words that say nothing about whose resume it is.
const GENERIC_NAME_WORDS = new Set([
  "resume", "résumé", "cv", "curriculum", "vitae", "final", "draft", "new", "updated", "update", "copy",
  "document", "doc", "untitled", "version", "v", "my", "latest", "the", "of", "and", "pdf", "docx",
]);

function fileName(ctx: CheckContext): CheckResult {
  const name = ctx.input.filename;
  const base = name.replace(/\.[a-z0-9]+$/i, "");
  const words = base.toLowerCase().split(/[^\p{L}]+/u).filter(Boolean);
  const draftMarks = /\b(final|draft|copy)\b|\(\d+\)|[_\s-]v\d+\b|\bv\d+$/i.test(base);
  const onlyGeneric = words.every((w) => GENERIC_NAME_WORDS.has(w));
  if (onlyGeneric || draftMarks) {
    return check(
      "readability.file_name",
      "could_improve",
      'Recruiters see the file name. Use your name, like "Jane-Doe-Resume.pdf".',
      [name],
      { generic: onlyGeneric, draftMarks },
    );
  }
  return check("readability.file_name", "good", "The file name is clear.", [name]);
}

/** Words of the markdown and of the software's text, for comparing the two. */
function wordSets(ctx: CheckContext, software: SoftwareView) {
  const resumeWords = new Set(tokens(ctx.input.markdown));
  const softwareWords = new Set(tokens(software.text));
  const found = [...resumeWords].filter((w) => softwareWords.has(w)).length;
  return { resumeWords, softwareWords, coverage: share(found, resumeWords.size) };
}

function textLayerCheck(ctx: CheckContext, software: SoftwareView): CheckResult {
  const { softwareWords, coverage } = wordSets(ctx, software);
  const data = { softwareWords: softwareWords.size, coverage: Number(coverage.toFixed(2)) };
  if (softwareWords.size < TEXT_LAYER_MIN_WORDS || coverage < TEXT_LAYER_MIN_COVERAGE) {
    return check(
      "readability.text_layer",
      "fix",
      "Software can't read the text in this file. It looks like a scan or an image of a resume. Export it from your editor as a PDF or .docx instead.",
      software.text.trim() ? [truncate(software.text, 200)] : [],
      data,
    );
  }
  return check("readability.text_layer", "good", "The file contains text software can read.", [], data);
}

/** A markdown line as plain text, without its bullet marker. */
function plainLine(line: string): string {
  return stripMarkdown(line.replace(/^\s*(?:[-*+•]|\d+[.)])\s+/, ""));
}

/** Lines of the markdown with enough words to find again in the software's text. */
function probeLines(markdown: string): { line: string; probe: string }[] {
  return markdown
    .split("\n")
    .map(plainLine)
    .map((line) => ({ line, words: normalizeText(line).split(" ").filter(Boolean) }))
    .filter((l) => l.words.length >= PROBE_WORDS)
    .map((l) => ({ line: l.line, probe: l.words.slice(0, PROBE_WORDS).join(" ") }));
}

/** Lowercase words only, so punctuation and markdown don't stop two versions of a line from matching. */
function looseText(text: string): string {
  return normalizeText(text).split(/[^a-z0-9+#]+/).filter(Boolean).join(" ");
}

/**
 * Lines software reads that mix text from different places in the resume,
 * like "Summary Python, SQL, Kafka": a heading with a sidebar's skills. Plain
 * text extraction reads straight across the page, so columns side by side
 * become one line. Lines that are mostly missing from the resume are left
 * out: those are hidden text, which another check covers.
 */
function mixedLines(markdown: string, software: SoftwareView): { mixed: string[]; considered: number } {
  const resumeText = looseText(markdown);
  const resumeWords = new Set(tokens(markdown));
  let considered = 0;
  const mixed: string[] = [];
  for (const line of software.text.split("\n")) {
    const loose = looseText(line);
    const words = tokens(line);
    if (loose.split(" ").length < 3 || words.length === 0) continue;
    if (share(words.filter((w) => resumeWords.has(w)).length, words.length) < 0.8) continue;
    considered++;
    if (!resumeText.includes(loose)) mixed.push(truncate(line.replace(/\t/g, "   ")));
  }
  return { mixed, considered };
}

/** Length of the longest increasing run (not necessarily adjacent) in a list. */
export function longestIncreasing(values: number[]): number {
  const tails: number[] = [];
  for (const v of values) {
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (tails[mid] < v) lo = mid + 1;
      else hi = mid;
    }
    tails[lo] = v;
  }
  return tails.length;
}

/**
 * Two signs of columns, a sidebar or text boxes:
 * - Lines that mix text from different parts of the resume (see mixedLines).
 * - Resume lines software reads in a different order. Found by looking up
 *   the start of each resume line in the software's text.
 */
function readingOrder(ctx: CheckContext, software: SoftwareView): CheckResult {
  const softwareText = normalizeText(software.text);
  const lines = probeLines(ctx.input.markdown);
  const positions = lines.map((l) => softwareText.indexOf(l.probe)).filter((i) => i >= 0);
  const { mixed, considered } = mixedLines(ctx.input.markdown, software);

  if (positions.length < ORDER_MIN_LINES) {
    return check("readability.reading_order", "good", "The resume is too short to check its reading order.", [], {
      lines: lines.length,
    });
  }

  const inOrder = share(longestIncreasing(positions), positions.length);
  const mixedShare = share(mixed.length, considered);
  // The worse of the two: lines out of order, or lines mixed together.
  const score = Math.min(inOrder, 1 - mixedShare);
  const data = { inOrder: Number(inOrder.toFixed(2)), mixedLines: mixed.length, mixedShare: Number(mixedShare.toFixed(2)) };
  // Mixed lines show the problem best. Without them, show the start of what software read.
  const evidence = mixed.length ? mixed : [truncate(software.pages?.[0] ?? software.text, 400)];

  if (score < ORDER_FIX_BELOW) {
    return check(
      "readability.reading_order",
      "fix",
      "Software reads across the whole page, so your columns or sidebar get mixed together line by line. Use a single column.",
      evidence,
      data,
    );
  }
  if (score < ORDER_IMPROVE_BELOW) {
    return check(
      "readability.reading_order",
      "could_improve",
      "Software reads some of your lines out of order or mixed with others, which usually means part of the page is in columns or a sidebar.",
      evidence,
      data,
    );
  }
  return check("readability.reading_order", "good", "Software reads your resume in the right order.", [], data);
}

/** Resume lines that are mostly missing from the software's text: usually text in images. */
function missingContent(ctx: CheckContext, software: SoftwareView): CheckResult {
  const { softwareWords, coverage } = wordSets(ctx, software);
  const missingLines = ctx.input.markdown
    .split("\n")
    .map(plainLine)
    .filter((line) => {
      const words = tokens(line);
      return words.length >= 2 && share(words.filter((w) => !softwareWords.has(w)).length, words.length) > 0.5;
    })
    .map((line) => truncate(line));

  const data = { coverage: Number(coverage.toFixed(2)), missingLines: missingLines.length };
  const summary = `Software can't find some of your resume's text (${percent(1 - coverage)} of the words). It's probably in images, icons or graphics. Put the text itself on the page.`;
  if (coverage < MISSING_FIX_BELOW) return check("readability.missing_content", "fix", summary, missingLines, data);
  // One line can differ because of how Claude tidied it up; two or more is a pattern.
  if (coverage < MISSING_IMPROVE_BELOW || missingLines.length >= 2) {
    return check("readability.missing_content", "could_improve", summary, missingLines, data);
  }
  return check("readability.missing_content", "good", "Software finds all of your resume's text.", [], data);
}

/**
 * Words software reads that aren't in the resume people see: white or tiny
 * text, or text hidden behind something. Lines that repeat on every page are
 * headers and footers, which the markdown leaves out on purpose.
 */
function hiddenText(ctx: CheckContext, software: SoftwareView): CheckResult {
  const pages = software.pages ?? [software.text];
  const lineCounts = new Map<string, number>();
  for (const page of pages) {
    for (const line of new Set(page.split("\n").map((l) => normalizeText(l)).filter(Boolean))) {
      lineCounts.set(line, (lineCounts.get(line) ?? 0) + 1);
    }
  }
  const repeated = (line: string) => pages.length > 1 && (lineCounts.get(normalizeText(line)) ?? 0) > 1;

  const resumeWords = new Set(tokens(ctx.input.markdown));
  const softwareLines = pages.flatMap((p) => p.split("\n")).filter((l) => l.trim() && !repeated(l));
  const softwareWords = softwareLines.flatMap(tokens);
  const extra = new Set(softwareWords.filter((w) => !resumeWords.has(w)));
  const extraShare = share(extra.size, new Set(softwareWords).size);

  const data = { extraWords: extra.size, extraShare: Number(extraShare.toFixed(2)) };
  if (extra.size >= HIDDEN_MIN_WORDS && extraShare >= HIDDEN_MIN_SHARE) {
    const lines = softwareLines
      .filter((l) => {
        const words = tokens(l);
        return words.length >= 2 && share(words.filter((w) => extra.has(w)).length, words.length) > 0.5;
      })
      .map((l) => truncate(l));
    return check(
      "readability.hidden_text",
      "could_improve",
      "Software reads text that isn't visible on the page, such as white or very small text. Recruiters see it in the parsed version and treat hidden keywords as a red flag. Remove it.",
      lines,
      data,
    );
  }
  return check("readability.hidden_text", "good", "There's no hidden text.", [], data);
}

function layoutElements(software: SoftwareView): CheckResult {
  const { tables, textBoxes, columns } = software.docx!;
  const found = [
    textBoxes ? plural(textBoxes, "text box", "text boxes") : null,
    tables ? plural(tables, "table") : null,
    columns > 1 ? `${columns} text columns` : null,
  ].filter((x): x is string => x !== null);
  const data = { tables, textBoxes, columns };

  if (textBoxes > 0) {
    return check(
      "readability.layout_elements",
      "fix",
      `This file uses ${found.join(", ")}. Many systems skip text boxes entirely. Move that text into the main page, in a single column.`,
      found,
      data,
    );
  }
  if (found.length) {
    return check(
      "readability.layout_elements",
      "could_improve",
      `This file uses ${found.join(" and ")}. Some systems read tables and columns out of order. A single column with no tables is safest.`,
      found,
      data,
    );
  }
  return check("readability.layout_elements", "good", "No tables, text boxes or columns.", [], data);
}

function headerFooter(software: SoftwareView): CheckResult {
  const text = software.docx!.headerFooterText.trim();
  if (!text) return check("readability.header_footer", "good", "Nothing important is in the header or footer.");
  const hasContact = findEmails(text).length > 0 || findPhones(text).length > 0;
  return check(
    "readability.header_footer",
    hasContact ? "fix" : "could_improve",
    hasContact
      ? "Your contact details are in the page header or footer, which many systems skip. Move them to the top of the page itself."
      : "Some text is in the page header or footer, which many systems skip. Move anything important into the page itself.",
    [truncate(text, 200)],
    { hasContact },
  );
}

/** Contact details Claude read from the PDF but plain text extraction doesn't find. */
function contactReadable(ctx: CheckContext, software: SoftwareView): CheckResult {
  const softwareDigits = software.text.replace(/\D/g, "");
  const softwareText = software.text.toLowerCase();

  const emails = findEmails(ctx.input.markdown);
  const phones = findPhones(ctx.input.markdown);
  const missing = [
    ...emails.filter((e) => !softwareText.includes(e.toLowerCase())),
    ...phones.filter((p) => !softwareDigits.includes(p.replace(/\D/g, ""))),
  ];
  if (emails.length + phones.length === 0) {
    return check("readability.contact_readable", "good", "No contact details to check.");
  }
  if (missing.length) {
    return check(
      "readability.contact_readable",
      "fix",
      "Software can't read some of your contact details. They may be in an image, an icon, or the page header. Type them as plain text at the top of the page.",
      missing,
      { missing: missing.length },
    );
  }
  return check("readability.contact_readable", "good", "Software can read your contact details.");
}

function headings(ctx: CheckContext): CheckResult {
  const { sections } = ctx.resume;
  const unusual = sections.filter((s) => s.kind === "unknown").map((s) => s.heading);
  const hasExperience = sections.some((s) => s.kind === "experience");
  const data = { sections: sections.length, unusual: unusual.length, hasExperience };

  if (!hasExperience) {
    return check(
      "readability.headings",
      "fix",
      'Software looks for a heading like "Experience" or "Work Experience" to find your jobs, and this resume doesn\'t have one.',
      unusual,
      data,
    );
  }
  if (unusual.length) {
    return check(
      "readability.headings",
      "could_improve",
      `Software may not recognize ${unusual.length === 1 ? "this heading" : "these headings"}. Use standard ones like Summary, Experience, Education and Skills.`,
      unusual,
      data,
    );
  }
  return check("readability.headings", "good", "Your section headings are standard.", [], data);
}

const STYLE_EXAMPLES: Record<DateStyle, string> = {
  month_name: "Jan 2022",
  numeric: "01/2022",
  iso: "2022-01",
  year: "2022",
  season: "Spring 2022",
};

function dates(ctx: CheckContext): CheckResult {
  const experience = sectionsOfKind(ctx.resume, "experience")
    .flatMap((s) => s.lines)
    .join("\n");
  const ranges = findDateRanges(experience || ctx.body);

  if (ranges.length === 0) {
    return check(
      "readability.dates",
      "fix",
      'Software can\'t find dates for your jobs. Give each job a start and end date, like "Jan 2022 – Mar 2024".',
    );
  }

  const byStyle = new Map<DateStyle, string>();
  for (const r of ranges) {
    for (const d of [r.start, r.end]) {
      const style = dateStyle(d);
      if (style && !byStyle.has(style)) byStyle.set(style, r.text);
    }
  }
  const styles = [...byStyle.keys()];
  // Jobs the Career Story found with no start date.
  const undated = ctx.positions.filter((p) => !p.start.trim());
  const data = { ranges: ranges.length, styles: styles.join(","), undatedJobs: undated.length };

  // A resume can have more than one of these, so all of them are reported.
  const problems: { summary: string; evidence: string[] }[] = [];
  if (undated.length) {
    problems.push({
      summary: `${plural(undated.length, "job has", "jobs have")} no dates. Software works out your years of experience from the dates, so give every job a start and end.`,
      evidence: undated.map(describePosition),
    });
  }
  if (styles.length > 1) {
    problems.push({
      summary: `Your dates are written ${styles.length} different ways (${styles.map((s) => STYLE_EXAMPLES[s]).join(", ")}). Pick one.`,
      evidence: [...byStyle.values()],
    });
  }
  if (styles.includes("season")) {
    problems.push({
      summary: 'Some dates use seasons ("Fall 2018"). Many systems can\'t turn a season into a date, so they can\'t count your years of experience. Use months.',
      evidence: [byStyle.get("season")!],
    });
  } else if (styles.length === 1 && styles[0] === "year") {
    problems.push({
      summary: "Your dates only give the year. Software and recruiters work out how long you held each job from the dates, so add the month.",
      evidence: ranges.slice(0, 2).map((r) => r.text),
    });
  }

  if (problems.length) {
    return check(
      "readability.dates",
      "could_improve",
      `${problems.map((p) => p.summary).join(" ")} Write every job's dates the same way, like "Jan 2022 – Mar 2024".`,
      problems.flatMap((p) => p.evidence),
      data,
    );
  }
  return check("readability.dates", "good", "Your dates are consistent and easy to read.", [], data);
}
