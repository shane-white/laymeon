/**
 * Groups skills that mean the same thing ("UX Research" and "User Research"),
 * which code can't tell from the names alone. One small model call over the
 * merged skill names, never the documents. The result is cached by a hash of
 * the names, so a rebuild with the same skills gets the same groups.
 */
import { createHash } from "node:crypto";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { anthropic, CLAUDE_MODEL, getResponseText } from "@/lib/anthropic/client";
import { skillMatchKey } from "./keys";
import type { CareerProfile } from "./schema";

/** Bump when the prompt changes, so cached groups are redone. */
const SYNONYMS_VERSION = 1;

export type SkillSynonyms = NonNullable<CareerProfile["skillSynonyms"]>;
type Skill = Pick<CareerProfile["skills"][number], "name" | "aliases" | "category">;

/** Changes whenever the set of skill names changes. */
export function synonymsHash(skills: Skill[]): string {
  const names = skills.map((s) => `${s.category}:${s.name}`).sort();
  return createHash("sha256").update(`${SYNONYMS_VERSION}\n${names.join("\n")}`).digest("hex");
}

const groupsSchema = z.object({
  groups: z
    .array(
      z.object({
        names: z
          .array(z.string())
          .describe("Two or more skill names from the list, exactly as written, that mean the same thing."),
      }),
    )
    .describe("Only groups of skills that mean the same thing. Empty if there are none."),
});

/**
 * Checks the model's groups against the skill list and turns them into a map
 * from each member's match key to the group's. Names that aren't in the list
 * are dropped, a skill only joins its first group, and a group needs two
 * members. The group's key is its first member's, in the order of `skills`.
 */
export function toSynonymMap(groups: { names: string[] }[], skills: Skill[]): Record<string, string> {
  const order = new Map(skills.map((s, i) => [skillMatchKey(s.name), i]));
  const taken = new Set<string>();
  const map: Record<string, string> = {};
  for (const group of groups) {
    const keys = [...new Set(group.names.map(skillMatchKey))]
      .filter((k) => order.has(k) && !taken.has(k))
      .sort((a, b) => order.get(a)! - order.get(b)!);
    if (keys.length < 2) continue;
    for (const k of keys) {
      taken.add(k);
      if (k !== keys[0]) map[k] = keys[0];
    }
  }
  return map;
}

const SYSTEM_PROMPT = `You tidy up the skills list of a person's career profile. The list was gathered from several of their documents, so the same skill can appear under different names.

Group the skills that mean the same thing: the same skill, tool, field or way of working, said differently. For example "UX Research" and "User Research", "Customer Interviews" and "User Interviews", "Stakeholder Management" and "Managing Stakeholders", "Google Sheets" and "Sheets".

Never group skills that are only related, or where one is part of the other: "SQL" and "PostgreSQL", "JavaScript" and "React", "Product Management" and "Product Strategy", "Mentoring" and "Team Management", "AWS" and "AWS Lambda" all stay apart. When unsure, leave them apart.

Use the names exactly as they're written in the list.`;

/** Asks the model which skills mean the same thing. */
export async function findSkillSynonyms(skills: Skill[]): Promise<Record<string, string>> {
  if (skills.length < 2) return {};
  const list = skills
    .map((s) => `- ${s.name} (${s.category.replace("_", " ")}${s.aliases.length ? `; also written ${s.aliases.join(", ")}` : ""})`)
    .join("\n");

  const response = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    // Thinking counts toward max_tokens alongside the groups.
    max_tokens: 8000,
    system: SYSTEM_PROMPT,
    output_config: { effort: "low", format: zodOutputFormat(groupsSchema) },
    messages: [{ role: "user", content: `Skills:\n${list}` }],
  });

  const parsed = groupsSchema.safeParse(JSON.parse(getResponseText(response)));
  if (!parsed.success) throw new Error("Claude returned skill groups that didn't match the expected format");
  return toSynonymMap(parsed.data.groups, skills);
}
