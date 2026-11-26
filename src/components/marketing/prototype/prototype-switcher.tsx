"use client";

// PROTOTYPE (throwaway): floating variant switcher for /prototype/landing.
// Shown in production too, so reviewers can compare the variants.
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { VARIANTS, VARIANT_KEYS, type VariantKey } from "./variants";
import proto from "./prototype.module.css";

export function PrototypeSwitcher({ current }: { current: VariantKey }) {
  const router = useRouter();
  const i = VARIANT_KEYS.indexOf(current);
  const go = (step: number) => {
    const next = VARIANT_KEYS[(i + step + VARIANT_KEYS.length) % VARIANT_KEYS.length];
    router.replace(`?variant=${next}`, { scroll: false });
  };

  // &scroll=N jumps to a scroll position, for screenshots of the ride.
  useEffect(() => {
    const n = Number(new URLSearchParams(window.location.search).get("scroll"));
    if (n) setTimeout(() => window.scrollTo(0, n), 300);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest("input, textarea, [contenteditable]")) return;
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className={proto.switcher}>
      <button type="button" aria-label="Previous variant" onClick={() => go(-1)}>
        ←
      </button>
      <span>
        {current} ({VARIANTS[current].name})
      </span>
      <button type="button" aria-label="Next variant" onClick={() => go(1)}>
        →
      </button>
    </div>
  );
}
