-- LAY-56: rebuild the Career Story automatically when documents change.
--
-- One row per user tracks whether a rebuild is wanted and whether one is
-- running, so changes made in quick succession lead to one rebuild at a time:
-- - requested_at: the last time a document changed.
-- - started_at: set while a rebuild runs (a lock). A run that started more
--   than a few minutes ago is treated as dead, so a crash can't block rebuilds.
-- - A run that finishes and finds requested_at later than its start runs again.

create table public.career_profile_rebuilds (
  user_id uuid primary key references auth.users (id) on delete cascade,
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  failed_at timestamptz,
  error text
);

alter table public.career_profile_rebuilds enable row level security;

create policy "Users can view own rebuilds" on public.career_profile_rebuilds
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users can insert own rebuilds" on public.career_profile_rebuilds
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users can update own rebuilds" on public.career_profile_rebuilds
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users can delete own rebuilds" on public.career_profile_rebuilds
  for delete to authenticated using ((select auth.uid()) = user_id);
