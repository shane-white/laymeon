/**
 * Types for the resume review's code checks (LAY-67). Each check has a fixed
 * ID. The report stores IDs, and the slides look up "Read further" sources by
 * ID, so an ID must never change meaning. Add a new ID instead.
 */
import type { Extraction } from "@/lib/profile/schema";

/** The report's sections, in slide order. */
export const SECTIONS = [
  "readability",
  "basics",
  "first_impression",
  "bullets",
  "skills",
  "writing",
  "length",
  "questions",
] as const;
export type SectionId = (typeof SECTIONS)[number];

/** Every check that runs in code, and the section it belongs to. */
export const CODE_CHECKS = {
  "readability.file_type": "readability",
  "readability.file_name": "readability",
  "readability.text_layer": "readability",
  "readability.reading_order": "readability",
  "readability.missing_content": "readability",
  "readability.hidden_text": "readability",
  "readability.layout_elements": "readability",
  "readability.header_footer": "readability",
  "readability.contact_readable": "readability",
  "readability.headings": "readability",
  "readability.dates": "readability",
  "basics.contact": "basics",
  "basics.email": "basics",
  "basics.personal_details": "basics",
  "basics.outdated_lines": "basics",
  "bullets.present": "bullets",
  "bullets.weak_openers": "bullets",
  "bullets.numbers": "bullets",
  "bullets.length": "bullets",
  "bullets.per_role": "bullets",
  "bullets.detail_by_recency": "bullets",
  "skills.shown_in_context": "skills",
  "skills.repetition": "skills",
  "writing.pronouns": "writing",
  "writing.cliches": "writing",
  "writing.ai_words": "writing",
  "writing.em_dashes": "writing",
  "writing.ing_endings": "writing",
  "writing.repetitive_structure": "writing",
  "writing.consistency": "writing",
  "length.pages": "length",
  "length.section_order": "length",
  "questions.gaps": "questions",
  "questions.short_jobs": "questions",
} as const satisfies Record<string, SectionId>;

export type CodeCheckId = keyof typeof CODE_CHECKS;

/** Checks that need judgment, run by Claude (LAY-68). */
export const MODEL_CHECKS = {
  "first_impression.headline": "first_impression",
  "first_impression.summary": "first_impression",
  "first_impression.top_third": "first_impression",
  "bullets.achievements": "bullets",
  "bullets.tense": "bullets",
  "skills.acronyms": "skills",
  "skills.list_quality": "skills",
  "writing.typos": "writing",
} as const satisfies Record<string, SectionId>;

export type ModelCheckId = keyof typeof MODEL_CHECKS;

export const ALL_CHECKS = { ...CODE_CHECKS, ...MODEL_CHECKS };
export type CheckId = CodeCheckId | ModelCheckId;
export const CHECK_IDS = Object.keys(ALL_CHECKS) as [CheckId, ...CheckId[]];

/**
 * good / could_improve / fix are the labels users see. info is for
 * "Questions a recruiter may ask" and never counts as a problem.
 */
export type CheckLabel = "good" | "could_improve" | "fix" | "info";

export interface CheckResult {
  id: CodeCheckId;
  section: SectionId;
  label: CheckLabel;
  /** One plain sentence on what was found. */
  summary: string;
  /** Quotes from the resume, or what software read. At most MAX_EVIDENCE items. */
  evidence: string[];
  /** The counts behind the label, for the model and the slides. */
  data?: Record<string, number | string | boolean>;
}

export const MAX_EVIDENCE = 5;

/** What resume-reading software gets from the file. */
export interface SoftwareView {
  format: "pdf" | "docx";
  /** All the body text, in the order software reads it. */
  text: string;
  /** Text per page (PDF only). */
  pages: string[] | null;
  /** Null when the file doesn't say (DOCX saved without page statistics). */
  pageCount: number | null;
  /** Images in the file. `page` is null for DOCX, which has no fixed pages. */
  images: { page: number | null; width: number; height: number }[];
  /** Layout elements that many parsers skip or misread (DOCX only). */
  docx: {
    tables: number;
    textBoxes: number;
    /** The most text columns any section of the document uses. */
    columns: number;
    /** Text in headers and footers, which many parsers skip. */
    headerFooterText: string;
  } | null;
}

export interface CodeCheckInput {
  /** The resume as Claude parsed it (`documents.parsed_markdown`). */
  markdown: string;
  /** The uploaded file's name. */
  filename: string;
  mimeType: string;
  /** From readAsSoftware(). Null when the file type can't be read that way. */
  software: SoftwareView | null;
  /** The cached Career Story extraction for this resume, if there is one. */
  extraction: Extraction | null;
  /** When the resume was added (ISO date). "Present" in it means as of this date. */
  asOf: string;
}
