-- LAY-70: resume reviews. One review per resume; running it again replaces it.
--
-- `report` is the ResumeReview JSON (src/lib/resume-review/report-schema.ts).
-- `resume_content_hash` is resumeContentHash() of the resume when it was
-- reviewed (src/lib/resume-review/content-hash.ts). When the resume changes,
-- the hashes differ and the review is out of date.
--
-- A review is kept when its resume is soft-deleted, so the UI can say the
-- resume is gone (LAY-72). It's only removed if the document row is.

create table public.resume_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  resume_document_id uuid not null references public.documents (id) on delete cascade,
  report_version integer not null,
  report jsonb not null,
  resume_content_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (resume_document_id)
);

create index idx_resume_reviews_user_id on public.resume_reviews (user_id);

alter table public.resume_reviews enable row level security;

create policy "Users can view own resume reviews" on public.resume_reviews
  for select to authenticated using ((select auth.uid()) = user_id);
-- Reviews can only be written for the user's own resumes.
create policy "Users can insert own resume reviews" on public.resume_reviews
  for insert to authenticated with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.documents d
        where d.id = resume_document_id
          and d.user_id = (select auth.uid())
          and d.document_type = 'resume'
    )
  );
create policy "Users can update own resume reviews" on public.resume_reviews
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.documents d
        where d.id = resume_document_id
          and d.user_id = (select auth.uid())
          and d.document_type = 'resume'
    )
  );
create policy "Users can delete own resume reviews" on public.resume_reviews
  for delete to authenticated using ((select auth.uid()) = user_id);

-- The resume's current content hash, worked out the same way as
-- resumeContentHash() in TypeScript: sha256 of the storage path, a newline,
-- and the parsed text. Kept in one place so the two can't drift apart.
create function public.resume_content_hash(storage_path text, parsed_markdown text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(
    sha256(convert_to(coalesce(storage_path, '') || E'\n' || coalesce(parsed_markdown, ''), 'UTF8')),
    'hex'
  )
$$;

-- What the sidebar needs for each review, without the whole report. Runs
-- with the caller's permissions (security_invoker), so RLS still applies.
create view public.resume_review_summaries
with (security_invoker = true)
as
select
  r.id,
  r.user_id,
  r.resume_document_id,
  r.report_version,
  r.report -> 'overall' ->> 'label' as overall_label,
  r.created_at,
  r.updated_at,
  d.display_name as resume_name,
  (d.id is null or d.deleted_at is not null) as resume_deleted,
  (
    d.id is not null
    and r.resume_content_hash <> public.resume_content_hash(d.storage_path, d.parsed_markdown)
  ) as out_of_date
from public.resume_reviews r
left join public.documents d on d.id = r.resume_document_id;

grant select on public.resume_review_summaries to authenticated;
