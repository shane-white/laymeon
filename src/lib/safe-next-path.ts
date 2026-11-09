/**
 * Returns `next` if it is a path on this site, otherwise `fallback`.
 * Rejects absolute and protocol-relative URLs (`//evil.com`, `/\evil.com`)
 * so auth redirects can't send users to another site.
 */
export function safeNextPath(next: string | null, fallback = "/jobs"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return fallback;
  }
  return next;
}
