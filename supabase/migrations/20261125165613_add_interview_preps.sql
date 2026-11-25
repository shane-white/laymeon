-- LAY-119: Interview Prep. One per Job, with three sections (Process, Company,
-- Practice), each in its own column so they're researched, saved and
-- refreshed independently: a request saving one section never overwrites
-- another.
--
-- Each section column holds the section's envelope, or null when it was never
-- researched:
--   { status: 'researching' | 'ready' | 'failed', researchedAt, data,
--     startedAt, failure: { reason, message } | null }
-- See src/lib/interview-prep/interview-prep.ts for the shape of `data` per
-- section (Practice keeps its Practice cards, with their marks, in it).
--
-- user_job_listings.interview_suggestions (the older free-text suggestions)
-- stays: it's shown read-only until the Job's Interview Prep has a result,
-- and cleared then.

create table public.interview_preps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  user_job_id uuid not null unique references public.user_job_listings (id) on delete cascade,
  version integer not null default 1,
  process jsonb,
  company jsonb,
  practice jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_interview_preps_user_id on public.interview_preps (user_id);

alter table public.interview_preps enable row level security;

create policy "Users can view own interview preps" on public.interview_preps
  for select to authenticated using ((select auth.uid()) = user_id);
-- Interview Preps can only be written for the user's own Jobs.
create policy "Users can insert own interview preps" on public.interview_preps
  for insert to authenticated with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.user_job_listings j
        where j.id = user_job_id and j.user_id = (select auth.uid())
    )
  );
create policy "Users can update own interview preps" on public.interview_preps
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.user_job_listings j
        where j.id = user_job_id and j.user_id = (select auth.uid())
    )
  );
create policy "Users can delete own interview preps" on public.interview_preps
  for delete to authenticated using ((select auth.uid()) = user_id);
