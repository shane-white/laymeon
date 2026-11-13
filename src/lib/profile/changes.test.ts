import { describe, expect, it } from "vitest";
import { buildProfile, type ExtractedDocument } from "./build";
import { applyUserChanges, parseChangeFields, userItemKey, type ProfileChange } from "./changes";
import { recomputeDerived } from "./derive";
import type { CareerProfile, Extraction } from "./schema";

const BUILT_AT = "2026-11-13T00:00:00Z";

type Position = Extraction["positions"][number];
const position = (p: Partial<Position>): Position => ({
  employer: "",
  title: "",
  titleFamily: "",
  location: "",
  employmentType: "unknown",
  start: "",
  end: "",
  peopleManaged: 0,
  achievements: [],
  skills: [],
  evidence: "",
  ...p,
});

const skill = (name: string, category: Extraction["skills"][number]["category"] = "tool") => ({
  name,
  canonicalName: name,
  category,
  evidence: name,
});

const MARKDOWN = `**Senior Data Engineer** — Northwind Logistics
- Cut warehouse costs 30% by clustering Snowflake tables
**Data Engineer** — Brightside Health
- Developed ETL jobs in Python
Skills: Python, Snowflake, PostgreSQL, Postgres, Airflow
B.S. Computer Science, University of Illinois
Spanish (fluent)`;

/** A résumé; `northwind` overrides the first job, to simulate a later version of the résumé. */
function resume(northwind: Partial<Position> = {}, extraSkills: ReturnType<typeof skill>[] = []): ExtractedDocument {
  return {
    document: { id: "r", name: "Résumé.pdf", type: "resume", markdown: `${MARKDOWN}\n${extraSkills.map((s) => s.name).join(", ")}`, asOf: "2026-11-01T00:00:00Z", targetRole: null },
    extraction: {
      headline: "Data engineer",
      seniority: "senior",
      positions: [
        position({
          employer: "Northwind Logistics",
          title: "Senior Data Engineer",
          titleFamily: "Data Engineer",
          start: "2021-03",
          end: "present",
          skills: ["Snowflake", "Airflow"],
          evidence: "Senior Data Engineer** — Northwind Logistics",
          achievements: [
            {
              text: "Cut warehouse costs 30% by clustering Snowflake tables",
              metric: "30% lower costs",
              evidence: "Cut warehouse costs 30% by clustering Snowflake tables",
            },
          ],
          ...northwind,
        }),
        position({
          employer: "Brightside Health",
          title: "Data Engineer",
          titleFamily: "Data Engineer",
          start: "2018",
          end: "2021",
          skills: ["Python", "PostgreSQL"],
          evidence: "Data Engineer** — Brightside Health",
          achievements: [
            { text: "Developed ETL jobs in Python", metric: "", evidence: "Developed ETL jobs in Python" },
          ],
        }),
      ],
      skills: [
        skill("Python", "hard_skill"),
        skill("Snowflake"),
        skill("PostgreSQL"),
        skill("Postgres"),
        skill("Airflow"),
        ...extraSkills,
      ],
      education: [
        {
          school: "University of Illinois",
          degree: "B.S.",
          field: "Computer Science",
          start: "",
          end: "",
          evidence: "B.S. Computer Science, University of Illinois",
        },
      ],
      certifications: [],
      languages: [{ language: "Spanish", level: "fluent", evidence: "Spanish (fluent)" }],
    },
  };
}

const base = buildProfile([resume()], BUILT_AT);
const NORTHWIND = "northwind-logistics|data-engineer|2021";
const BRIGHTSIDE = "brightside-health|data-engineer|2018";

let nextId = 0;
function change(c: Partial<ProfileChange> & Pick<ProfileChange, "section" | "kind">): ProfileChange {
  return { id: `c${++nextId}`, targetKey: null, fields: null, baseSnapshot: null, mergedKeys: null, ...c };
}

/** An edit as the API records it: the snapshot is the item as it was in `from`. */
function edit(from: CareerProfile, section: "position" | "skill", key: string, fields: Record<string, unknown>): ProfileChange {
  const list = section === "position" ? from.positions : from.skills;
  const item = list.find((i) => i.key === key)!;
  return change({ section, kind: "edit", targetKey: key, fields, baseSnapshot: { ...item } });
}

const positionOf = (p: CareerProfile, key: string) => p.positions.find((x) => x.key === key);

describe("applying no changes", () => {
  it("leaves the built profile as it is", () => {
    expect(recomputeDerived(base)).toEqual(base);
    expect(applyUserChanges(base, []).profile).toEqual(base);
  });
});

describe("edits", () => {
  const titleEdit = edit(base, "position", NORTHWIND, { title: "Staff Data Engineer" });

  it("applies the user's value and records what the documents say", () => {
    const { profile } = applyUserChanges(base, [titleEdit]);
    expect(positionOf(profile, NORTHWIND)?.title).toBe("Staff Data Engineer");
    expect(profile.summary.currentTitle).toBe("Staff Data Engineer");
    expect(profile.user.edits).toEqual([
      { changeId: titleEdit.id, section: "position", key: NORTHWIND, fields: { title: { documents: "Senior Data Engineer" } } },
    ]);
    expect(profile.user.reviews).toEqual([]);
  });

  it("only changes the edited field; the others still follow the documents", () => {
    const rebuilt = buildProfile([resume({ location: "Chicago, IL" })], BUILT_AT);
    const { profile } = applyUserChanges(rebuilt, [titleEdit]);
    expect(positionOf(profile, NORTHWIND)).toMatchObject({ title: "Staff Data Engineer", location: "Chicago, IL" });
  });

  it("keeps the user's value but asks when the documents change underneath it", () => {
    const rebuilt = buildProfile([resume({ title: "Lead Data Engineer" })], BUILT_AT);
    const { profile } = applyUserChanges(rebuilt, [titleEdit]);
    expect(positionOf(profile, NORTHWIND)?.title).toBe("Staff Data Engineer");
    expect(profile.user.reviews).toEqual([
      {
        changeId: titleEdit.id,
        section: "position",
        key: NORTHWIND,
        label: "Lead Data Engineer at Northwind Logistics",
        kind: "documents_changed",
        field: "title",
        yours: "Staff Data Engineer",
        documents: "Lead Data Engineer",
      },
    ]);
  });

  it("doesn't ask when the documents now say what the user said", () => {
    const rebuilt = buildProfile([resume({ title: "Staff Data Engineer" })], BUILT_AT);
    expect(applyUserChanges(rebuilt, [titleEdit]).profile.user.reviews).toEqual([]);
  });

  it("finds the item again when its key changed, and reports the new key", () => {
    // The résumé now says the job started in 2020, so its key changed.
    const rebuilt = buildProfile([resume({ start: "2020-11" })], BUILT_AT);
    const { profile, retargets } = applyUserChanges(rebuilt, [titleEdit]);
    const newKey = "northwind-logistics|data-engineer|2020";
    expect(positionOf(profile, newKey)?.title).toBe("Staff Data Engineer");
    expect(retargets).toEqual([{ changeId: titleEdit.id, targetKey: newKey }]);
  });

  it("keeps an edited item no document has any more, and asks", () => {
    const rebuilt = buildProfile([resume({ employer: "Contoso", title: "Analyst", titleFamily: "Analyst", evidence: "" })], BUILT_AT);
    const { profile } = applyUserChanges(rebuilt, [titleEdit]);
    const kept = positionOf(profile, userItemKey(titleEdit.id));
    expect(kept).toMatchObject({ title: "Staff Data Engineer", employer: "Northwind Logistics", evidence: [] });
    expect(profile.user.reviews.map((r) => r.kind)).toEqual(["not_in_documents"]);
    expect(profile.user.added.map((a) => a.key)).toEqual([userItemKey(titleEdit.id)]);
  });

  it("recomputes years when dates change", () => {
    const { profile } = applyUserChanges(base, [edit(base, "position", BRIGHTSIDE, { start: "2016-01", end: "2021-02" })]);
    expect(positionOf(profile, BRIGHTSIDE)?.months).toBe(62);
    expect(profile.skills.find((s) => s.key === "python")?.months).toBe(62);
  });

  it("links a skill to more jobs", () => {
    const python = base.skills.find((s) => s.key === "python")!;
    const { profile } = applyUserChanges(base, [
      edit(base, "skill", "python", { positionKeys: [...python.positionKeys, NORTHWIND] }),
    ]);
    const updated = profile.skills.find((s) => s.key === "python")!;
    expect(updated.lastUsed).toBe("present");
    // Mid-2018 – Nov 2026.
    expect(updated.months).toBe(101);
    expect(positionOf(profile, NORTHWIND)?.skillKeys).toContain("python");
  });

  it("counts a job the user links, but not one only a project tied the skill to", () => {
    // As if only a project tied Snowflake to the Northwind job.
    const projectOnly: CareerProfile = {
      ...base,
      skills: base.skills.map((s) => (s.key === "snowflake" ? { ...s, yearsFromKeys: [] } : s)),
    };
    const derived = recomputeDerived(projectOnly);
    expect(derived.skills.find((s) => s.key === "snowflake")!.months).toBeNull();

    const { profile } = applyUserChanges(derived, [
      edit(derived, "skill", "snowflake", { positionKeys: [NORTHWIND, BRIGHTSIDE] }),
    ]);
    const snowflake = profile.skills.find((s) => s.key === "snowflake")!;
    expect(snowflake.yearsFromKeys).toEqual([BRIGHTSIDE]);
    expect(snowflake.months).toBe(36);
    expect(snowflake.lastUsed).toBe("present");
  });

  it("uses the years the user set instead of the job's, and keeps when it was last used", () => {
    // Snowflake is only on the Northwind job, but the user only used it for its last 2 years.
    const { profile } = applyUserChanges(base, [edit(base, "skill", "snowflake", { monthsOverride: 24 })]);
    const snowflake = profile.skills.find((s) => s.key === "snowflake")!;
    expect(snowflake.months).toBe(24);
    expect(snowflake.lastUsed).toBe("present");
    expect(base.skills.find((s) => s.key === "snowflake")!.months).toBe(69);
  });

  it("goes back to counting from jobs when the user's years are cleared", () => {
    const { profile } = applyUserChanges(base, [edit(base, "skill", "snowflake", { monthsOverride: null })]);
    expect(profile.skills.find((s) => s.key === "snowflake")!.months).toBe(69);
  });

  it("edits the headline", () => {
    const headline = change({ section: "summary", kind: "edit", targetKey: "summary", fields: { headline: "Builds data platforms" }, baseSnapshot: { ...base.summary } });
    expect(applyUserChanges(base, [headline]).profile.summary.headline).toBe("Builds data platforms");
  });
});

describe("removals", () => {
  const removeBrightside = change({ section: "position", kind: "hide", targetKey: BRIGHTSIDE, baseSnapshot: { ...positionOf(base, BRIGHTSIDE)! } });

  it("removes the item, its accomplishments and its years, and lists it for restoring", () => {
    const { profile } = applyUserChanges(base, [removeBrightside]);
    expect(positionOf(profile, BRIGHTSIDE)).toBeUndefined();
    expect(profile.accomplishments.some((a) => a.positionKey === BRIGHTSIDE)).toBe(false);
    expect(profile.skills.find((s) => s.key === "python")?.months).toBeNull();
    expect(profile.user.removed).toEqual([
      { changeId: removeBrightside.id, section: "position", key: BRIGHTSIDE, label: "Data Engineer at Brightside Health" },
    ]);
  });

  it("keeps the item removed after every rebuild", () => {
    const rebuilt = buildProfile([resume({ location: "Chicago" })], BUILT_AT);
    expect(positionOf(applyUserChanges(rebuilt, [removeBrightside]).profile, BRIGHTSIDE)).toBeUndefined();
  });

  it("does nothing while the item isn't in any document", () => {
    const empty = buildProfile([], BUILT_AT);
    const { profile } = applyUserChanges(empty, [removeBrightside]);
    expect(profile.user.removed).toEqual([]);
  });

  it("wins over an edit of the same item", () => {
    const { profile } = applyUserChanges(base, [edit(base, "position", BRIGHTSIDE, { title: "X" }), removeBrightside]);
    expect(positionOf(profile, BRIGHTSIDE)).toBeUndefined();
    expect(profile.user.edits).toEqual([]);
  });
});

describe("additions", () => {
  it("adds an item marked as the user's own", () => {
    const add = change({ section: "skill", kind: "add", fields: { name: "dbt", category: "tool" } });
    const { profile } = applyUserChanges(base, [add]);
    expect(profile.skills.find((s) => s.key === userItemKey(add.id))).toMatchObject({ name: "dbt", evidence: [], months: null });
    expect(profile.user.added).toEqual([{ changeId: add.id, section: "skill", key: userItemKey(add.id) }]);
  });

  it("shows it once when a document now says the same thing, with the document's evidence", () => {
    const add = change({ section: "skill", kind: "add", fields: { name: "Kubernetes", category: "hard_skill" } });
    const rebuilt = buildProfile([resume({}, [skill("Kubernetes")])], BUILT_AT);
    const { profile } = applyUserChanges(rebuilt, [add]);
    const k8s = profile.skills.filter((s) => s.name === "Kubernetes");
    expect(k8s).toHaveLength(1);
    expect(k8s[0]).toMatchObject({ key: "kubernetes", category: "hard_skill" });
    expect(k8s[0].evidence).toHaveLength(1);
    expect(profile.user.added).toEqual([{ changeId: add.id, section: "skill", key: "kubernetes" }]);
  });

  it("counts an added job's dates", () => {
    const add = change({ section: "position", kind: "add", fields: { employer: "Globex", title: "Analyst", start: "2016-01", end: "2016-12" } });
    const { profile } = applyUserChanges(base, [add]);
    expect(positionOf(profile, userItemKey(add.id))?.months).toBe(12);
    expect(profile.summary.totalMonths).toBe((base.summary.totalMonths ?? 0) + 12);
  });
});

describe("merges", () => {
  const merge = change({ section: "skill", kind: "merge", targetKey: "postgresql", mergedKeys: ["postgres"] });

  it("folds one skill into another and keeps its name as an alias", () => {
    const { profile } = applyUserChanges(base, [merge]);
    expect(profile.skills.find((s) => s.key === "postgres")).toBeUndefined();
    const postgres = profile.skills.find((s) => s.key === "postgresql")!;
    expect(postgres.aliases).toContain("Postgres");
    expect(postgres.evidence).toHaveLength(2);
    expect(profile.user.merges).toEqual([{ changeId: merge.id, key: "postgresql", mergedNames: ["Postgres"] }]);
  });

  it("is re-applied after a rebuild", () => {
    const rebuilt = buildProfile([resume({ location: "Remote" })], BUILT_AT);
    expect(applyUserChanges(rebuilt, [merge]).profile.skills.some((s) => s.key === "postgres")).toBe(false);
  });
});

describe("parseChangeFields", () => {
  it("cleans values", () => {
    expect(parseChangeFields("position", "edit", { location: "", end: "Present", start: "2021-3" })).toEqual({
      ok: true,
      fields: { location: null, end: "present", start: "2021-03" },
    });
  });

  it("rejects unknown fields, bad dates and missing required fields", () => {
    expect(parseChangeFields("position", "edit", { evidence: [] }).ok).toBe(false);
    expect(parseChangeFields("position", "edit", { start: "March 2021" }).ok).toBe(false);
    expect(parseChangeFields("position", "add", { title: "Analyst" }).ok).toBe(false);
    expect(parseChangeFields("summary", "add", { headline: "Hi" }).ok).toBe(false);
    expect(parseChangeFields("skill", "edit", {}).ok).toBe(false);
  });
});
