"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { AlertCircle, Combine, Loader2, MoreHorizontal, Pencil, Plus, RotateCcw, Split, Trash2, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  useProfileChange,
  useResolveProfileChange,
  useUndoProfileChange,
  type ProfileChangeRequest,
  type ResolveRequest,
} from "@/hooks/use-profile";
import { formatProfileDate } from "@/lib/profile/format";
import type { CareerProfile, ProfileSection, UserChangesSummary } from "@/lib/profile/schema";
import { cn } from "@/lib/utils";

type Item = Record<string, unknown> & { key: string };
type Edit = UserChangesSummary["edits"][number];

// --- Forms -------------------------------------------------------------------

type FieldType = "text" | "textarea" | "date" | "end" | "category" | "level" | "position" | "positions" | "years";

interface FieldConfig {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  placeholder?: string;
  hint?: string;
}

const DATE_HINT = "e.g. 2021-03, or just 2021";

const FORMS: Record<ProfileSection, { noun: string; fields: FieldConfig[] }> = {
  summary: {
    noun: "headline",
    fields: [
      {
        name: "headline",
        label: "Headline",
        type: "textarea",
        placeholder: "e.g. Data engineer who builds reliable pipelines for finance teams",
      },
    ],
  },
  position: {
    noun: "job",
    fields: [
      { name: "title", label: "Title", type: "text", required: true },
      { name: "employer", label: "Employer", type: "text", required: true },
      { name: "location", label: "Location", type: "text", placeholder: "e.g. Denver, CO or Remote" },
      { name: "start", label: "Started", type: "date", placeholder: "2021-03", hint: DATE_HINT },
      { name: "end", label: "Ended", type: "end", placeholder: "2023-06", hint: DATE_HINT },
    ],
  },
  skill: {
    noun: "skill",
    fields: [
      { name: "name", label: "Name", type: "text", required: true },
      { name: "category", label: "Kind", type: "category" },
      { name: "positionKeys", label: "Jobs where you used it", type: "positions", hint: "Its years come from these jobs' dates." },
      {
        name: "extraMonths",
        label: "Experience outside these jobs (years)",
        type: "years",
        placeholder: "0",
        hint: "e.g. 2 for side projects or school",
      },
    ],
  },
  accomplishment: {
    noun: "accomplishment",
    fields: [
      { name: "text", label: "What you did", type: "textarea", required: true, placeholder: "Include the result, e.g. cut costs 30%" },
      { name: "positionKey", label: "Where it happened", type: "position" },
    ],
  },
  education: {
    noun: "education",
    fields: [
      { name: "school", label: "School", type: "text", required: true },
      { name: "degree", label: "Degree", type: "text", placeholder: "e.g. B.S." },
      { name: "field", label: "Field of study", type: "text" },
      { name: "start", label: "Started", type: "date", placeholder: "2014", hint: DATE_HINT },
      { name: "end", label: "Finished", type: "date", placeholder: "2018", hint: DATE_HINT },
    ],
  },
  certification: {
    noun: "certification",
    fields: [
      { name: "name", label: "Name", type: "text", required: true },
      { name: "issuer", label: "Issued by", type: "text" },
      { name: "issued", label: "Issued", type: "date", placeholder: "2023", hint: DATE_HINT },
      { name: "expires", label: "Expires", type: "date", placeholder: "2026", hint: DATE_HINT },
    ],
  },
  language: {
    noun: "language",
    fields: [
      { name: "language", label: "Language", type: "text", required: true },
      { name: "level", label: "Level", type: "level" },
    ],
  },
};

const CATEGORY_OPTIONS = [
  { value: "hard_skill", label: "Skill" },
  { value: "tool", label: "Tool" },
  { value: "domain", label: "Industry or field" },
  { value: "method", label: "Way of working" },
  { value: "soft_skill", label: "Working with people" },
];

const LEVEL_OPTIONS = [
  { value: "native", label: "Native" },
  { value: "fluent", label: "Fluent" },
  { value: "professional", label: "Professional" },
  { value: "conversational", label: "Conversational" },
  { value: "basic", label: "Basic" },
];

const NONE = "__none";

type FormValues = Record<string, unknown>;

function toFormValues(section: ProfileSection, item: Item | undefined): FormValues {
  const values: FormValues = {};
  for (const f of FORMS[section].fields) {
    const v = item?.[f.name];
    switch (f.type) {
      case "end":
        values[f.name] = v === "present" ? "" : ((v as string) ?? "");
        values[`${f.name}:current`] = v === "present";
        break;
      case "years":
        values[f.name] = typeof v === "number" && v > 0 ? String(Math.round((v / 12) * 10) / 10) : "";
        break;
      case "positions":
        values[f.name] = (v as string[]) ?? [];
        break;
      case "category":
        values[f.name] = (v as string) ?? "hard_skill";
        break;
      case "level":
      case "position":
        values[f.name] = (v as string) ?? NONE;
        break;
      default:
        values[f.name] = (v as string) ?? "";
    }
  }
  return values;
}

function fromFormValues(section: ProfileSection, values: FormValues): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  for (const f of FORMS[section].fields) {
    const v = values[f.name];
    switch (f.type) {
      case "end":
        fields[f.name] = values[`${f.name}:current`] ? "present" : String(v).trim() || null;
        break;
      case "years": {
        const years = Number(String(v).trim() || 0);
        fields[f.name] = Number.isFinite(years) && years > 0 ? Math.round(years * 12) : 0;
        break;
      }
      case "positions":
        fields[f.name] = v;
        break;
      case "category":
        fields[f.name] = v;
        break;
      case "level":
      case "position":
        fields[f.name] = v === NONE ? null : v;
        break;
      default:
        fields[f.name] = String(v).trim() || null;
    }
  }
  return fields;
}

function sameField(a: unknown, b: unknown): boolean {
  const norm = (v: unknown) => (Array.isArray(v) ? [...v].sort() : (v ?? null));
  return JSON.stringify(norm(a)) === JSON.stringify(norm(b));
}

// --- Context -----------------------------------------------------------------

interface EditorTarget {
  section: ProfileSection;
  /** Undefined when adding. */
  item?: Item;
  /** For a new accomplishment, the job it belongs to. */
  defaults?: Record<string, unknown>;
}

interface Editor {
  profile: CareerProfile;
  busy: boolean;
  edit(section: ProfileSection, item: Item): void;
  add(section: ProfileSection, defaults?: Record<string, unknown>): void;
  merge(skillKey: string): void;
  remove(section: ProfileSection, item: Item): void;
  undo(changeId: string, message?: string): void;
  resolve(changeId: string, request: ResolveRequest, message?: string): void;
  editOf(section: ProfileSection, key: string): Edit | undefined;
  isAdded(section: ProfileSection, key: string): boolean;
}

const EditorContext = createContext<Editor | null>(null);

export function useEditor(): Editor {
  const editor = useContext(EditorContext);
  if (!editor) throw new Error("useEditor must be used inside ProfileEditor");
  return editor;
}

const failed = (err: unknown) => toast.error(err instanceof Error ? err.message : "Something went wrong");

export function ProfileEditor({ profile, children }: { profile: CareerProfile; children: ReactNode }) {
  const change = useProfileChange();
  const undoChange = useUndoProfileChange();
  const resolveChange = useResolveProfileChange();
  const [target, setTarget] = useState<EditorTarget | null>(null);
  const [mergeKey, setMergeKey] = useState<string | null>(null);

  const editor = useMemo<Editor>(
    () => ({
      profile,
      busy: change.isPending || undoChange.isPending || resolveChange.isPending,
      edit: (section, item) => setTarget({ section, item }),
      add: (section, defaults) => setTarget({ section, defaults }),
      merge: (skillKey) => setMergeKey(skillKey),
      remove: (section, item) => {
        change.mutate(
          { kind: "hide", section, targetKey: item.key },
          {
            onSuccess: (updated) => {
              const removed = updated.user.removed.find((r) => r.section === section && r.key === item.key);
              toast.success("Removed from your Career Story", {
                action: removed
                  ? { label: "Undo", onClick: () => undoChange.mutate(removed.changeId, { onError: failed }) }
                  : undefined,
              });
            },
            onError: failed,
          },
        );
      },
      undo: (changeId, message) =>
        undoChange.mutate(changeId, {
          onSuccess: () => message && toast.success(message),
          onError: failed,
        }),
      resolve: (changeId, request, message) =>
        resolveChange.mutate(
          { changeId, ...request },
          { onSuccess: () => message && toast.success(message), onError: failed },
        ),
      editOf: (section, key) => profile.user.edits.find((e) => e.section === section && e.key === key),
      isAdded: (section, key) => profile.user.added.some((a) => a.section === section && a.key === key),
    }),
    [profile, change, undoChange, resolveChange],
  );

  return (
    <EditorContext.Provider value={editor}>
      {children}
      <Dialog open={target !== null} onOpenChange={(open) => !open && setTarget(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          {target && (
            <ItemForm
              key={`${target.section}:${target.item?.key ?? "new"}`}
              target={target}
              profile={profile}
              pending={change.isPending}
              onSubmit={(request) =>
                change.mutate(request, {
                  onSuccess: () => {
                    toast.success(request.kind === "add" ? "Added to your Career Story" : "Saved");
                    setTarget(null);
                  },
                  onError: failed,
                })
              }
              onCancel={() => setTarget(null)}
            />
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={mergeKey !== null} onOpenChange={(open) => !open && setMergeKey(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
          {mergeKey && (
            <MergeForm
              key={mergeKey}
              profile={profile}
              skillKey={mergeKey}
              pending={change.isPending}
              onSubmit={(mergedKeys) =>
                change.mutate(
                  { kind: "merge", section: "skill", targetKey: mergeKey, mergedKeys },
                  {
                    onSuccess: () => {
                      toast.success("Merged");
                      setMergeKey(null);
                    },
                    onError: failed,
                  },
                )
              }
              onCancel={() => setMergeKey(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </EditorContext.Provider>
  );
}

// --- Dialogs -----------------------------------------------------------------

function ItemForm({
  target,
  profile,
  pending,
  onSubmit,
  onCancel,
}: {
  target: EditorTarget;
  profile: CareerProfile;
  pending: boolean;
  onSubmit: (request: ProfileChangeRequest) => void;
  onCancel: () => void;
}) {
  const { section, item } = target;
  const form = FORMS[section];
  const initial = useMemo(
    () => ({ ...toFormValues(section, item), ...(target.defaults ?? {}) }),
    [section, item, target.defaults],
  );
  const [values, setValues] = useState<FormValues>(initial);
  const set = (name: string, value: unknown) => setValues((v) => ({ ...v, [name]: value }));

  const missing = form.fields.some((f) => f.required && !String(values[f.name] ?? "").trim());
  const fields = fromFormValues(section, values);
  const before = fromFormValues(section, initial);
  const changed = Object.fromEntries(Object.entries(fields).filter(([k, v]) => !sameField(v, before[k])));
  const canSave = !missing && (!item || Object.keys(changed).length > 0);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    if (item) onSubmit({ kind: "edit", section, targetKey: item.key, fields: changed });
    else onSubmit({ kind: "add", section, fields });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <DialogHeader>
        <DialogTitle>{item ? `Edit ${form.noun}` : `Add ${form.noun === "education" ? "education" : `a ${form.noun}`}`}</DialogTitle>
        <DialogDescription>
          {item
            ? "Your changes are kept when your Career Story is rebuilt. Your documents aren't changed."
            : "Added items are marked as yours, and kept when your Career Story is rebuilt."}
        </DialogDescription>
      </DialogHeader>
      {form.fields.map((f, i) => (
        <FormField
          key={f.name}
          field={f}
          values={values}
          set={set}
          profile={profile}
          autoFocus={i === 0}
          id={`profile-${section}-${f.name}`}
        />
      ))}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={!canSave || pending}>
          {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {item ? "Save" : "Add"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function FormField({
  field: f,
  values,
  set,
  profile,
  autoFocus,
  id,
}: {
  field: FieldConfig;
  values: FormValues;
  set: (name: string, value: unknown) => void;
  profile: CareerProfile;
  autoFocus: boolean;
  id: string;
}) {
  const value = values[f.name];
  const label = (
    <Label htmlFor={id}>
      {f.label}
      {!f.required && f.type !== "category" && f.type !== "positions" && (
        <span className="font-normal text-muted-foreground"> (optional)</span>
      )}
    </Label>
  );
  const hint = f.hint && <p className="text-xs text-muted-foreground">{f.hint}</p>;

  switch (f.type) {
    case "textarea":
      return (
        <div className="space-y-2">
          {label}
          <Textarea id={id} value={String(value)} placeholder={f.placeholder} autoFocus={autoFocus} rows={3} onChange={(e) => set(f.name, e.target.value)} />
        </div>
      );
    case "end": {
      const current = Boolean(values[`${f.name}:current`]);
      return (
        <div className="space-y-2">
          {label}
          <Input id={id} value={String(value)} placeholder={f.placeholder} disabled={current} onChange={(e) => set(f.name, e.target.value)} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4 accent-primary" checked={current} onChange={(e) => set(`${f.name}:current`, e.target.checked)} />
            I work here now
          </label>
          {hint}
        </div>
      );
    }
    case "category":
    case "level":
    case "position": {
      const options =
        f.type === "category"
          ? CATEGORY_OPTIONS
          : f.type === "level"
            ? [{ value: NONE, label: "Not stated" }, ...LEVEL_OPTIONS]
            : [
                { value: NONE, label: "Not tied to a job" },
                ...profile.positions.map((p) => ({ value: p.key, label: `${p.title} at ${p.employer}` })),
              ];
      return (
        <div className="space-y-2">
          {label}
          <Select value={String(value)} onValueChange={(v) => set(f.name, v)}>
            <SelectTrigger id={id} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {options.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {hint}
        </div>
      );
    }
    case "positions": {
      const selected = new Set(value as string[]);
      return (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{f.label}</legend>
          {profile.positions.length === 0 ? (
            <p className="text-xs text-muted-foreground">No jobs in your Career Story yet.</p>
          ) : (
            <div className="flex max-h-48 flex-col gap-1.5 overflow-y-auto">
              {profile.positions.map((p) => (
                <label key={p.key} className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-4 shrink-0 accent-primary"
                    checked={selected.has(p.key)}
                    onChange={(e) => {
                      const next = new Set(selected);
                      if (e.target.checked) next.add(p.key);
                      else next.delete(p.key);
                      set(f.name, [...next]);
                    }}
                  />
                  <span>
                    {p.title} at {p.employer}
                  </span>
                </label>
              ))}
            </div>
          )}
          {hint}
        </fieldset>
      );
    }
    default:
      return (
        <div className="space-y-2">
          {label}
          <Input
            id={id}
            value={String(value)}
            placeholder={f.placeholder}
            autoFocus={autoFocus}
            inputMode={f.type === "years" ? "decimal" : undefined}
            maxLength={200}
            onChange={(e) => set(f.name, e.target.value)}
          />
          {hint}
        </div>
      );
  }
}

function MergeForm({
  profile,
  skillKey,
  pending,
  onSubmit,
  onCancel,
}: {
  profile: CareerProfile;
  skillKey: string;
  pending: boolean;
  onSubmit: (mergedKeys: string[]) => void;
  onCancel: () => void;
}) {
  const target = profile.skills.find((s) => s.key === skillKey);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  if (!target) return null;

  const others = profile.skills
    .filter((s) => s.key !== skillKey)
    .filter((s) => !query || s.name.toLowerCase().includes(query.toLowerCase()))
    // Same kind first: they're the likeliest duplicates.
    .sort((a, b) => Number(b.category === target.category) - Number(a.category === target.category));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (selected.size) onSubmit([...selected]);
      }}
      className="space-y-4"
    >
      <DialogHeader>
        <DialogTitle>Merge into {target.name}</DialogTitle>
        <DialogDescription>
          Pick skills that mean the same thing. They&apos;ll show as one, with their names kept as other
          spellings and their years combined.
        </DialogDescription>
      </DialogHeader>
      <Input placeholder="Search your skills" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
      <div className="flex max-h-64 flex-col gap-1.5 overflow-y-auto">
        {others.map((s) => (
          <label key={s.key} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={selected.has(s.key)}
              onChange={(e) => {
                const next = new Set(selected);
                if (e.target.checked) next.add(s.key);
                else next.delete(s.key);
                setSelected(next);
              }}
            />
            {s.name}
          </label>
        ))}
        {others.length === 0 && <p className="text-sm text-muted-foreground">No matching skills.</p>}
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={selected.size === 0 || pending}>
          {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Merge {selected.size > 0 && selected.size}
        </Button>
      </DialogFooter>
    </form>
  );
}

// --- Pieces used by the sections --------------------------------------------

/** Edit, remove and more, for one item. Shown on hover or focus, and always on touch screens. */
export function ItemActions({
  section,
  item,
  className,
  alwaysVisible = false,
}: {
  section: ProfileSection;
  item: Item;
  className?: string;
  /** For places without hover, such as inside a popover. */
  alwaysVisible?: boolean;
}) {
  const editor = useEditor();
  const edit = editor.editOf(section, item.key);
  const merge = section === "skill" ? editor.profile.user.merges.find((m) => m.key === item.key) : undefined;
  const label = String(item.title ?? item.name ?? item.school ?? item.language ?? "this item");

  return (
    <div
      className={cn(
        "flex shrink-0 items-center gap-0.5",
        !alwaysVisible &&
          "opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100",
        className,
      )}
    >
      <Button variant="ghost" size="icon" className="size-7" aria-label={`Edit ${label}`} onClick={() => editor.edit(section, item)}>
        <Pencil className="size-3.5" />
      </Button>
      {section !== "summary" && (
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label={`Remove ${label}`}
          disabled={editor.busy}
          onClick={() => editor.remove(section, item)}
        >
          <Trash2 className="size-3.5" />
        </Button>
      )}
      {(section === "skill" || edit) && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-7" aria-label={`More for ${label}`}>
              <MoreHorizontal className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {section === "skill" && (
              <DropdownMenuItem onSelect={() => editor.merge(item.key)}>
                <Combine /> Merge with…
              </DropdownMenuItem>
            )}
            {merge && (
              <DropdownMenuItem onSelect={() => editor.undo(merge.changeId, "Split back into separate skills")}>
                <Split /> Undo merge ({merge.mergedNames.join(", ")})
              </DropdownMenuItem>
            )}
            {edit && (
              <DropdownMenuItem onSelect={() => editor.undo(edit.changeId, "Back to what your documents say")}>
                <RotateCcw /> Reset to what my documents say
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

const FIELD_LABELS: Record<string, string> = {
  title: "Title",
  employer: "Employer",
  location: "Location",
  start: "Start",
  end: "End",
  headline: "Headline",
  name: "Name",
  category: "Kind",
  positionKeys: "Jobs where you used it",
  extraMonths: "Experience outside your jobs",
  text: "Text",
  positionKey: "Where it happened",
  school: "School",
  degree: "Degree",
  field: "Field of study",
  issuer: "Issued by",
  issued: "Issued",
  expires: "Expires",
  language: "Language",
  level: "Level",
};

/** How a field's value reads, e.g. for "Your documents say: …". */
function describeValue(profile: CareerProfile, field: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "nothing";
  if (field === "positionKeys" && Array.isArray(value)) {
    const titles = value.map((k) => profile.positions.find((p) => p.key === k)?.title).filter(Boolean);
    return titles.length ? titles.join(", ") : `${value.length} jobs`;
  }
  if (field === "positionKey") {
    const p = profile.positions.find((x) => x.key === value);
    return p ? `${p.title} at ${p.employer}` : "a job";
  }
  if (field === "extraMonths" && typeof value === "number") return value ? `${Math.round((value / 12) * 10) / 10} years` : "nothing";
  if (field === "category") return CATEGORY_OPTIONS.find((o) => o.value === value)?.label ?? String(value);
  if (field === "level") return LEVEL_OPTIONS.find((o) => o.value === value)?.label ?? String(value);
  if (["start", "end", "issued", "expires"].includes(field)) return formatProfileDate(String(value)) ?? String(value);
  return String(value);
}

/** "Edited" and "Added by you" markers for one item. */
export function ChangeMarkers({ section, itemKey }: { section: ProfileSection; itemKey: string }) {
  const editor = useEditor();
  const edit = editor.editOf(section, itemKey);
  const added = editor.isAdded(section, itemKey);
  if (!edit && !added) return null;

  return (
    <span className="inline-flex items-center gap-2">
      {added && (
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <UserRound className="size-3" aria-hidden />
          Added by you
        </span>
      )}
      {edit && (
        <Popover>
          <PopoverTrigger className="inline-flex items-center gap-1 rounded-sm text-xs text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
            <Pencil className="size-3" aria-hidden />
            Edited
          </PopoverTrigger>
          <PopoverContent align="start" className="flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-3 p-3">
            <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              What your documents say
            </p>
            <ul className="flex flex-col gap-2">
              {Object.entries(edit.fields).map(([field, { documents }]) => (
                <li key={field} className="flex items-start justify-between gap-3 text-xs">
                  <span>
                    <span className="font-medium">{FIELD_LABELS[field] ?? field}:</span>{" "}
                    <span className="text-muted-foreground">{describeValue(editor.profile, field, documents)}</span>
                  </span>
                  <button
                    type="button"
                    className="shrink-0 font-medium text-muted-foreground hover:text-foreground"
                    disabled={editor.busy}
                    onClick={() => editor.resolve(edit.changeId, { action: "reset_field", field }, "Back to what your documents say")}
                  >
                    Reset
                  </button>
                </li>
              ))}
            </ul>
          </PopoverContent>
        </Popover>
      )}
    </span>
  );
}

/** "+ Add" for a section. */
export function AddButton({
  section,
  label,
  defaults,
}: {
  section: ProfileSection;
  label: string;
  defaults?: Record<string, unknown>;
}) {
  const editor = useEditor();
  return (
    <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs text-muted-foreground" onClick={() => editor.add(section, defaults)}>
      <Plus className="size-3.5" /> {label}
    </Button>
  );
}

/** "Show removed (N)", with a way to restore each item. */
export function RemovedItems({ sections, noun }: { sections: ProfileSection[]; noun: string }) {
  const editor = useEditor();
  const [open, setOpen] = useState(false);
  const removed = editor.profile.user.removed.filter((r) => sections.includes(r.section));
  if (removed.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-fit text-xs font-medium text-muted-foreground hover:text-foreground"
        aria-expanded={open}
      >
        {open ? "Hide removed" : `Show removed ${noun} (${removed.length})`}
      </button>
      {open && (
        <ul className="flex flex-col gap-1.5 rounded-md bg-muted/50 p-3">
          {removed.map((r) => (
            <li key={r.changeId} className="flex items-center justify-between gap-3 text-sm">
              <span className="text-muted-foreground line-through decoration-muted-foreground/50">{r.label}</span>
              <button
                type="button"
                className="shrink-0 text-xs font-medium hover:underline"
                disabled={editor.busy}
                onClick={() => editor.undo(r.changeId, "Restored")}
              >
                Restore
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Changes to look at again after a rebuild. Nothing changes until the user picks. */
export function ReviewBanner() {
  const editor = useEditor();
  const { reviews } = editor.profile.user;
  if (reviews.length === 0) return null;

  return (
    <Alert>
      <AlertCircle />
      <AlertTitle>
        {reviews.length === 1 ? "1 change needs a look" : `${reviews.length} changes need a look`}
      </AlertTitle>
      <AlertDescription>
        <p>Your documents changed since you edited these. Your version is shown until you pick.</p>
        <ul className="mt-3 flex w-full flex-col gap-3">
          {reviews.map((r) => (
            <li key={`${r.changeId}:${r.field}`} className="flex flex-col gap-2 rounded-md border bg-background p-3 text-foreground">
              {r.kind === "documents_changed" && r.field ? (
                <>
                  <p className="text-sm">
                    <span className="font-medium">{r.label}</span>{" "}
                    <span className="text-muted-foreground">· {FIELD_LABELS[r.field] ?? r.field}</span>
                  </p>
                  <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
                    <dt className="text-muted-foreground">Yours</dt>
                    <dd>{describeValue(editor.profile, r.field, r.yours)}</dd>
                    <dt className="text-muted-foreground">Documents</dt>
                    <dd>{describeValue(editor.profile, r.field, r.documents)}</dd>
                  </dl>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" disabled={editor.busy} onClick={() => editor.resolve(r.changeId, { action: "keep_mine", field: r.field! })}>
                      Keep mine
                    </Button>
                    <Button size="sm" variant="outline" disabled={editor.busy} onClick={() => editor.resolve(r.changeId, { action: "reset_field", field: r.field! })}>
                      Use the documents&apos;
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm">
                    <span className="font-medium">{r.label}</span>{" "}
                    <span className="text-muted-foreground">is no longer in any of your documents.</span>
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" disabled={editor.busy} onClick={() => editor.resolve(r.changeId, { action: "keep_item" }, "Kept as your own")}>
                      Keep it
                    </Button>
                    <Button size="sm" variant="outline" disabled={editor.busy} onClick={() => editor.undo(r.changeId, "Removed")}>
                      Remove it
                    </Button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}
