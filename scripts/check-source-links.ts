/**
 * Checks every "Read further" source link (src/lib/resume-review/sources.ts).
 * Flags links that fail, that redirect to a different site (a moved page can
 * land somewhere unrelated), or that load a "page not found" page.
 *
 * A flagged link needs a person to look: fix the URL, or replace the source
 * with another one that a person has checked. Some sites block automated
 * requests; those are listed as "check by hand" and don't fail the run.
 *
 * Usage: npm run check:sources
 */
import { SOURCES } from "@/lib/resume-review/sources";

const TIMEOUT_MS = 20_000;
const NOT_FOUND = /<title>[^<]*(not found|404|page missing)[^<]*<\/title>/i;
// Sites that block automated requests. The page may be fine; a person has to open it.
const BLOCKED = new Set([401, 403, 429]);

interface Result {
  id: string;
  url: string;
  status: "ok" | "broken" | "blocked";
  problem?: string;
}

/** The site, without "www.", so www.example.com and example.com match. */
function site(url: string): string {
  return new URL(url).hostname.replace(/^www\./, "");
}

async function check(id: string, url: string): Promise<Result> {
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; link-checker)" },
    });
    if (BLOCKED.has(response.status)) {
      return { id, url, status: "blocked", problem: `HTTP ${response.status}: the site blocks automated checks` };
    }
    if (!response.ok) return { id, url, status: "broken", problem: `HTTP ${response.status}` };
    if (site(response.url) !== site(url)) {
      return { id, url, status: "broken", problem: `redirects to another site: ${response.url}` };
    }
    const type = response.headers.get("content-type") ?? "";
    if (type.includes("html") && NOT_FOUND.test(await response.text())) {
      return { id, url, status: "broken", problem: 'loads a "page not found" page' };
    }
    return { id, url, status: "ok" };
  } catch (err) {
    return { id, url, status: "broken", problem: err instanceof Error ? err.message : String(err) };
  }
}

const MARKS = { ok: "✓", broken: "✗", blocked: "?" } as const;

async function main() {
  const results = await Promise.all(Object.entries(SOURCES).map(([id, s]) => check(id, s.url)));
  for (const r of results) {
    console.log(`${MARKS[r.status]} ${r.id}: ${r.problem ?? "ok"}`);
    if (r.problem) console.log(`    ${r.url}`);
  }
  const count = (status: Result["status"]) => results.filter((r) => r.status === status).length;
  console.log(`\n${count("ok")} OK, ${count("broken")} broken, ${count("blocked")} to check by hand in a browser.`);
  if (count("broken")) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
