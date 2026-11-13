"use client";

import { useState, type ReactNode } from "react";
import { TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  describeSkillUse,
  formatDateRange,
  formatDuration,
  formatProfileDate,
  SKILL_GROUPS,
  skillsIn,
} from "@/lib/profile/format";
import type { CareerProfile } from "@/lib/profile/schema";
import { AddButton, ChangeMarkers, ItemActions, RemovedItems, useEditor } from "./editor";
import { EvidencePopover } from "./evidence-popover";

type Profile = CareerProfile;
type Skill = Profile["skills"][number];

const EMPLOYMENT_LABELS: Partial<Record<NonNullable<Profile["positions"][number]["employmentType"]>, string>> = {
  part_time: "Part-time",
  contract: "Contract",
  freelance: "Freelance",
  internship: "Internship",
  volunteer: "Volunteer",
};

const LANGUAGE_LEVELS: Record<NonNullable<Profile["languages"][number]["level"]>, string> = {
  native: "Native",
  fluent: "Fluent",
  professional: "Professional",
  conversational: "Conversational",
  basic: "Basic",
};

export function Section({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  /** Shown beside the title, e.g. "+ Add". */
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-1">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

/** Shows the first `limit` items, with a button for the rest. */
function ShowMore<T>({
  items,
  limit,
  render,
  className,
  noun,
}: {
  items: T[];
  limit: number;
  render: (item: T) => ReactNode;
  className?: string;
  noun: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? items : items.slice(0, limit);
  const hidden = items.length - shown.length;
  return (
    <>
      <div className={className}>{shown.map(render)}</div>
      {items.length > limit && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="w-fit text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          {expanded ? "Show fewer" : `Show ${hidden} more ${noun}`}
        </button>
      )}
    </>
  );
}

/** Evidence and change markers under an item. */
function ItemMeta({ section, itemKey, evidence, profile, children }: {
  section: Parameters<typeof ChangeMarkers>[0]["section"];
  itemKey: string;
  evidence: Profile["skills"][number]["evidence"];
  profile: Profile;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {children}
      <EvidencePopover evidence={evidence} sources={profile.sources} className="w-fit" />
      <ChangeMarkers section={section} itemKey={itemKey} />
    </div>
  );
}

function SkillDetails({ skill, profile }: { skill: Skill; profile: Profile }) {
  const used = profile.positions.filter((p) => skill.positionKeys.includes(p.key));
  const duration = formatDuration(skill.months);
  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="pt-1 font-medium">{skill.name}</p>
        <ItemActions section="skill" item={skill} alwaysVisible className="-mr-1" />
      </div>
      {skill.aliases.length > 0 && (
        <p className="text-xs text-muted-foreground">Also written as {skill.aliases.join(", ")}</p>
      )}
      {(duration || skill.lastUsed) && (
        <p className="text-xs">
          {duration && <>{duration} of experience</>}
          {duration && skill.lastUsed && " · "}
          {skill.lastUsed === "present"
            ? "using it now"
            : skill.lastUsed && `last used ${formatProfileDate(skill.lastUsed)}`}
        </p>
      )}
      {used.length > 0 && (
        <ul className="flex flex-col gap-0.5 text-xs text-muted-foreground">
          {used.map((p) => (
            <li key={p.key}>
              {p.title} at {p.employer}
            </li>
          ))}
        </ul>
      )}
      {skill.monthsOverride !== null && (
        <p className="text-xs text-muted-foreground">You set the years for this skill.</p>
      )}
      {used.length === 0 && !duration && (
        <p className="text-xs text-muted-foreground">
          Not tied to a job with dates, so there&apos;s no length of experience yet. Edit it to link
          it to a job.
        </p>
      )}
      <ChangeMarkers section="skill" itemKey={skill.key} />
    </div>
  );
}

/** A skill as a quiet chip. Its details, actions and evidence open in a popover. */
export function SkillChip({ skill, profile }: { skill: Skill; profile: Profile }) {
  const editor = useEditor();
  const use = describeSkillUse(skill);
  const changed = Boolean(editor.editOf("skill", skill.key)) || editor.isAdded("skill", skill.key);
  return (
    <EvidencePopover
      evidence={skill.evidence}
      sources={profile.sources}
      details={<SkillDetails skill={skill} profile={profile} />}
      label={`${skill.name}: details and sources`}
      className="inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-left text-xs transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none data-[state=open]:bg-accent"
    >
      <span className="truncate font-medium">{skill.name}</span>
      {use && <span className="shrink-0 text-muted-foreground">{use}</span>}
      {changed && (
        <span className="size-1.5 shrink-0 rounded-full bg-primary" aria-label="Changed by you" />
      )}
    </EvidencePopover>
  );
}

function SkillList({ skills, profile }: { skills: Skill[]; profile: Profile }) {
  return (
    <ShowMore
      items={skills}
      limit={18}
      noun={skills.length - 18 === 1 ? "skill" : "skills"}
      className="flex flex-wrap gap-2"
      render={(skill) => <SkillChip key={skill.key} skill={skill} profile={profile} />}
    />
  );
}

export function WorkHistory({ profile }: { profile: Profile }) {
  const skillNames = new Map(profile.skills.map((s) => [s.key, s.name]));

  return (
    <Section title="Where you've worked" actions={<AddButton section="position" label="Add a job" />}>
      {profile.positions.length === 0 ? (
        <Empty>No jobs yet.</Empty>
      ) : (
        <ol className="ml-1 flex flex-col gap-6 border-l pl-5">
          {profile.positions.map((p) => {
            const range = formatDateRange(p.start, p.end);
            const duration = formatDuration(p.months);
            const type = p.employmentType ? EMPLOYMENT_LABELS[p.employmentType] : undefined;
            const skills = p.skillKeys.map((k) => skillNames.get(k)).filter(Boolean);
            return (
              <li key={p.key} className="group relative flex flex-col gap-1.5">
                <span
                  aria-hidden
                  className={cn(
                    "absolute top-1.5 -left-[24.5px] size-2 rounded-full ring-4 ring-background",
                    p.isCurrent ? "bg-primary" : "bg-muted-foreground/50",
                  )}
                />
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-0.5">
                  <div className="min-w-0">
                    <h3 className="text-sm font-medium">{p.title}</h3>
                    <p className="text-sm text-muted-foreground">
                      {p.employer}
                      {p.location && ` · ${p.location}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {(range || duration) && (
                      <p className="text-xs whitespace-nowrap text-muted-foreground">
                        {[range, duration].filter(Boolean).join(" · ")}
                      </p>
                    )}
                    <ItemActions section="position" item={p} />
                  </div>
                </div>
                {(type || p.peopleManaged) && (
                  <p className="text-xs text-muted-foreground">
                    {[type, p.peopleManaged && `Managed ${p.peopleManaged} ${p.peopleManaged === 1 ? "person" : "people"}`]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}
                {skills.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {skills.slice(0, 8).join(" · ")}
                    {skills.length > 8 && ` · +${skills.length - 8} more`}
                  </p>
                )}
                <ItemMeta section="position" itemKey={p.key} evidence={p.evidence} profile={profile} />
              </li>
            );
          })}
        </ol>
      )}
      <RemovedItems sections={["position"]} noun="jobs" />
    </Section>
  );
}

export function TimeInRoles({ profile }: { profile: Profile }) {
  const roles = profile.roles.filter((r) => r.months);
  if (roles.length === 0) return null;
  return (
    <Section title="Time in each role" description="Overlapping jobs are only counted once.">
      <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-2 text-sm sm:max-w-md">
        {roles.map((r) => (
          <div key={r.key} className="contents">
            <dt>{r.titleFamily}</dt>
            <dd className="text-right text-muted-foreground">{formatDuration(r.months)}</dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}

export function Strengths({ profile }: { profile: Profile }) {
  const groups = SKILL_GROUPS.map((g) => ({ ...g, skills: skillsIn(profile, g.category) })).filter(
    (g) => g.skills.length > 0,
  );
  return (
    <Section
      title="What you're good at"
      description="Years come from the dates of the jobs where you used each one. Select a skill to see or change its details."
      actions={<AddButton section="skill" label="Add a skill" />}
    >
      {groups.length === 0 && <Empty>No skills yet.</Empty>}
      {groups.map((g) => (
        <div key={g.category} className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">{g.title}</h3>
          <SkillList skills={g.skills} profile={profile} />
        </div>
      ))}
    </Section>
  );
}

export function Tools({ profile }: { profile: Profile }) {
  const tools = skillsIn(profile, "tool");
  return (
    <Section
      title="Tools you use"
      actions={<AddButton section="skill" label="Add a tool" defaults={{ category: "tool" }} />}
    >
      {tools.length === 0 ? <Empty>No tools yet.</Empty> : <SkillList skills={tools} profile={profile} />}
      <RemovedItems sections={["skill"]} noun="skills and tools" />
    </Section>
  );
}

export function Accomplishments({ profile }: { profile: Profile }) {
  // Measurable results first, so the strongest show before "Show more". Stable otherwise.
  const withResultsFirst = (items: Profile["accomplishments"]) =>
    [...items].sort((a, b) => Number(Boolean(b.metric)) - Number(Boolean(a.metric)));

  const groups: { key: string; positionKey: string | null; title: string; items: Profile["accomplishments"] }[] = [];
  for (const position of profile.positions) {
    const items = profile.accomplishments.filter((a) => a.positionKey === position.key);
    if (items.length) {
      groups.push({
        key: position.key,
        positionKey: position.key,
        title: `${position.title} at ${position.employer}`,
        items: withResultsFirst(items),
      });
    }
  }
  const other = profile.accomplishments.filter(
    (a) => !a.positionKey || !profile.positions.some((p) => p.key === a.positionKey),
  );
  if (other.length) groups.push({ key: "other", positionKey: null, title: "Other work", items: withResultsFirst(other) });

  return (
    <Section
      title="Things you're proud of"
      actions={<AddButton section="accomplishment" label="Add an accomplishment" />}
    >
      {groups.length === 0 && <Empty>No accomplishments yet.</Empty>}
      {groups.map((g) => (
        <div key={g.key} className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-medium">{g.title}</h3>
            {g.positionKey && (
              <AddButton section="accomplishment" label="Add" defaults={{ positionKey: g.positionKey }} />
            )}
          </div>
          <ShowMore
            items={g.items}
            limit={4}
            noun={g.items.length - 4 === 1 ? "accomplishment" : "accomplishments"}
            className="flex flex-col gap-3"
            render={(a) => (
              <div key={a.key} className="group flex gap-2">
                {/* Measurable results are marked, not repeated: the metric is already in the text. */}
                {a.metric ? (
                  <TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-label="Measurable result" />
                ) : (
                  <span className="w-4 shrink-0" aria-hidden />
                )}
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <p className="text-sm">{a.text}</p>
                  <ItemMeta section="accomplishment" itemKey={a.key} evidence={a.evidence} profile={profile} />
                </div>
                <ItemActions section="accomplishment" item={a} />
              </div>
            )}
          />
        </div>
      ))}
      <RemovedItems sections={["accomplishment"]} noun="accomplishments" />
    </Section>
  );
}

export function Education({ profile }: { profile: Profile }) {
  const { education, certifications } = profile;
  return (
    <Section
      title="Education and certifications"
      actions={
        <>
          <AddButton section="education" label="Add education" />
          <AddButton section="certification" label="Add a certification" />
        </>
      }
    >
      {education.length === 0 && certifications.length === 0 && <Empty>Nothing here yet.</Empty>}
      <ul className="flex flex-col gap-4">
        {education.map((e) => (
          <li key={e.key} className="group flex items-start justify-between gap-2">
            <div className="flex flex-col gap-0.5">
              <p className="text-sm font-medium">{e.school}</p>
              {(e.degree || e.field) && (
                <p className="text-sm text-muted-foreground">{[e.degree, e.field].filter(Boolean).join(", ")}</p>
              )}
              <ItemMeta section="education" itemKey={e.key} evidence={e.evidence} profile={profile}>
                {formatDateRange(e.start, e.end) && (
                  <span className="text-xs text-muted-foreground">{formatDateRange(e.start, e.end)}</span>
                )}
              </ItemMeta>
            </div>
            <ItemActions section="education" item={e} />
          </li>
        ))}
        {certifications.map((c) => {
          const dates = [
            c.issued && `Issued ${formatProfileDate(c.issued)}`,
            c.expires && `expires ${formatProfileDate(c.expires)}`,
          ].filter(Boolean);
          return (
            <li key={c.key} className="group flex items-start justify-between gap-2">
              <div className="flex flex-col gap-0.5">
                <p className="text-sm font-medium">{c.name}</p>
                {c.issuer && <p className="text-sm text-muted-foreground">{c.issuer}</p>}
                <ItemMeta section="certification" itemKey={c.key} evidence={c.evidence} profile={profile}>
                  {dates.length > 0 && <span className="text-xs text-muted-foreground">{dates.join(", ")}</span>}
                </ItemMeta>
              </div>
              <ItemActions section="certification" item={c} />
            </li>
          );
        })}
      </ul>
      <RemovedItems sections={["education", "certification"]} noun="education and certifications" />
    </Section>
  );
}

export function Languages({ profile }: { profile: Profile }) {
  return (
    <Section title="Languages" actions={<AddButton section="language" label="Add a language" />}>
      {profile.languages.length === 0 && <Empty>No languages yet.</Empty>}
      <ul className="flex flex-col gap-2">
        {profile.languages.map((l) => (
          <li key={l.key} className="group flex items-center justify-between gap-2 text-sm">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-medium">{l.language}</span>
              {l.level && <span className="text-muted-foreground">{LANGUAGE_LEVELS[l.level]}</span>}
              <ItemMeta section="language" itemKey={l.key} evidence={l.evidence} profile={profile} />
            </div>
            <ItemActions section="language" item={l} />
          </li>
        ))}
      </ul>
      <RemovedItems sections={["language"]} noun="languages" />
    </Section>
  );
}
