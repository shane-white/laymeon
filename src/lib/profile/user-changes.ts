/**
 * Saving the user's changes to their Career Story. Every change is a row in
 * `career_profile_changes`; after each one, the profile the user sees
 * (`career_profiles.data`) is recomputed from the base profile and all of
 * their changes.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  applyUserChanges,
  changeIdOfUserItem,
  findItem,
  isUserItemKey,
  parseChangeFields,
  SECTION_FIELDS,
  type ChangeKind,
  type ListSection,
  type ProfileChange,
} from "./changes";
import { careerProfileSchema, type CareerProfile, type ProfileSection } from "./schema";

/** A problem with the request, shown to the user. */
export class ChangeError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

interface ChangeRow {
  id: string;
  section: ProfileSection;
  kind: ChangeKind;
  target_key: string | null;
  fields: Record<string, unknown> | null;
  base_snapshot: Record<string, unknown> | null;
  merged_keys: string[] | null;
}

const toChange = (row: ChangeRow): ProfileChange => ({
  id: row.id,
  section: row.section,
  kind: row.kind,
  targetKey: row.target_key,
  fields: row.fields,
  baseSnapshot: row.base_snapshot,
  mergedKeys: row.merged_keys,
});

async function loadChanges(supabase: SupabaseClient, userId: string): Promise<ProfileChange[]> {
  const { data, error } = await supabase
    .from("career_profile_changes")
    .select("id, section, kind, target_key, fields, base_snapshot, merged_keys")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (error) throw new Error(`Failed to load your changes: ${error.message}`);
  return ((data ?? []) as ChangeRow[]).map(toChange);
}

async function loadProfiles(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ base: CareerProfile; data: CareerProfile }> {
  const { data, error } = await supabase
    .from("career_profiles")
    .select("base, data")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load your Career Story: ${error.message}`);
  if (!data) throw new ChangeError("Build your Career Story first", 404);
  return { base: careerProfileSchema.parse(data.base), data: careerProfileSchema.parse(data.data) };
}

/**
 * Applies all of the user's changes over `base` and saves the result as the
 * profile they see. Changes that found their item by a looser match get its
 * new key, so the next rebuild finds it directly.
 */
export async function saveUserView(
  supabase: SupabaseClient,
  userId: string,
  base: CareerProfile,
): Promise<CareerProfile> {
  const changes = await loadChanges(supabase, userId);
  const { profile, retargets } = applyUserChanges(base, changes);

  for (const { changeId, targetKey } of retargets) {
    const { error } = await supabase
      .from("career_profile_changes")
      .update({ target_key: targetKey, updated_at: new Date().toISOString() })
      .eq("id", changeId)
      .eq("user_id", userId);
    if (error) throw new Error(`Failed to update a change: ${error.message}`);
  }

  const { error } = await supabase
    .from("career_profiles")
    .update({ data: profile, updated_at: new Date().toISOString() })
    .eq("user_id", userId);
  if (error) throw new Error(`Failed to save your Career Story: ${error.message}`);
  return profile;
}

async function refresh(supabase: SupabaseClient, userId: string): Promise<CareerProfile> {
  const { base } = await loadProfiles(supabase, userId);
  return saveUserView(supabase, userId, base);
}

async function getChange(supabase: SupabaseClient, userId: string, id: string): Promise<ChangeRow> {
  const { data, error } = await supabase
    .from("career_profile_changes")
    .select("id, section, kind, target_key, fields, base_snapshot, merged_keys")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load the change: ${error.message}`);
  if (!data) throw new ChangeError("That change doesn't exist", 404);
  return data as ChangeRow;
}

async function insertChange(
  supabase: SupabaseClient,
  userId: string,
  row: Omit<ChangeRow, "id">,
): Promise<void> {
  const { error } = await supabase.from("career_profile_changes").insert({ user_id: userId, ...row });
  if (error) throw new Error(`Failed to save the change: ${error.message}`);
}

async function updateChange(
  supabase: SupabaseClient,
  userId: string,
  id: string,
  row: Partial<Omit<ChangeRow, "id">>,
): Promise<void> {
  const { error } = await supabase
    .from("career_profile_changes")
    .update({ ...row, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(`Failed to save the change: ${error.message}`);
}

async function deleteChangeRow(supabase: SupabaseClient, userId: string, id: string): Promise<void> {
  const { error } = await supabase.from("career_profile_changes").delete().eq("id", id).eq("user_id", userId);
  if (error) throw new Error(`Failed to delete the change: ${error.message}`);
}

/** The item the documents give for `key`, as a plain object. */
function baseItem(base: CareerProfile, section: ProfileSection, key: string): Record<string, unknown> | undefined {
  if (section === "summary") return { ...base.summary };
  const item = findItem(base, section, key);
  return item ? { ...item } : undefined;
}

export type ChangeRequest =
  | { kind: "edit"; section: ProfileSection; targetKey: string; fields: unknown }
  | { kind: "add"; section: ProfileSection; fields: unknown }
  | { kind: "hide"; section: ProfileSection; targetKey: string }
  | { kind: "merge"; section: ProfileSection; targetKey: string; mergedKeys: string[] };

/** Saves one change from the UI and returns the updated profile. */
export async function makeChange(
  supabase: SupabaseClient,
  userId: string,
  request: ChangeRequest,
): Promise<CareerProfile> {
  const { base, data } = await loadProfiles(supabase, userId);
  const changes = await loadChanges(supabase, userId);
  const { section } = request;

  if (request.kind === "edit" || request.kind === "add") {
    const parsed = parseChangeFields(section, request.kind, request.fields);
    if (!parsed.ok) throw new ChangeError(parsed.error);
    const fields = parsed.fields;

    if (request.kind === "add") {
      await insertChange(supabase, userId, { section, kind: "add", target_key: null, fields, base_snapshot: null, merged_keys: null });
      return saveUserView(supabase, userId, base);
    }

    // Editing an item the user added updates that item's own change.
    const ownChangeId = changeIdOfUserItem(request.targetKey);
    if (ownChangeId) {
      const own = changes.find((c) => c.id === ownChangeId);
      if (!own) throw new ChangeError("That item doesn't exist", 404);
      await updateChange(supabase, userId, own.id, { fields: { ...own.fields, ...fields } });
      return saveUserView(supabase, userId, base);
    }

    const documents = baseItem(base, section, request.targetKey);
    if (!documents) throw new ChangeError("That item doesn't exist", 404);

    // One edit per item: later edits add to it. The snapshot keeps what the
    // documents said when each field was first edited.
    const existing = changes.find((c) => c.kind === "edit" && c.section === section && c.targetKey === request.targetKey);
    if (existing) {
      await updateChange(supabase, userId, existing.id, {
        fields: { ...existing.fields, ...fields },
        base_snapshot: { ...documents, ...pick(existing.baseSnapshot, Object.keys(existing.fields ?? {})) },
      });
    } else {
      await insertChange(supabase, userId, {
        section,
        kind: "edit",
        target_key: request.targetKey,
        fields,
        base_snapshot: documents,
        merged_keys: null,
      });
    }
    return saveUserView(supabase, userId, base);
  }

  if (section === "summary") throw new ChangeError("The summary can only be edited");

  if (request.kind === "hide") {
    // Removing an item the user added deletes it.
    const ownChangeId = changeIdOfUserItem(request.targetKey);
    if (ownChangeId) {
      await deleteChangeRow(supabase, userId, ownChangeId);
      return saveUserView(supabase, userId, base);
    }
    const item = findItem(data, section, request.targetKey) ?? findItem(base, section, request.targetKey);
    if (!item) throw new ChangeError("That item doesn't exist", 404);
    const alreadyHidden = changes.some((c) => c.kind === "hide" && c.section === section && c.targetKey === request.targetKey);
    if (!alreadyHidden) {
      await insertChange(supabase, userId, {
        section,
        kind: "hide",
        target_key: request.targetKey,
        fields: null,
        base_snapshot: { ...item },
        merged_keys: null,
      });
    }
    return saveUserView(supabase, userId, base);
  }

  // Merge
  if (section !== "skill") throw new ChangeError("Only skills can be merged");
  const target = findItem(data, "skill", request.targetKey);
  const merged = [...new Set(request.mergedKeys)].filter((k) => k !== request.targetKey);
  if (!target) throw new ChangeError("That skill doesn't exist", 404);
  if (merged.length === 0 || merged.some((k) => !findItem(data, "skill", k))) {
    throw new ChangeError("Pick other skills to merge into this one");
  }
  await insertChange(supabase, userId, {
    section,
    kind: "merge",
    target_key: request.targetKey,
    fields: null,
    base_snapshot: { ...target },
    merged_keys: merged,
  });
  return saveUserView(supabase, userId, base);
}

function pick(source: Record<string, unknown> | null, keys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) if (source && k in source) out[k] = source[k];
  return out;
}

/** Undoes a change: restores a removed item, resets an edit, deletes an added item, or splits a merge. */
export async function deleteChange(supabase: SupabaseClient, userId: string, id: string): Promise<CareerProfile> {
  await getChange(supabase, userId, id);
  await deleteChangeRow(supabase, userId, id);
  return refresh(supabase, userId);
}

export type ResolveRequest =
  /** Keep the user's value for a field the documents changed. */
  | { action: "keep_mine"; field: string }
  /** Go back to what the documents say for one field. */
  | { action: "reset_field"; field: string }
  /** Keep an edited item that's no longer in any document as the user's own. */
  | { action: "keep_item" };

/** Answers a review item, or resets one edited field. */
export async function resolveChange(
  supabase: SupabaseClient,
  userId: string,
  id: string,
  request: ResolveRequest,
): Promise<CareerProfile> {
  const row = await getChange(supabase, userId, id);
  const { base } = await loadProfiles(supabase, userId);

  if (request.action === "keep_item") {
    if (row.kind !== "edit" || row.section === "summary") throw new ChangeError("Only edited items can be kept");
    const section = row.section as ListSection;
    const allowed = Object.keys(SECTION_FIELDS[section].shape);
    const fields = pick({ ...row.base_snapshot, ...row.fields }, allowed);
    await updateChange(supabase, userId, id, { kind: "add", target_key: null, fields, base_snapshot: null });
    return saveUserView(supabase, userId, base);
  }

  const field = request.field;
  if (row.kind !== "edit" || !row.fields || !(field in row.fields)) {
    throw new ChangeError("That field wasn't edited");
  }

  if (request.action === "keep_mine") {
    // Treat what the documents say now as seen, so the question isn't asked again.
    const documents = row.target_key && !isUserItemKey(row.target_key) ? baseItem(base, row.section, row.target_key) : undefined;
    if (documents && field in documents) {
      await updateChange(supabase, userId, id, { base_snapshot: { ...row.base_snapshot, [field]: documents[field] } });
    }
    return saveUserView(supabase, userId, base);
  }

  // reset_field
  const rest = { ...row.fields };
  delete rest[field];
  if (Object.keys(rest).length === 0) await deleteChangeRow(supabase, userId, id);
  else await updateChange(supabase, userId, id, { fields: rest });
  return saveUserView(supabase, userId, base);
}
