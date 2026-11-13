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
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
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
      {(hidden > 0 || expanded) && items.length > limit && (
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

function SkillDetails({ skill, profile }: { skill: Skill; profile: Profile }) {
  const used = profile.positions.filter((p) => skill.positionKeys.includes(p.key));
  const duration = formatDuration(skill.months);
  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <p className="font-medium">{skill.name}</p>
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
      {used.length === 0 && !duration && (
        <p className="text-xs text-muted-foreground">
          Not tied to a job with dates, so there&apos;s no length of experience yet.
        </p>
      )}
    </div>
  );
}

/** A skill as a quiet chip. Its details and evidence open in a popover. */
export function SkillChip({ skill, profile }: { skill: Skill; profile: Profile }) {
  const use = describeSkillUse(skill);
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
  if (profile.positions.length === 0) return null;
  const skillNames = new Map(profile.skills.map((s) => [s.key, s.name]));

  return (
    <Section title="Where you've worked">
      <ol className="ml-1 flex flex-col gap-6 border-l pl-5">
        {profile.positions.map((p) => {
          const range = formatDateRange(p.start, p.end);
          const duration = formatDuration(p.months);
          const type = p.employmentType ? EMPLOYMENT_LABELS[p.employmentType] : undefined;
          const skills = p.skillKeys.map((k) => skillNames.get(k)).filter(Boolean);
          return (
            <li key={p.key} className="relative flex flex-col gap-1.5">
              <span
                aria-hidden
                className={cn(
                  "absolute top-1.5 -left-[24.5px] size-2 rounded-full ring-4 ring-background",
                  p.isCurrent ? "bg-primary" : "bg-muted-foreground/50",
                )}
              />
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
                <div className="min-w-0">
                  <h3 className="text-sm font-medium">{p.title}</h3>
                  <p className="text-sm text-muted-foreground">
                    {p.employer}
                    {p.location && ` · ${p.location}`}
                  </p>
                </div>
                {(range || duration) && (
                  <p className="text-xs whitespace-nowrap text-muted-foreground">
                    {[range, duration].filter(Boolean).join(" · ")}
                  </p>
                )}
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
              <EvidencePopover evidence={p.evidence} sources={profile.sources} className="w-fit" />
            </li>
          );
        })}
      </ol>
    </Section>
  );
}

export function TimeInRoles({ profile }: { profile: Profile }) {
  const roles = profile.roles.filter((r) => r.months);
  if (roles.length === 0) return null;
  return (
    <Section
      title="Time in each role"
      description="Overlapping jobs are only counted once."
    >
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
  if (groups.length === 0) return null;
  return (
    <Section
      title="What you're good at"
      description="Years come from the dates of the jobs where you used each one."
    >
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
  if (tools.length === 0) return null;
  return (
    <Section title="Tools you use">
      <SkillList skills={tools} profile={profile} />
    </Section>
  );
}

export function Accomplishments({ profile }: { profile: Profile }) {
  if (profile.accomplishments.length === 0) return null;

  // Measurable results first, so the strongest show before "Show more". Stable otherwise.
  const withResultsFirst = (items: Profile["accomplishments"]) =>
    [...items].sort((a, b) => Number(Boolean(b.metric)) - Number(Boolean(a.metric)));

  const groups: { key: string; title: string; items: Profile["accomplishments"] }[] = [];
  for (const position of profile.positions) {
    const items = profile.accomplishments.filter((a) => a.positionKey === position.key);
    if (items.length) {
      groups.push({ key: position.key, title: `${position.title} at ${position.employer}`, items: withResultsFirst(items) });
    }
  }
  const other = profile.accomplishments.filter(
    (a) => !a.positionKey || !profile.positions.some((p) => p.key === a.positionKey),
  );
  if (other.length) groups.push({ key: "other", title: "Other work", items: withResultsFirst(other) });

  return (
    <Section title="Things you're proud of">
      {groups.map((g) => (
        <div key={g.key} className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">{g.title}</h3>
          <ShowMore
            items={g.items}
            limit={4}
            noun={g.items.length - 4 === 1 ? "accomplishment" : "accomplishments"}
            className="flex flex-col gap-3"
            render={(a) => (
              <div key={a.key} className="flex gap-2">
                {/* Measurable results are marked, not repeated: the metric is already in the text. */}
                {a.metric ? (
                  <TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-label="Measurable result" />
                ) : (
                  <span className="w-4 shrink-0" aria-hidden />
                )}
                <div className="flex flex-col gap-1">
                  <p className="text-sm">{a.text}</p>
                  <EvidencePopover evidence={a.evidence} sources={profile.sources} className="w-fit" />
                </div>
              </div>
            )}
          />
        </div>
      ))}
    </Section>
  );
}

export function Education({ profile }: { profile: Profile }) {
  const { education, certifications } = profile;
  if (education.length === 0 && certifications.length === 0) return null;
  return (
    <Section title="Education and certifications">
      <ul className="flex flex-col gap-4">
        {education.map((e) => (
          <li key={e.key} className="flex flex-col gap-0.5">
            <p className="text-sm font-medium">{e.school}</p>
            {(e.degree || e.field) && (
              <p className="text-sm text-muted-foreground">
                {[e.degree, e.field].filter(Boolean).join(", ")}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {formatDateRange(e.start, e.end) && (
                <span className="text-xs text-muted-foreground">{formatDateRange(e.start, e.end)}</span>
              )}
              <EvidencePopover evidence={e.evidence} sources={profile.sources} />
            </div>
          </li>
        ))}
        {certifications.map((c) => {
          const dates = [
            c.issued && `Issued ${formatProfileDate(c.issued)}`,
            c.expires && `expires ${formatProfileDate(c.expires)}`,
          ].filter(Boolean);
          return (
            <li key={c.key} className="flex flex-col gap-0.5">
              <p className="text-sm font-medium">{c.name}</p>
              {c.issuer && <p className="text-sm text-muted-foreground">{c.issuer}</p>}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                {dates.length > 0 && <span className="text-xs text-muted-foreground">{dates.join(", ")}</span>}
                <EvidencePopover evidence={c.evidence} sources={profile.sources} />
              </div>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

export function Languages({ profile }: { profile: Profile }) {
  if (profile.languages.length === 0) return null;
  return (
    <Section title="Languages">
      <ul className="flex flex-wrap gap-x-6 gap-y-2">
        {profile.languages.map((l) => (
          <li key={l.key} className="flex items-center gap-2 text-sm">
            <span className="font-medium">{l.language}</span>
            {l.level && <span className="text-muted-foreground">{LANGUAGE_LEVELS[l.level]}</span>}
            <EvidencePopover evidence={l.evidence} sources={profile.sources} />
          </li>
        ))}
      </ul>
    </Section>
  );
}
