/**
 * The "How we review resumes" page (LAY-69): what each check looks for and
 * why. Slides link here for checks without an outside source. Every check
 * must be covered by one item (a test checks this).
 */
import type { CheckId, SectionId } from "./types";

export const GUIDE_PATH = "/how-we-review";

export interface GuideItem {
  title: string;
  text: string;
  checks: CheckId[];
}

export interface GuideSection {
  id: SectionId;
  title: string;
  intro: string;
  items: GuideItem[];
}

export const GUIDE_SECTIONS: GuideSection[] = [
  {
    id: "readability",
    title: "Can software read it?",
    intro:
      "Most employers use an applicant tracking system (ATS) that turns your resume into plain text before anyone reads it. Recruiters then search that text. If the software misreads your resume, you can be hard to find even when you're a great fit. We read your file the same way, and compare it with what a person sees.",
    items: [
      {
        title: "File type and name",
        text: "PDF and Word (.docx) files work best. The old .doc format is read poorly by some systems. Recruiters see the file name too, so use your name: \"Jane-Doe-Resume.pdf\" rather than \"resume_final_v3.pdf\".",
        checks: ["readability.file_type", "readability.file_name"],
      },
      {
        title: "Text software can read",
        text: "A scanned resume, or one exported as a picture by some design tools, has no text for software to read. Text inside images, icons and graphics is lost the same way, and so are contact details written in them.",
        checks: ["readability.text_layer", "readability.missing_content", "readability.contact_readable"],
      },
      {
        title: "Columns, tables and text boxes",
        text: "Plain text extraction reads straight across the page, so two columns or a sidebar get mixed together line by line. Many systems skip text boxes completely, and some misread tables. Headers and footers are often skipped too, so keep your contact details in the page itself. A single column is safest.",
        checks: ["readability.reading_order", "readability.layout_elements", "readability.header_footer"],
      },
      {
        title: "Hidden text",
        text: "Some people hide keywords in white or tiny text. Resume software strips formatting, so recruiters see it, and they treat it as a red flag.",
        checks: ["readability.hidden_text"],
      },
      {
        title: "Headings and dates",
        text: "Software finds your jobs and education by their headings, so use standard ones: Summary, Experience, Education, Skills. It works out your years of experience from your dates, so give every job a start and end in one consistent format, with months: \"Jan 2022 – Mar 2024\". Seasons like \"Fall 2018\" often can't be read as dates.",
        checks: ["readability.headings", "readability.dates"],
      },
    ],
  },
  {
    id: "basics",
    title: "Basics",
    intro: "The details a recruiter needs to reach you, and the ones to leave out.",
    items: [
      {
        title: "Contact details",
        text: "Put your email, phone number, city and region, and a LinkedIn or portfolio link at the top. Recruiters often filter by location, and many look at LinkedIn. Use an email address based on your name: nicknames, jokes and birth years stand out for the wrong reasons.",
        checks: ["basics.contact", "basics.email"],
      },
      {
        title: "Personal details to leave out",
        text: "In the US, UK and Canada, employers don't expect a photo, date of birth, age, marital status, children, nationality or religion, and many avoid resumes that include them because they can lead to unfair bias. A full street address isn't needed, and ID numbers put you at risk of identity theft.",
        checks: ["basics.personal_details"],
      },
      {
        title: "Outdated lines",
        text: "\"References available upon request\" is assumed, so it only takes up space. An Objective says what you want; a short Summary of what you offer works better.",
        checks: ["basics.outdated_lines"],
      },
    ],
  },
  {
    id: "first_impression",
    title: "First impression",
    intro:
      "Recruiters decide in a few seconds whether to keep reading. In that time they mostly read the top of the page and your job titles.",
    items: [
      {
        title: "Headline",
        text: "A single job title under your name tells a recruiter at once what you do. Match it to the kind of job you want. Several titles at once make it unclear.",
        checks: ["first_impression.headline"],
      },
      {
        title: "Summary",
        text: "Two to four lines that are specific to you: your field, your years of experience, and a strength or result. Generic phrases that could describe anyone get skipped.",
        checks: ["first_impression.summary"],
      },
      {
        title: "The top third",
        text: "The top third of the first page should show your most recent title, your main strengths and at least one concrete result.",
        checks: ["first_impression.top_third"],
      },
    ],
  },
  {
    id: "bullets",
    title: "Experience bullets",
    intro:
      "Your experience is where you prove what you can do. Recruiters skim it, so short bullets that show results do much better than paragraphs that list duties.",
    items: [
      {
        title: "Bullets, not paragraphs",
        text: "Give each job 3–6 bullets of one or two lines each, one achievement per bullet.",
        checks: ["bullets.present", "bullets.length", "bullets.per_role"],
      },
      {
        title: "Achievements, not duties",
        text: "Start each bullet with a strong verb that says what you did (\"Built\", \"Cut\", \"Led\"), not \"Responsible for\". Then say what changed because of it, with a number where you can: money, time saved, people, growth.",
        checks: ["bullets.weak_openers", "bullets.achievements", "bullets.numbers"],
      },
      {
        title: "Recent work first",
        text: "Recruiters care most about your recent work, so give it the most space. Jobs from more than about 15 years ago can be a line or two.",
        checks: ["bullets.detail_by_recency"],
      },
      {
        title: "Tense",
        text: "Write your current job in the present tense and past jobs in the past tense.",
        checks: ["bullets.tense"],
      },
    ],
  },
  {
    id: "skills",
    title: "Skills",
    intro: "Screening software and recruiters search for skills by name, and trust them more when your experience shows them in use.",
    items: [
      {
        title: "Skills shown in your experience",
        text: "A skill that appears in a bullet, next to what you did with it, counts for more than one that's only listed. Mention your most important skills where you used them.",
        checks: ["skills.shown_in_context"],
      },
      {
        title: "Acronyms",
        text: "Recruiters search for either form, so write key terms out once with the acronym: \"Search Engine Optimization (SEO)\".",
        checks: ["skills.acronyms"],
      },
      {
        title: "A list that's easy to scan",
        text: "Group your skills, keep the ones relevant to the jobs you want, and skip rating bars and basics every employer assumes. Repeating a keyword many times doesn't help with modern software, and recruiters notice it.",
        checks: ["skills.list_quality", "skills.repetition"],
      },
    ],
  },
  {
    id: "writing",
    title: "Writing quality",
    intro: "Small writing problems make a big impression, because they're easy to spot and easy to avoid.",
    items: [
      {
        title: "Spelling and grammar",
        text: "Spelling and grammar mistakes are easy to spot, and recruiters read them as carelessness. Read your resume out loud, or ask someone else to proofread it.",
        checks: ["writing.typos"],
      },
      {
        title: "Resume style",
        text: "Leave out \"I\" and \"my\" (\"Led a team of 5\", not \"I led a team of 5\"), and pick one style for punctuation and capitalization. Phrases like \"team player\" and \"results-driven\" are on so many resumes that recruiters skip them; show the quality with something you did.",
        checks: ["writing.pronouns", "writing.consistency", "writing.cliches"],
      },
      {
        title: "Signs of AI writing",
        text: "About half of hiring managers see heavily AI-written applications as a red flag. Common signs are words like \"leverage\" and \"spearhead\", lots of long dashes, bullets ending in a vague \"-ing\" phrase (\", improving efficiency\"), and every bullet built the same way. Using AI is fine; edit the result into your own words.",
        checks: ["writing.ai_words", "writing.em_dashes", "writing.ing_endings", "writing.repetitive_structure"],
      },
    ],
  },
  {
    id: "length",
    title: "Length and structure",
    intro: "How long your resume is, and the order of its sections.",
    items: [
      {
        title: "Length",
        text: "One page is expected early in your career. With more experience, two pages is fine and often preferred. Avoid a page that's only a few lines long, and more than two pages unless you're applying for academic or government jobs.",
        checks: ["length.pages"],
      },
      {
        title: "Section order",
        text: "Once you have a few years of experience, put Experience before Education. Recruiters look for your recent work first.",
        checks: ["length.section_order"],
      },
    ],
  },
  {
    id: "questions",
    title: "Questions a recruiter may ask",
    intro:
      "These aren't problems, and they never lower your result. They're things a recruiter may ask about, so you can be ready with an answer.",
    items: [
      {
        title: "Gaps between jobs",
        text: "Gaps are common and rarely rule anyone out, but an unexplained one can raise a question. A short line on the resume (study, caregiving, a career break) answers it up front.",
        checks: ["questions.gaps"],
      },
      {
        title: "Short jobs",
        text: "Several jobs that each lasted under a year can make recruiters wonder whether you'll stay. If some were contracts, or the company closed, say so next to the job.",
        checks: ["questions.short_jobs"],
      },
    ],
  },
];

/** The page section that explains a check. */
export function guideSectionFor(checkId: CheckId): GuideSection {
  const section = GUIDE_SECTIONS.find((s) => s.items.some((i) => i.checks.includes(checkId)));
  if (!section) throw new Error(`The "How we review resumes" page doesn't cover ${checkId}`);
  return section;
}
