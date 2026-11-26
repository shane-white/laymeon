/**
 * A job link pasted on the landing page before the visitor had an account.
 * It waits in localStorage until the Add Job dialog picks it up after sign-up.
 */
const KEY = "laymeon:pending-job-url";

export function savePendingJobUrl(url: string) {
  try {
    localStorage.setItem(KEY, url);
  } catch {
    // Storage blocked: the visitor can still paste the link after signing up.
  }
}

/** Returns the waiting link, if any, and clears it so it's offered once. */
export function takePendingJobUrl(): string | null {
  try {
    const url = localStorage.getItem(KEY);
    if (url) localStorage.removeItem(KEY);
    return url;
  } catch {
    return null;
  }
}
