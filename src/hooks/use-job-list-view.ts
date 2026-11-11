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
import {
  DEFAULT_SORT,
  SORT_STORAGE_KEY,
  parseSort,
  type JobSort,
} from "@/lib/jobs/sort-jobs";

/**
 * How the jobs list is shown: which statuses it includes, the sort and the
 * search. Shared between the list and the status select (which warns when a
 * job moves to a hidden status). The filter and sort are saved in this
 * browser; the search isn't.
 */
interface JobListViewState {
  hydrated: boolean;
  statusFilter: JobStatus[];
  sort: JobSort;
  setSort: (sort: JobSort) => void;
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
    sort: DEFAULT_SORT,
    setSort: (sort) => {
      set({ sort });
      store(SORT_STORAGE_KEY, sort);
    },
    search: "",
    setSearch: (search) => set({ search }),
    hydrate: () => {
      if (get().hydrated) return;
      const read = (key: string) => {
        try {
          return localStorage.getItem(key);
        } catch {
          return null;
        }
      };
      set({
        hydrated: true,
        statusFilter: parseStatusFilter(read(STATUS_FILTER_STORAGE_KEY)),
        sort: parseSort(read(SORT_STORAGE_KEY)),
      });
    },
    toggleStatus: (status) =>
      setFilter(toggleStatus(get().statusFilter, status)),
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
