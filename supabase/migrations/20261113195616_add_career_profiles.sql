-- LAY-52: Career Story. A structured profile built from the user's documents.
--
-- Three layers:
-- - career_profile_extractions: what was extracted from each document, cached
--   by a hash of the document's content so unchanged documents aren't
--   extracted again.
-- - career_profiles: one row per user. `base` is the documents' extractions
--   merged together; `data` is `base` with the user's changes applied.
--   Rebuilding only ever replaces these two columns.
-- - career_profile_changes: the user's edits, removals, additions and merges.
--   Rebuilds never write here, so they never lose the user's changes.

create table public.career_profile_extractions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  document_id uuid not null references public.documents (id) on delete cascade,
  -- Hash of the extraction version, the document's date and its content.
  content_hash text not null,
  extraction jsonb not null,
  created_at timestamptz not null default now(),
  unique (document_id)
);

create index idx_career_profile_extractions_user_id
  on public.career_profile_extractions (user_id);

create table public.career_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  version integer not null,
  base jsonb not null,
  data jsonb not null,
  built_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.career_profile_changes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  section text not null,
  kind text not null,
  -- The item the change applies to. Null for an item the user added.
  target_key text,
  -- Only the fields the user changed, or the whole item for 'add'.
  fields jsonb,
  -- What the documents said for those fields when the user made the change,
  -- so a rebuild can tell whether the documents changed underneath it.
  base_snapshot jsonb,
  -- For 'merge': the keys of the items folded into target_key.
  merged_keys text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint career_profile_changes_section_check check (
    section in (
      'summary', 'position', 'skill', 'role', 'education',
      'certification', 'language', 'accomplishment'
    )
  ),
  constraint career_profile_changes_kind_check check (
    kind in ('edit', 'hide', 'add', 'merge')
  ),
  constraint career_profile_changes_target_check check (
    (kind = 'add') = (target_key is null)
  ),
  constraint career_profile_changes_merge_check check (
    kind <> 'merge' or cardinality(merged_keys) > 0
  )
);

create index idx_career_profile_changes_user_id
  on public.career_profile_changes (user_id);

alter table public.career_profile_extractions enable row level security;
alter table public.career_profiles enable row level security;
alter table public.career_profile_changes enable row level security;

create policy "Users can view own extractions" on public.career_profile_extractions
  for select to authenticated using ((select auth.uid()) = user_id);
-- Extractions can only be written for the user's own documents.
create policy "Users can insert own extractions" on public.career_profile_extractions
  for insert to authenticated with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.documents d
        where d.id = document_id and d.user_id = (select auth.uid())
    )
  );
create policy "Users can update own extractions" on public.career_profile_extractions
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.documents d
        where d.id = document_id and d.user_id = (select auth.uid())
    )
  );
create policy "Users can delete own extractions" on public.career_profile_extractions
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy "Users can view own career profile" on public.career_profiles
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users can insert own career profile" on public.career_profiles
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users can update own career profile" on public.career_profiles
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users can delete own career profile" on public.career_profiles
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy "Users can view own profile changes" on public.career_profile_changes
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users can insert own profile changes" on public.career_profile_changes
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users can update own profile changes" on public.career_profile_changes
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users can delete own profile changes" on public.career_profile_changes
  for delete to authenticated using ((select auth.uid()) = user_id);
