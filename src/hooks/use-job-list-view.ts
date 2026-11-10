"use client";

import { useEffect } from "react";
import { create } from "zustand";
import type { JobStatus } from "@/lib/jobs/statuses";
import {
  DEFAULT_STATUS_FILTER,
  STATUS_FILTER_STORAGE_KEY,
  addStatus,
  parseStatusFilter,
  toggleStatus,
} from "@/lib/jobs/status-filter";

/**
 * How the jobs list is shown: which statuses it includes and the search.
 * Shared between the list and the status select (which warns when a job moves
 * to a hidden status). The filter is saved in this browser; the search isn't.
 */
interface JobListViewState {
  hydrated: boolean;
  statusFilter: JobStatus[];
  search: string;
  setSearch: (search: string) => void;
  hydrate: () => void;
  toggleStatus: (status: JobStatus) => void;
  showStatus: (status: JobStatus) => void;
  resetStatusFilter: () => void;
  setStatusFilter: (filter: JobStatus[]) => void;
}

function store(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

export const useJobListView = create<JobListViewState>((set, get) => {
  function setFilter(statusFilter: JobStatus[]) {
    set({ statusFilter });
    store(STATUS_FILTER_STORAGE_KEY, statusFilter);
  }

  return {
    hydrated: false,
    statusFilter: [...DEFAULT_STATUS_FILTER],
    search: "",
    setSearch: (search) => set({ search }),
    hydrate: () => {
      if (get().hydrated) return;
      let raw: string | null = null;
      try {
        raw = localStorage.getItem(STATUS_FILTER_STORAGE_KEY);
      } catch {}
      set({ hydrated: true, statusFilter: parseStatusFilter(raw) });
    },
    toggleStatus: (status) => setFilter(toggleStatus(get().statusFilter, status)),
    showStatus: (status) => setFilter(addStatus(get().statusFilter, status)),
    resetStatusFilter: () => setFilter([...DEFAULT_STATUS_FILTER]),
    setStatusFilter: (filter) => setFilter(filter),
  };
});

/** Loads the saved view after mount, so the server and first client render match. */
export function useHydrateJobListView() {
  const hydrate = useJobListView((s) => s.hydrate);
  useEffect(() => hydrate(), [hydrate]);
}
