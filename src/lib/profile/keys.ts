/**
 * Stable keys for Career Story items. Keys are built in code from normalized
 * fields, never chosen by the model, so the same item gets the same key on
 * every rebuild. The user's changes refer to items by these keys.
 */
import { createHash } from "node:crypto";
import { normalizeText } from "@/lib/match-report/evidence";

/**
 * Lowercase, dash-separated, ASCII. Keeps symbols that change meaning in
 * skill names: C++ → c-plus-plus, C# → c-sharp, .NET → dot-net.
 */
export function slugify(text: string): string {
  const slug = text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\+/g, " plus ")
    .replace(/#/g, " sharp ")
    .replace(/&/g, " and ")
    .replace(/(^|[\s/(])\.(?=[a-z0-9])/g, "$1dot ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  // Names in non-Latin scripts have no ASCII slug.
  return slug || `x-${shortHash(text.trim().toLowerCase())}`;
}

export function shortHash(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 10);
}

const COMPANY_SUFFIX =
  /[\s,]+(inc|incorporated|llc|l\.l\.c|ltd|limited|corp|corporation|co|company|plc|gmbh|ag|s\.?a|b\.?v|pty|llp|lp)\.?$/i;

/** "Acme, Inc." and "ACME" both become "acme". */
export function normalizeEmployer(name: string): string {
  let result = name.normalize("NFKC").trim();
  for (let previous = ""; previous !== result; ) {
    previous = result;
    result = result.replace(COMPANY_SUFFIX, "").trim();
  }
  return slugify(result.replace(/^the\s+/i, ""));
}

function startYear(start: string | null): string {
  return start?.slice(0, 4) ?? "unknown";
}

/**
 * Employer + title family + start year. Only the year, so a later résumé
 * that adds the month ("2019" → "2019-03") doesn't change the key.
 */
export function positionKey(employer: string, titleFamily: string, start: string | null): string {
  return `${normalizeEmployer(employer)}|${slugify(titleFamily)}|${startYear(start)}`;
}

export function skillKey(canonicalName: string): string {
  return slugify(canonicalName);
}

/**
 * A looser form of a skill's name for matching it across documents, so
 * "React.js", "ReactJS", "React JS" and "React" are the same skill. Ignores
 * separators and a trailing "js".
 */
export function skillMatchKey(name: string): string {
  const compact = skillKey(name).replace(/-/g, "");
  return compact.length > 4 && compact.endsWith("js") ? compact.slice(0, -2) : compact;
}

export function roleKey(titleFamily: string): string {
  return slugify(titleFamily);
}

export function educationKey(school: string, degree: string | null): string {
  return `${slugify(school)}|${degree ? slugify(degree) : "none"}`;
}

export function certificationKey(name: string, issuer: string | null): string {
  return `${slugify(name)}|${issuer ? slugify(issuer) : "none"}`;
}

export function languageKey(language: string): string {
  return slugify(language);
}

export function accomplishmentKey(positionKey: string | null, text: string): string {
  return `${positionKey ?? "none"}|${shortHash(normalizeText(text))}`;
}

/** Adds -2, -3… to keys that are already taken, in order. */
export function dedupeKeys<T extends { key: string }>(items: T[]): T[] {
  const seen = new Map<string, number>();
  return items.map((item) => {
    const count = (seen.get(item.key) ?? 0) + 1;
    seen.set(item.key, count);
    return count === 1 ? item : { ...item, key: `${item.key}-${count}` };
  });
}
