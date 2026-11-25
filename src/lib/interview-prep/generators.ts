/**
 * Each section's generator in production. One function per section, so each
 * ticket fills in its own without touching the others:
 * - Process: LAY-120 (the company's interview process from the web, with Sources)
 * - Company: LAY-121 (what the company does, news from the last 6 months, its values)
 * - Practice: LAY-122 (Decks of Practice cards with hints from the Career Story)
 *
 * A generator that isn't built throws `SectionNotImplementedError`, which the
 * section shows as not available yet. On any other failure a generator
 * throws, and the section is saved as failed with the error's message, so
 * keep messages fit to show the user.
 */
import { claudeCompanyModel } from "./company/claude";
import { researchCompany } from "./company/research";
import { firecrawlCompanyWeb } from "./company/web";
import { processResearchDeps } from "./process/production";
import { researchProcess } from "./process/research";
import { claudePracticeModel } from "./practice/claude";
import { practiceGenerator, practiceWriter } from "./practice/writer";
import type { PracticeCardWriter, SectionGenerator, SectionGenerators } from "./interview-prep";

export const generateProcess: SectionGenerator<"process"> = ({ job }) => researchProcess(job, processResearchDeps());

export const generateCompany: SectionGenerator<"company"> = ({ job }) =>
  researchCompany(job, { web: firecrawlCompanyWeb(), model: claudeCompanyModel(), now: () => new Date() });

/** Writes Practice cards with Claude: for the Practice section, More like this and the user's own questions. */
export const practiceCardWriter: PracticeCardWriter = practiceWriter({ model: claudePracticeModel(), newId: () => crypto.randomUUID() });

export const generatePractice: SectionGenerator<"practice"> = practiceGenerator(practiceCardWriter);

export const sectionGenerators: SectionGenerators = {
  process: generateProcess,
  company: generateCompany,
  practice: generatePractice,
};
