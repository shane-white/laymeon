/**
 * The Career Story as model context. Every item gets a short ID (P1, S3, R1…)
 * so the model can point at items and code can check what it pointed at,
 * instead of trusting quoted text.
 */
import { formatDateRange, formatDuration } from "./format";
import type { CareerProfile, ProfileSection } from "./schema";

/** A Career Story item the model pointed at, as stored in reports and shown in the UI. */
export interface CareerStoryRef {
  section: ProfileSection | "role";
  key: string;
  /** e.g. "SQL · 4.5 yrs" or "Product Manager · 7 yrs 4 mos". */
  label: string;
  /** The user added or changed this item themselves. */
  byUser: boolean;
}

export interface CareerStoryContext {
  text: string;
  refs: Map<string, CareerStoryRef>;
}

const join = (...parts: (string | null | undefined | false)[]) => parts.filter(Boolean).join(" · ");

export function formatCareerStoryForPrompt(profile: CareerProfile): CareerStoryContext {
  const refs = new Map<string, CareerStoryRef>();
  const lines: string[] = [];
  const touched = (section: ProfileSection, key: string) =>
    profile.user.added.some((a) => a.section === section && a.key === key) ||
    profile.user.edits.some((e) => e.section === section && e.key === key);
  const mark = (byUser: boolean) => (byUser ? " (stated by the candidate)" : "");

  function add(
    prefix: string,
    index: number,
    section: CareerStoryRef["section"],
    key: string,
    label: string,
    line: string,
  ) {
    const id = `${prefix}${index + 1}`;
    const byUser = section !== "role" && touched(section, key);
    refs.set(id, { section, key, label, byUser });
    lines.push(`- [${id}] ${line}${mark(byUser)}`);
  }

  const positionId = new Map(profile.positions.map((p, i) => [p.key, `P${i + 1}`]));

  if (profile.positions.length) {
    lines.push("### Jobs");
    profile.positions.forEach((p, i) =>
      add("P", i, "position", p.key, `${p.title} at ${p.employer}`, join(
        `${p.title} at ${p.employer}`,
        formatDateRange(p.start, p.end),
        formatDuration(p.months),
        p.location,
        p.peopleManaged ? `managed ${p.peopleManaged} people` : null,
      )),
    );
  }

  const roles = profile.roles.filter((r) => r.months);
  if (roles.length) {
    lines.push("", "### Time in each role (overlapping jobs counted once)");
    roles.forEach((r, i) => {
      const duration = formatDuration(r.months);
      add("R", i, "role", r.key, join(r.titleFamily, duration), join(r.titleFamily, duration));
    });
  }
  if (profile.summary.totalMonths) {
    lines.push(`- Total work experience: ${formatDuration(profile.summary.totalMonths)}`);
  }

  if (profile.skills.length) {
    lines.push("", "### Skills and tools (years come from the jobs they were used in)");
    profile.skills.forEach((s, i) => {
      const duration = formatDuration(s.months);
      const jobs = s.positionKeys.map((k) => positionId.get(k)).filter(Boolean);
      add("S", i, "skill", s.key, join(s.name, duration), join(
        s.name,
        s.aliases.length > 0 && `also written ${s.aliases.join(", ")}`,
        duration,
        jobs.length > 0 && `used in ${jobs.join(", ")}`,
      ));
    });
  }

  if (profile.accomplishments.length) {
    lines.push("", "### Accomplishments");
    profile.accomplishments.forEach((a, i) => {
      const job = a.positionKey ? positionId.get(a.positionKey) : undefined;
      const short = a.text.length > 90 ? `${a.text.slice(0, 87)}…` : a.text;
      add("A", i, "accomplishment", a.key, short, `${a.text}${job ? ` (in ${job})` : ""}`);
    });
  }

  if (profile.education.length) {
    lines.push("", "### Education");
    profile.education.forEach((e, i) => {
      const label = join([e.degree, e.field].filter(Boolean).join(", "), e.school);
      add("E", i, "education", e.key, label, join(label, formatDateRange(e.start, e.end)));
    });
  }

  if (profile.certifications.length) {
    lines.push("", "### Certifications and licenses");
    profile.certifications.forEach((c, i) =>
      add("C", i, "certification", c.key, c.name, join(c.name, c.issuer, c.issued && `issued ${c.issued}`, c.expires && `expires ${c.expires}`)),
    );
  }

  if (profile.languages.length) {
    lines.push("", "### Languages");
    profile.languages.forEach((l, i) => add("L", i, "language", l.key, join(l.language, l.level), join(l.language, l.level)));
  }

  return { text: lines.join("\n"), refs };
}
