/**
 * "Read further" sources for the resume review (LAY-69). The slides look up
 * links here by check ID. Claude never writes URLs.
 *
 * Every source was opened and checked by a person: it loads, and it says what
 * `shows` claims. When adding one, do the same, and run
 * `npm run check:sources` to find links that have broken or moved.
 *
 * Prefer, in this order: studies, surveys with a published method and
 * government pages; university career centers; well-known career sites.
 */
import { GUIDE_PATH, guideSectionFor } from "./guide";
import type { CheckId } from "./types";

export interface Source {
  title: string;
  publisher: string;
  url: string;
  /** When it was published or last updated, if the page says. */
  year?: number;
  /** One line on what it shows, for the slide. */
  shows: string;
}

export const SOURCES = {
  ladders2018: {
    title: "Eye tracking study shows recruiters look at resumes for 7 seconds",
    publisher: "HR Dive, on the Ladders 2018 eye-tracking study",
    url: "https://www.hrdive.com/news/eye-tracking-study-shows-recruiters-look-at-resumes-for-7-seconds/541582/",
    year: 2018,
    shows:
      "Recruiters spend about 7 seconds on a first look. Simple layouts with clear headings, bold job titles and bulleted accomplishments did best; multiple columns, long sentences and missing headings did worst.",
  },
  resumego2018: {
    title: "One or Two Page Resumes",
    publisher: "ResumeGo",
    url: "https://www.resumego.net/research/one-or-two-page-resumes/",
    year: 2018,
    shows:
      "In a study of 482 hiring professionals, two-page resumes were preferred for experienced candidates, especially at mid and manager level.",
  },
  eeocMaritalStatus: {
    title: "Pre-Employment Inquiries and Marital Status or Number of Children",
    publisher: "U.S. Equal Employment Opportunity Commission",
    url: "https://www.eeoc.gov/pre-employment-inquiries-and-marital-status-or-number-children",
    shows: "Employers generally shouldn't ask about marital status or children, because it can lead to discrimination.",
  },
  resumeGenius2026: {
    title: "2026 Hiring Trends Report",
    publisher: "Resume Genius (survey of 1,500 U.S. hiring managers)",
    url: "https://resumegenius.com/blog/job-hunting/hiring-trends-report-2026",
    year: 2026,
    shows:
      "Hiring managers' top red flags: job-hopping (65%), heavily AI-generated materials (49%), unexplained gaps (43%) and vague job descriptions (42%).",
  },
  harvardResume: {
    title: "Harvard College Guide to Creating a Strong Resume",
    publisher: "Harvard Mignone Center for Career Success",
    url: "https://careerservices.fas.harvard.edu/resources/create-a-strong-resume/",
    year: 2026,
    shows:
      "Start with action verbs, quantify results, skip personal pronouns, keep formatting consistent, and watch for spelling and grammar errors.",
  },
  pittAts: {
    title: "Resume and CV Writing Tips: Applicant Tracking Systems (ATS)",
    publisher: "University of Pittsburgh Career Central",
    url: "https://careercentral.pitt.edu/blog/2025/02/12/resume-and-cv-writing-tips-applicant-tracking-systems-ats/",
    year: 2025,
    shows:
      "Keep essential information out of headers and footers, avoid images and columns, use typical section titles, and save (don't print) to PDF.",
  },
  buffaloAts: {
    title: "ATS-Friendly Résumés",
    publisher: "University at Buffalo School of Management",
    url: "https://management.buffalo.edu/career-resource-center/students/preparation/tools/correspondence/resume/electronic.html",
    year: 2026,
    shows:
      "Avoid tables, columns, headers and footers, and images (including photos). Use standard headings, and write dates the same way throughout.",
  },
  umdTipSheet: {
    title: "CISC Resume Tip Sheet",
    publisher: "Universities at Shady Grove (University System of Maryland), Career and Internship Services Center",
    url: "https://shadygrove.usmd.edu/sites/default/files/u1221/CISC%20Resume%20Tip%20Sheet-1.pdf",
    shows:
      "Don't put contact details in the header, or use tables, columns or photos. Some design tools save PDFs as images that software can't read.",
  },
  builtInHiddenText: {
    title: "AI Resume Hacks? Recruiters Say Hidden Prompts Don't Work",
    publisher: "Built In",
    url: "https://builtin.com/articles/hidden-ai-prompts-in-resume",
    year: 2025,
    shows:
      "Resume software strips formatting, so hidden white text shows up for recruiters. They say it doesn't work and can get an applicant rejected.",
  },
} satisfies Record<string, Source>;

export type SourceId = keyof typeof SOURCES;

/** Sources for each check, best first. A check with none links to the "How we review resumes" page. */
export const CHECK_SOURCES: Partial<Record<CheckId, SourceId[]>> = {
  "readability.file_type": ["buffaloAts", "pittAts"],
  "readability.text_layer": ["umdTipSheet", "pittAts"],
  "readability.reading_order": ["buffaloAts", "ladders2018"],
  "readability.missing_content": ["pittAts", "umdTipSheet"],
  "readability.hidden_text": ["builtInHiddenText"],
  "readability.layout_elements": ["buffaloAts", "umdTipSheet"],
  "readability.header_footer": ["pittAts", "buffaloAts"],
  "readability.contact_readable": ["umdTipSheet", "pittAts"],
  "readability.headings": ["buffaloAts", "umdTipSheet"],
  "readability.dates": ["buffaloAts"],
  "basics.personal_details": ["eeocMaritalStatus", "buffaloAts"],
  "first_impression.headline": ["ladders2018"],
  "first_impression.summary": ["ladders2018"],
  "first_impression.top_third": ["ladders2018"],
  "bullets.present": ["ladders2018"],
  "bullets.weak_openers": ["harvardResume"],
  "bullets.numbers": ["harvardResume"],
  "bullets.achievements": ["harvardResume", "resumeGenius2026"],
  "bullets.length": ["ladders2018"],
  "writing.pronouns": ["harvardResume"],
  "writing.typos": ["harvardResume"],
  "writing.consistency": ["harvardResume", "buffaloAts"],
  "writing.ai_words": ["resumeGenius2026"],
  "writing.em_dashes": ["resumeGenius2026"],
  "writing.ing_endings": ["resumeGenius2026"],
  "writing.repetitive_structure": ["resumeGenius2026"],
  "skills.repetition": ["builtInHiddenText"],
  "length.pages": ["resumego2018"],
  "questions.gaps": ["resumeGenius2026"],
  "questions.short_jobs": ["resumeGenius2026"],
};

/** Where a check's "Read further" link goes: its best source, or its section of the "How we review resumes" page. */
export type ReadFurther =
  | { kind: "source"; source: Source }
  | { kind: "guide"; href: string; title: string };

export function readFurther(checkId: CheckId): ReadFurther {
  const first = CHECK_SOURCES[checkId]?.[0];
  if (first) return { kind: "source", source: SOURCES[first] };
  const section = guideSectionFor(checkId);
  return { kind: "guide", href: `${GUIDE_PATH}#${section.id}`, title: `How we review resumes: ${section.title}` };
}
