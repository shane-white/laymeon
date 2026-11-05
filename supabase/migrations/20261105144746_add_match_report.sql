-- LAY-23: structured match report. The old markdown column stays so older
-- analyses keep displaying until the job is re-analyzed.
alter table public.user_job_listings
  add column if not exists match_report jsonb;
