/**
 * Each section's generator in production. One function per section, so each
 * ticket fills in its own without touching the others:
 * - Process: LAY-120 (the company's interview process from the web, with Sources)
 * - Company: LAY-121 (what the company does, news from the last 6 months, its values)
 * - Practice: LAY-122 (Decks of Practice cards with hints from the Career Story)
 *
 * Until then each throws `SectionNotImplementedError`, which the section shows
 * as not available yet. On any other failure a generator throws, and the
 * section is saved as failed with the error's message, so keep messages fit
 * to show the user.
 */
import { claudeCompanyModel } from "./company/claude";
import { researchCompany } from "./company/research";
import { firecrawlCompanyWeb } from "./company/web";
import { SectionNotImplementedError, type SectionGenerator, type SectionGenerators } from "./interview-prep";

export const generateProcess: SectionGenerator<"process"> = async () => {
  throw new SectionNotImplementedError("process");
};

export const generateCompany: SectionGenerator<"company"> = ({ job }) =>
  researchCompany(job, { web: firecrawlCompanyWeb(), model: claudeCompanyModel(), now: () => new Date() });

export const generatePractice: SectionGenerator<"practice"> = async () => {
  throw new SectionNotImplementedError("practice");
};

export const sectionGenerators: SectionGenerators = {
  process: generateProcess,
  company: generateCompany,
  practice: generatePractice,
};
