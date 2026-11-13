/**
 * Merges the extractions of a user's documents into one base profile. Pure:
 * the same documents always produce the same profile, with the same keys.
 *
 * - Résumés are the backbone. When résumés disagree, the most recent wins,
 *   and the disagreement is recorded as a conflict for the user to review.
 * - Cover letters and projects only add to the profile: their jobs attach to
 *   a résumé's job at the same employer (so their skills count toward its
 *   years), and they never change a résumé's dates or titles.
 * - The same job on two résumés becomes one position.
 * - Durations are computed here from position dates, never by the model.
 * - Evidence quotes are checked against the document they came from.
 */
import { normalizeText, quoteInResume } from "@/lib/match-report/evidence";
import {
  cleanProfileDate,
  formatMonth,
  isPresent,
  monthOfIsoDate,
  parseProfileDate,
  overlapMonths,
  rangeToInterval,
  totalMonths,
  type MonthInterval,
} from "./dates";
import {
  accomplishmentKey,
  certificationKey,
  dedupeKeys,
  educationKey,
  languageKey,
  normalizeEmployer,
  positionKey,
  roleKey,
  skillKey,
  skillMatchKey,
  slugify,
} from "./keys";
import {
  careerProfileSchema,
  knownOrNull,
  PROFILE_VERSION,
  type CareerProfile,
  type Evidence,
  type Extraction,
} from "./schema";

export interface ProfileSourceDocument {
  id: string;
  name: string;
  type: "resume" | "cover_letter" | "project";
  markdown: string;
  /** ISO date the document was added. "present" in it means this date. */
  asOf: string;
  targetRole: string | null;
}

export interface ExtractedDocument {
  document: ProfileSourceDocument;
  extraction: Extraction;
}

const MAX_EVIDENCE = 5;

// Two positions from different documents are the same job when they have the
// same employer and role and overlap for at least this share of the shorter one.
// Lower, and a promotion that shares a boundary month would merge with the
// job before it.
const SAME_POSITION_OVERLAP = 0.5;

interface WorkingPosition {
  employer: string;
  title: string;
  titleFamily: string;
  location: string | null;
  employmentType: CareerProfile["positions"][number]["employmentType"];
  start: string | null;
  end: string | null;
  peopleManaged: number | null;
  interval: MonthInterval | null;
  documentIds: Set<string>;
  documentId: string;
  fromResume: boolean;
  /** The end came from "present" on a document older than the newest résumé. */
  endFromPresent: boolean;
  conflicts: CareerProfile["conflicts"][number][];
  employerKey: string;
  familyKey: string;
  titleKey: string;
  /** Skill match keys (see skillMatchKey). */
  skillKeys: Set<string>;
  evidence: Evidence[];
  achievements: { text: string; metric: string | null; evidence: Evidence[] }[];
  order: number;
}

function addEvidence(list: Evidence[], items: Evidence[]): void {
  for (const item of items) {
    if (list.length >= MAX_EVIDENCE) return;
    const quote = normalizeText(item.quote);
    if (!list.some((e) => e.documentId === item.documentId && normalizeText(e.quote) === quote)) {
      list.push(item);
    }
  }
}

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function samePosition(a: WorkingPosition, b: WorkingPosition): boolean {
  if (a.employerKey !== b.employerKey) return false;
  if (a.familyKey !== b.familyKey && a.titleKey !== b.titleKey) return false;
  if (a.interval && b.interval) {
    const shorter = Math.min(a.interval.end - a.interval.start, b.interval.end - b.interval.start);
    return overlapMonths(a.interval, b.interval) >= shorter * SAME_POSITION_OVERLAP;
  }
  // Without dates on both sides, only the exact same title is safe to merge.
  return a.titleKey === b.titleKey;
}

/** True when two dates can't both be right: different years, or different months when both give one. */
function datesDisagree(a: string | null, b: string | null): boolean {
  const da = parseProfileDate(a);
  const db = parseProfileDate(b);
  if (!da || !db) return false;
  if (da.year !== db.year) return true;
  return da.month !== null && db.month !== null && da.month !== db.month;
}

function recordDateConflicts(winner: WorkingPosition, other: WorkingPosition): void {
  const fields: ("start" | "end")[] = ["start"];
  // "present" only means the job hadn't ended when the document was written.
  const eitherOpen =
    winner.endFromPresent || other.endFromPresent || winner.end === "present" || other.end === "present";
  if (!eitherOpen) fields.push("end");
  for (const field of fields) {
    if (datesDisagree(winner[field], other[field])) {
      winner.conflicts.push({
        section: "position",
        key: "",
        field,
        chosen: { documentId: winner.documentId, value: winner[field] },
        other: { documentId: other.documentId, value: other[field] },
      });
    }
  }
}

/** Folds `other` into `winner`. The winner's values stay; `other` only fills gaps. */
function mergePosition(winner: WorkingPosition, other: WorkingPosition): void {
  if (winner.fromResume && other.fromResume && winner.interval && other.interval) {
    recordDateConflicts(winner, other);
  }
  winner.location ??= other.location;
  winner.employmentType ??= other.employmentType;
  winner.peopleManaged ??= other.peopleManaged;
  if (!winner.interval && other.interval) {
    winner.start = other.start;
    winner.end = other.end;
    winner.interval = other.interval;
    winner.endFromPresent = other.endFromPresent;
  }
  other.documentIds.forEach((id) => winner.documentIds.add(id));
  other.skillKeys.forEach((key) => winner.skillKeys.add(key));
  addEvidence(winner.evidence, other.evidence);
  for (const achievement of other.achievements) {
    const text = normalizeText(achievement.text);
    const existing = winner.achievements.find((a) => normalizeText(a.text) === text);
    if (existing) {
      existing.metric ??= achievement.metric;
      addEvidence(existing.evidence, achievement.evidence);
    } else {
      winner.achievements.push(achievement);
    }
  }
}

/**
 * The job a cover letter or project refers to: the one at the same employer
 * whose dates overlap most, else the most recent in the same role, else the
 * only job at that employer. Undefined if it can't tell which job it is.
 */
function findReferencedPosition(
  working: WorkingPosition[],
  reference: WorkingPosition,
): WorkingPosition | undefined {
  const sameEmployer = working.filter((w) => w.employerKey === reference.employerKey);
  if (sameEmployer.length === 0) return undefined;

  const referenceInterval = reference.interval;
  if (referenceInterval) {
    const overlapping = sameEmployer
      .map((w) => ({ w, overlap: w.interval ? overlapMonths(w.interval, referenceInterval) : 0 }))
      .filter((o) => o.overlap > 0)
      .sort((a, b) => b.overlap - a.overlap || a.w.order - b.w.order);
    if (overlapping.length) return overlapping[0].w;
  }

  const sameRole = sameEmployer
    .filter((w) => w.familyKey === reference.familyKey || w.titleKey === reference.titleKey)
    .sort(comparePositions);
  if (sameRole.length) return sameRole[0];

  return sameEmployer.length === 1 ? sameEmployer[0] : undefined;
}

function comparePositions(a: WorkingPosition, b: WorkingPosition): number {
  if (a.interval && b.interval) {
    return b.interval.end - a.interval.end || b.interval.start - a.interval.start || a.order - b.order;
  }
  if (a.interval) return -1;
  if (b.interval) return 1;
  return a.order - b.order;
}

/**
 * Résumés first, then cover letters and projects, each most recent first.
 * Ties are broken by ID so the order is always the same.
 */
function bySourceOrder(docs: ExtractedDocument[]): ExtractedDocument[] {
  const rank = (d: ExtractedDocument) => (d.document.type === "resume" ? 0 : 1);
  return [...docs].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      b.document.asOf.localeCompare(a.document.asOf) ||
      a.document.id.localeCompare(b.document.id),
  );
}

export function buildProfile(docs: ExtractedDocument[], builtAt: string): CareerProfile {
  const ordered = bySourceOrder(docs);
  const resumes = ordered.filter(({ document }) => document.type === "resume");
  const newestResumeAsOf = resumes[0]?.document.asOf;

  const verified = (doc: ProfileSourceDocument, quote: string | null | undefined): Evidence[] => {
    const trimmed = clean(quote);
    return trimmed && quoteInResume(trimmed, doc.markdown)
      ? [{ documentId: doc.id, quote: trimmed }]
      : [];
  };

  // Positions. Achievements from cover-letter or project jobs that can't be
  // tied to a job are kept as accomplishments of their own.
  const working: WorkingPosition[] = [];
  const unattached: WorkingPosition["achievements"] = [];
  let order = 0;
  for (const { document, extraction } of ordered) {
    const fromResume = document.type === "resume";
    const asOf = monthOfIsoDate(document.asOf);
    for (const p of extraction.positions) {
      const employer = clean(p.employer);
      const title = clean(p.title);
      const titleFamily = clean(p.titleFamily) ?? title;
      const start = cleanProfileDate(p.start);
      const present = isPresent(p.end);
      const interval = rangeToInterval(start, present ? "present" : p.end, asOf);
      // "present" on a document older than the newest résumé only means
      // "still there when it was written", so it ends at that document's date.
      const stillCurrent = !newestResumeAsOf || document.asOf >= newestResumeAsOf;
      const end = present ? (stillCurrent ? "present" : formatMonth(asOf)) : cleanProfileDate(p.end);

      const candidate: WorkingPosition = {
        employer: employer ?? "",
        title: title ?? "",
        titleFamily: titleFamily ?? "",
        location: clean(p.location),
        employmentType: knownOrNull(p.employmentType),
        start,
        end,
        peopleManaged: p.peopleManaged > 0 ? Math.round(p.peopleManaged) : null,
        interval,
        documentIds: new Set([document.id]),
        documentId: document.id,
        fromResume,
        endFromPresent: present && !stillCurrent,
        conflicts: [],
        employerKey: employer ? normalizeEmployer(employer) : "",
        familyKey: titleFamily ? roleKey(titleFamily) : "",
        titleKey: title ? slugify(title) : "",
        skillKeys: new Set(p.skills.map((s) => clean(s)).filter((s) => s !== null).map(skillMatchKey)),
        evidence: verified(document, p.evidence),
        achievements: p.achievements
          .filter((a) => clean(a.text))
          .map((a) => ({
            text: a.text.trim(),
            metric: clean(a.metric),
            evidence: verified(document, a.evidence),
          })),
        order: order++,
      };

      if (fromResume) {
        if (!employer || !title) continue;
        const match = working.find((w) => !w.documentIds.has(document.id) && samePosition(w, candidate));
        if (match) mergePosition(match, candidate);
        else working.push(candidate);
        continue;
      }

      // A cover letter's or project's job needs a real quote naming it.
      const named = employer !== null && candidate.evidence.length > 0;
      const referenced = named ? findReferencedPosition(working, candidate) : undefined;
      const employerKnown = working.some((w) => w.employerKey === candidate.employerKey);
      if (referenced) {
        mergePosition(referenced, candidate);
      } else if (named && title && !employerKnown) {
        // A job no résumé lists.
        working.push(candidate);
      } else {
        unattached.push(...candidate.achievements);
      }
    }
  }
  working.sort(comparePositions);

  const keyedPositions = dedupeKeys(
    working.map((w) => ({ key: positionKey(w.employer, w.titleFamily, w.start), w })),
  );

  // Skills, matched across documents by a loose key ("React.js" = "React").
  // The first name seen (from the most recent résumé) sets the skill's key.
  const skillMap = new Map<
    string,
    { name: string; aliases: Set<string>; category: CareerProfile["skills"][number]["category"]; evidence: Evidence[] }
  >();
  for (const { document, extraction } of ordered) {
    for (const s of extraction.skills) {
      const name = clean(s.canonicalName) ?? clean(s.name);
      if (!name) continue;
      const matchKey = skillMatchKey(name);
      let skill = skillMap.get(matchKey);
      if (!skill) {
        skill = { name, aliases: new Set(), category: s.category, evidence: [] };
        skillMap.set(matchKey, skill);
      }
      for (const alias of [s.name, s.canonicalName]) {
        const a = clean(alias);
        if (a) skill.aliases.add(a);
      }
      addEvidence(skill.evidence, verified(document, s.evidence));
    }
  }
  // A skill needs at least one quote that's really in a document.
  for (const [matchKey, skill] of skillMap) {
    if (skill.evidence.length === 0) skillMap.delete(matchKey);
  }
  const finalSkillKey = (matchKey: string) => skillKey(skillMap.get(matchKey)!.name);

  const positions = keyedPositions.map(({ key, w }) => ({
    key,
    employer: w.employer,
    title: w.title,
    titleFamily: w.titleFamily,
    location: w.location,
    employmentType: w.employmentType,
    start: w.start,
    end: w.end,
    isCurrent: w.end === "present",
    months: w.interval ? w.interval.end - w.interval.start : null,
    peopleManaged: w.peopleManaged,
    skillKeys: [...new Set([...w.skillKeys].filter((k) => skillMap.has(k)).map(finalSkillKey))].sort(),
    evidence: w.evidence,
  }));

  const intervalOf = new Map(keyedPositions.map(({ key, w }) => [key, w.interval]));

  const skills = [...skillMap.values()]
    .map((skill) => {
      const key = skillKey(skill.name);
      const linked = positions.filter((p) => p.skillKeys.includes(key));
      const intervals = linked.map((p) => intervalOf.get(p.key) ?? null);
      const ends = intervals.filter((i) => i !== null).map((i) => i.end);
      const lastUsed = linked.some((p) => p.isCurrent)
        ? "present"
        : ends.length
          ? formatMonth(Math.max(...ends) - 1)
          : null;
      const lower = skill.name.toLowerCase();
      return {
        key,
        name: skill.name,
        aliases: [...skill.aliases].filter((a) => a.toLowerCase() !== lower).sort(),
        category: skill.category,
        months: totalMonths(intervals),
        lastUsed,
        positionKeys: linked.map((p) => p.key),
        evidence: skill.evidence,
      };
    })
    .sort((a, b) => (b.months ?? -1) - (a.months ?? -1) || b.evidence.length - a.evidence.length || a.key.localeCompare(b.key));

  // Experience by role
  const roleMap = new Map<string, { titleFamily: string; positionKeys: string[] }>();
  for (const p of positions) {
    const key = roleKey(p.titleFamily);
    const role = roleMap.get(key) ?? { titleFamily: p.titleFamily, positionKeys: [] };
    role.positionKeys.push(p.key);
    roleMap.set(key, role);
  }
  const roles = [...roleMap.entries()]
    .map(([key, role]) => ({
      key,
      titleFamily: role.titleFamily,
      months: totalMonths(role.positionKeys.map((k) => intervalOf.get(k) ?? null)),
      positionKeys: role.positionKeys,
    }))
    .sort((a, b) => (b.months ?? -1) - (a.months ?? -1) || a.key.localeCompare(b.key));

  // Education: kept even without a verified quote, like positions.
  const educationMap = new Map<string, CareerProfile["education"][number]>();
  for (const { document, extraction } of ordered) {
    for (const e of extraction.education) {
      const school = clean(e.school);
      if (!school) continue;
      const degree = clean(e.degree);
      const key = educationKey(school, degree);
      const existing = educationMap.get(key);
      const evidence = verified(document, e.evidence);
      if (existing) {
        existing.field ??= clean(e.field);
        existing.start ??= cleanProfileDate(e.start);
        existing.end ??= cleanProfileDate(e.end);
        addEvidence(existing.evidence, evidence);
      } else {
        educationMap.set(key, {
          key,
          school,
          degree,
          field: clean(e.field),
          start: cleanProfileDate(e.start),
          end: cleanProfileDate(e.end),
          evidence,
        });
      }
    }
  }

  // Certifications and languages need a verified quote.
  const certificationMap = new Map<string, CareerProfile["certifications"][number]>();
  const languageMap = new Map<string, CareerProfile["languages"][number]>();
  for (const { document, extraction } of ordered) {
    for (const c of extraction.certifications) {
      const name = clean(c.name);
      if (!name) continue;
      const evidence = verified(document, c.evidence);
      if (evidence.length === 0) continue;
      const issuer = clean(c.issuer);
      const key = certificationKey(name, issuer);
      const existing = certificationMap.get(key);
      if (existing) {
        existing.issued ??= cleanProfileDate(c.issued);
        existing.expires ??= cleanProfileDate(c.expires);
        addEvidence(existing.evidence, evidence);
      } else {
        certificationMap.set(key, {
          key,
          name,
          issuer,
          issued: cleanProfileDate(c.issued),
          expires: cleanProfileDate(c.expires),
          evidence,
        });
      }
    }
    for (const l of extraction.languages) {
      const language = clean(l.language);
      if (!language) continue;
      const evidence = verified(document, l.evidence);
      if (evidence.length === 0) continue;
      const key = languageKey(language);
      const existing = languageMap.get(key);
      if (existing) {
        existing.level ??= knownOrNull(l.level);
        addEvidence(existing.evidence, evidence);
      } else {
        languageMap.set(key, { key, language, level: knownOrNull(l.level), evidence });
      }
    }
  }

  // Accomplishments come from positions' achievements and need a verified quote.
  const accomplishmentMap = new Map<string, CareerProfile["accomplishments"][number]>();
  for (const { key: posKey, w } of keyedPositions) {
    for (const a of w.achievements) {
      if (a.evidence.length === 0) continue;
      const key = accomplishmentKey(posKey, a.text);
      if (!accomplishmentMap.has(key)) {
        accomplishmentMap.set(key, {
          key,
          text: a.text,
          metric: a.metric,
          positionKey: posKey,
          evidence: a.evidence,
        });
      }
    }
  }

  for (const a of unattached) {
    if (a.evidence.length === 0) continue;
    const key = accomplishmentKey(null, a.text);
    if (!accomplishmentMap.has(key)) {
      accomplishmentMap.set(key, { key, text: a.text, metric: a.metric, positionKey: null, evidence: a.evidence });
    }
  }

  const conflicts = keyedPositions.flatMap(({ key, w }) => w.conflicts.map((c) => ({ ...c, key })));

  const workIntervals = keyedPositions
    .filter(({ w }) => w.employmentType !== "volunteer")
    .map(({ w }) => w.interval);

  const targetRoles: string[] = [];
  for (const { document } of ordered) {
    const role = clean(document.targetRole);
    if (role && !targetRoles.some((r) => r.toLowerCase() === role.toLowerCase())) targetRoles.push(role);
  }

  return careerProfileSchema.parse({
    version: PROFILE_VERSION,
    builtAt,
    sources: ordered.map(({ document }) => ({
      documentId: document.id,
      documentName: document.name,
      documentType: document.type,
      asOf: document.asOf,
    })),
    summary: {
      headline: resumes.map(({ extraction }) => clean(extraction.headline)).find(Boolean) ?? null,
      seniority: resumes.map(({ extraction }) => knownOrNull(extraction.seniority)).find(Boolean) ?? null,
      currentTitle: positions.find((p) => p.isCurrent)?.title ?? null,
      targetRoles,
      totalMonths: totalMonths(workIntervals),
    },
    positions,
    skills,
    roles,
    education: [...educationMap.values()].sort((a, b) => (b.end ?? "").localeCompare(a.end ?? "")),
    certifications: [...certificationMap.values()],
    languages: [...languageMap.values()],
    accomplishments: [...accomplishmentMap.values()],
    conflicts,
  });
}
