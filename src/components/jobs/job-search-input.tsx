"use client";

import { useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { useJobListView } from "@/hooks/use-job-list-view";
import { Search, X } from "lucide-react";

function isTextField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.closest(
      "input, textarea, select, [contenteditable]:not([contenteditable='false'])",
    ) !== null
  );
}

export function JobSearchInput() {
  const search = useJobListView((s) => s.search);
  const setSearch = useJobListView((s) => s.setSearch);
  const inputRef = useRef<HTMLInputElement>(null);

  // "/" anywhere outside a text field focuses the search box.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.defaultPrevented || isTextField(e.target)) return;
      e.preventDefault();
      inputRef.current?.focus();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="relative">
      <Search
        aria-hidden
        className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        ref={inputRef}
        type="text"
        role="searchbox"
        aria-label="Search jobs"
        placeholder="Search jobs"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && search) {
            e.preventDefault();
            setSearch("");
          }
        }}
        className="h-8 pl-8 pr-8 text-sm"
      />
      {search && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => {
            setSearch("");
            inputRef.current?.focus();
          }}
          className="absolute right-1.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
