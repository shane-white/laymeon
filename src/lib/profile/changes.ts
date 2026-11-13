/**
 * The user's changes to their Career Story, and how they're applied over the
 * profile built from their documents. Rebuilds only replace the base profile;
 * applyUserChanges then puts the user's changes back on top, so they're never
 * lost.
 */
import { z } from "zod";
import { cleanProfileDate, overlapMonths, rangeToInterval } from "./dates";
import { presentMonth, recomputeDerived } from "./derive";
import { languageKey, normalizeEmployer, roleKey, skillMatchKey, slugify } from "./keys";
import { sameAccomplishment, sameEmployer, similarTitle } from "./similar";
import {
  careerProfileSchema,
  languageLevelSchema,
  skillCategorySchema,
  type CareerProfile,
  type ProfileSection,
  type UserChangesSummary,
} from "./schema";

export type ChangeKind = "edit" | "hide" | "add" | "merge";
export type ListSection = Exclude<ProfileSection, "summary">;

/** A row of `career_profile_changes`. */
export interface ProfileChange {
  id: string;
  section: ProfileSection;
  kind: ChangeKind;
  targetKey: string | null;
  fields: Record<string, unknown> | null;
  baseSnapshot: Record<string, unknown> | null;
  mergedKeys: string[] | null;
}

// --- Fields a user can set ---------------------------------------------------

const requiredText = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((v) => v || null);

const DATE_MESSAGE = 'Use a date like "2021-03", or just the year';
const date = z
  .string()
  .trim()
  .nullable()
  .refine((v) => !v || cleanProfileDate(v) !== null, DATE_MESSAGE)
  .transform((v) => (v ? cleanProfileDate(v) : null));
const endDate = z
  .string()
  .trim()
  .nullable()
  .refine((v) => !v || v.toLowerCase() === "present" || cleanProfileDate(v) !== null, DATE_MESSAGE)
  .transform((v) => (!v ? null : v.toLowerCase() === "present" ? "present" : cleanProfileDate(v)));

/** What each section's items can have changed. Unknown fields are rejected. */
export const SECTION_FIELDS = {
  summary: z.strictObject({ headline: optionalText(500) }),
  position: z.strictObject({
    employer: requiredText(200),
    title: requiredText(200),
    location: optionalText(200),
    start: date,
    end: endDate,
  }),
  skill: z.strictObject({
    name: requiredText(100),
    category: skillCategorySchema,
    positionKeys: z.array(z.string().max(300)).max(100),
    monthsOverride: z.number().int().min(0).max(720).nullable(),
  }),
  accomplishment: z.strictObject({
    text: requiredText(1000),
    positionKey: z.string().max(300).nullable(),
  }),
  education: z.strictObject({
    school: requiredText(200),
    degree: optionalText(200),
    field: optionalText(200),
    start: date,
    end: date,
  }),
  certification: z.strictObject({
    name: requiredText(200),
    issuer: optionalText(200),
    issued: date,
    expires: date,
  }),
  language: z.strictObject({ language: requiredText(100), level: languageLevelSchema.nullable() }),
} as const;

const REQUIRED_FOR_ADD: Record<ListSection, string[]> = {
  position: ["employer", "title"],
  skill: ["name", "category"],
  accomplishment: ["text"],
  education: ["school"],
  certification: ["name"],
  language: ["language"],
};

/** Validates and cleans the fields of an edit or an add. */
export function parseChangeFields(
  section: ProfileSection,
  kind: "edit" | "add",
  fields: unknown,
): { ok: true; fields: Record<string, unknown> } | { ok: false; error: string } {
  const parsed = SECTION_FIELDS[section].partial().safeParse(fields);
  if (!parsed.success) return { ok: false, error: z.prettifyError(parsed.error) };
  const clean = parsed.data as Record<string, unknown>;
  if (Object.keys(clean).length === 0) return { ok: false, error: "Nothing to change" };
  if (kind === "add") {
    if (section === "summary") return { ok: false, error: "The summary can only be edited" };
    const missing = REQUIRED_FOR_ADD[section].filter((f) => clean[f] === undefined || clean[f] === null);
    if (missing.length) return { ok: false, error: `Missing ${missing.join(", ")}` };
  }
  return { ok: true, fields: clean };
}

// --- Items -------------------------------------------------------------------

type Item = Record<string, unknown> & { key: string };

const LISTS = {
  position: "positions",
  skill: "skills",
  accomplishment: "accomplishments",
  education: "education",
  certification: "certifications",
  language: "languages",
} as const satisfies Record<ListSection, keyof CareerProfile>;

function listOf(profile: CareerProfile, section: ListSection): Item[] {
  return profile[LISTS[section]] as unknown as Item[];
}

/** The key of an item the user added. */
export function userItemKey(changeId: string): string {
  return `user:${changeId}`;
}

export function isUserItemKey(key: string): boolean {
  return key.startsWith("user:");
}

/** The change ID behind a user-added item's key. */
export function changeIdOfUserItem(key: string): string | null {
  return isUserItemKey(key) ? key.slice("user:".length) : null;
}

export function findItem(profile: CareerProfile, section: ListSection, key: string): Item | undefined {
  return listOf(profile, section).find((i) => i.key === key);
}

/** A short name for an item, e.g. "Product Manager at Lumen Analytics". */
export function itemLabel(section: ProfileSection, item: Record<string, unknown>): string {
  const s = (field: string) => (typeof item[field] === "string" ? (item[field] as string) : "");
  switch (section) {
    case "summary":
      return "Your headline";
    case "position":
      return `${s("title")} at ${s("employer")}`;
    case "skill":
      return s("name");
    case "accomplishment": {
      const text = s("text");
      return text.length > 80 ? `${text.slice(0, 77)}…` : text;
    }
    case "education":
      return s("school");
    case "certification":
      return s("name");
    case "language":
      return s("language");
  }
}

function newItem(section: ListSection, key: string, fields: Record<string, unknown>): Item {
  const defaults: Record<ListSection, Record<string, unknown>> = {
    position: {
      employer: "",
      title: "",
      titleFamily: (fields.title as string) ?? "",
      location: null,
      employmentType: null,
      start: null,
      end: null,
      isCurrent: false,
      months: null,
      peopleManaged: null,
      skillKeys: [],
    },
    skill: {
      name: "",
      aliases: [],
      category: "hard_skill",
      months: null,
      lastUsed: null,
      positionKeys: [],
      monthsOverride: null,
    },
    accomplishment: { text: "", metric: null, positionKey: null },
    education: { school: "", degree: null, field: null, start: null, end: null },
    certification: { name: "", issuer: null, issued: null, expires: null },
    language: { language: "", level: null },
  };
  return { ...defaults[section], ...fields, key, evidence: [] };
}

/**
 * Finds the item a change meant when its key no longer exists, for example
 * after a typo in the employer's name was fixed in a résumé.
 */
function looseMatch(
  section: ListSection,
  items: Item[],
  like: Record<string, unknown>,
  present: number,
): Item | undefined {
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const candidates = items.filter((i) => !isUserItemKey(i.key));
  switch (section) {
    case "position": {
      const employer = normalizeEmployer(str(like.employer));
      const title = str(like.title);
      const family = roleKey(str(like.titleFamily) || title);
      const interval = rangeToInterval(str(like.start) || null, str(like.end) || null, present);
      return candidates.find((p) => {
        if (!sameEmployer(normalizeEmployer(str(p.employer)), employer)) return false;
        if (!similarTitle(str(p.title), title) && roleKey(str(p.titleFamily)) !== family) return false;
        const other = rangeToInterval(str(p.start) || null, str(p.end) || null, present);
        return !interval || !other || overlapMonths(interval, other) > 0;
      });
    }
    case "skill": {
      const names = [str(like.name), ...((like.aliases as string[] | undefined) ?? [])].filter(Boolean);
      const keys = new Set(names.map(skillMatchKey));
      return candidates.find((s) =>
        [str(s.name), ...((s.aliases as string[]) ?? [])].some((n) => keys.has(skillMatchKey(n))),
      );
    }
    case "accomplishment":
      return candidates.find((a) => sameAccomplishment(str(a.text), str(like.text)));
    case "education":
      return candidates.find((e) => slugify(str(e.school)) === slugify(str(like.school)));
    case "certification":
      return candidates.find((c) => slugify(str(c.name)) === slugify(str(like.name)));
    case "language":
      return candidates.find((l) => languageKey(str(l.language)) === languageKey(str(like.language)));
  }
}

/** Compares field values; lists compare without regard to order. */
function sameValue(a: unknown, b: unknown): boolean {
  const norm = (v: unknown) => (Array.isArray(v) ? [...v].map(String).sort() : (v ?? null));
  return JSON.stringify(norm(a)) === JSON.stringify(norm(b));
}

// --- Applying ----------------------------------------------------------------

export interface ApplyResult {
  profile: CareerProfile;
  /** Changes whose item was found by a looser match; their target key should be updated. */
  retargets: { changeId: string; targetKey: string }[];
}

// Adds first, so merges and edits can refer to items the user added; removals
// last, so removing wins over everything else.
const KIND_ORDER: Record<ChangeKind, number> = { add: 0, merge: 1, edit: 2, hide: 3 };

/**
 * Applies the user's changes over the profile built from their documents.
 * Pure. `changes` should be in the order they were made.
 */
export function applyUserChanges(base: CareerProfile, changes: ProfileChange[]): ApplyResult {
  const profile: CareerProfile = structuredClone(base);
  const user: UserChangesSummary = { edits: [], added: [], removed: [], merges: [], reviews: [] };
  const retargets: ApplyResult["retargets"] = [];
  const present = presentMonth(base);

  const resolve = (change: ProfileChange, section: ListSection): Item | undefined => {
    if (!change.targetKey) return undefined;
    const items = listOf(profile, section);
    const direct = items.find((i) => i.key === change.targetKey);
    if (direct) return direct;
    if (!change.baseSnapshot || isUserItemKey(change.targetKey)) return undefined;
    const match = looseMatch(section, items, change.baseSnapshot, present);
    if (match) retargets.push({ changeId: change.id, targetKey: match.key });
    return match;
  };

  const applyEdit = (
    change: ProfileChange,
    section: ProfileSection,
    item: Record<string, unknown>,
    key: string,
  ) => {
    const fields: Record<string, { documents: unknown }> = {};
    for (const [field, value] of Object.entries(change.fields ?? {})) {
      const documents = item[field] ?? null;
      const snapshot = change.baseSnapshot;
      if (
        snapshot &&
        field in snapshot &&
        !sameValue(documents, snapshot[field]) &&
        !sameValue(documents, value)
      ) {
        user.reviews.push({
          changeId: change.id,
          section,
          key,
          label: itemLabel(section, item),
          kind: "documents_changed",
          field,
          yours: value,
          documents,
        });
      }
      fields[field] = { documents };
      item[field] = value;
    }
    user.edits.push({ changeId: change.id, section, key, fields });
  };

  const sorted = [...changes].sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
  for (const change of sorted) {
    if (change.section === "summary") {
      if (change.kind === "edit") applyEdit(change, "summary", profile.summary, "summary");
      continue;
    }
    const section = change.section;
    const items = listOf(profile, section);

    switch (change.kind) {
      case "add": {
        const fields = change.fields ?? {};
        // A document may now say the same thing: show it once, with the user's values.
        const match = looseMatch(section, items, fields, present);
        if (match) {
          Object.assign(match, fields);
          user.added.push({ changeId: change.id, section, key: match.key });
        } else {
          const item = newItem(section, userItemKey(change.id), fields);
          items.push(item);
          user.added.push({ changeId: change.id, section, key: item.key });
        }
        break;
      }

      case "merge": {
        if (section !== "skill") break;
        const target = resolve(change, section);
        if (!target) break;
        const mergedNames: string[] = [];
        for (const key of change.mergedKeys ?? []) {
          const other = profile.skills.find(
            (s) => s.key !== target.key && (s.key === key || skillMatchKey(s.name) === skillMatchKey(key)),
          );
          if (!other) continue;
          const targetName = String(target.name).toLowerCase();
          target.aliases = [...new Set([...(target.aliases as string[]), other.name, ...other.aliases])]
            .filter((a) => a.toLowerCase() !== targetName)
            .sort();
          target.evidence = [...(target.evidence as unknown[]), ...other.evidence];
          target.positionKeys = [...new Set([...(target.positionKeys as string[]), ...other.positionKeys])];
          profile.skills = profile.skills.filter((s) => s !== other);
          mergedNames.push(other.name);
        }
        if (mergedNames.length) user.merges.push({ changeId: change.id, key: target.key, mergedNames });
        break;
      }

      case "edit": {
        const target = resolve(change, section);
        if (target) {
          applyEdit(change, section, target, target.key);
        } else if (change.baseSnapshot) {
          // No document has this item any more. Keep the user's version and ask.
          const item = {
            ...newItem(section, userItemKey(change.id), change.baseSnapshot),
            ...(change.fields ?? {}),
          };
          items.push(item);
          user.added.push({ changeId: change.id, section, key: item.key });
          user.reviews.push({
            changeId: change.id,
            section,
            key: item.key,
            label: itemLabel(section, item),
            kind: "not_in_documents",
            field: null,
            yours: null,
            documents: null,
          });
        }
        break;
      }

      case "hide": {
        const target = resolve(change, section);
        if (!target) break; // Kept anyway, so the item stays hidden if it comes back.
        const list = listOf(profile, section);
        list.splice(list.indexOf(target), 1);
        user.removed.push({ changeId: change.id, section, key: target.key, label: itemLabel(section, target) });
        break;
      }
    }
  }

  const derived = recomputeDerived(profile);

  // Drop notes about items that are gone (removed, or merged away).
  const exists = (section: ProfileSection, key: string) =>
    section === "summary" || listOf(derived, section).some((i) => i.key === key);
  derived.user = {
    edits: user.edits.filter((e) => exists(e.section, e.key)),
    added: user.added.filter((a) => exists(a.section, a.key)),
    removed: user.removed,
    merges: user.merges.filter((m) => exists("skill", m.key)),
    reviews: user.reviews.filter((r) => exists(r.section, r.key)),
  };

  return { profile: careerProfileSchema.parse(derived), retargets };
}
