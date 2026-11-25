"use client";

import { create } from "zustand";
import type { TabKey } from "@/lib/job-tabs";

/**
 * A request, from outside the Job detail, to open one of a Job's tabs, e.g.
 * the Interview Prep tab after starting Prepare from the jobs list. The Job
 * detail opens the tab once that Job is shown, then clears the request.
 */
interface JobTabRequestState {
  /** The Job (`user_job_listings.id`) and tab to open. */
  request: { jobId: string; tab: TabKey } | null;
  openTab: (jobId: string, tab: TabKey) => void;
  clear: () => void;
}

export const useJobTabRequest = create<JobTabRequestState>((set) => ({
  request: null,
  openTab: (jobId, tab) => set({ request: { jobId, tab } }),
  clear: () => set({ request: null }),
}));
