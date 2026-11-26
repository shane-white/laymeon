"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { savePendingJobUrl } from "@/lib/pending-job";
import styles from "./landing.module.css";

function looksLikeUrl(value: string) {
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** The page's primary action: paste a job link, then sign up to import it. */
export function TicketBooth({ tone = "sky" }: { tone?: "sky" | "plaza" }) {
  const router = useRouter();
  const id = useId();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!looksLikeUrl(value)) {
      setError(
        "That doesn't look like a link. Paste the job's web address, starting with https://.",
      );
      return;
    }
    savePendingJobUrl(value.trim());
    router.push("/signup");
  }

  return (
    <form
      className={`${styles.booth} ${tone === "plaza" ? styles.boothPlaza : ""}`}
      onSubmit={handleSubmit}
      noValidate
    >
      <label htmlFor={`${id}-url`} className={styles.boothLabel}>
        Paste a job link to start
      </label>
      <div className={styles.boothRow}>
        <input
          id={`${id}-url`}
          type="url"
          inputMode="url"
          autoComplete="url"
          placeholder="https://careers.example.com/jobs/…"
          className={styles.boothInput}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            if (error) setError(null);
          }}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : `${id}-hint`}
        />
        <button type="submit" className={styles.boothButton}>
          Start my search
          <ArrowRight aria-hidden className={styles.boothArrow} />
        </button>
      </div>
      {error ? (
        <p id={`${id}-error`} className={styles.boothError} role="alert">
          {error}
        </p>
      ) : (
        <p id={`${id}-hint`} className={styles.boothHint}>
          You&apos;ll create an account, then the job is ready to add. No link handy?{" "}
          <Link href="/signup">Sign up</Link> and paste the description instead.
        </p>
      )}
    </form>
  );
}
