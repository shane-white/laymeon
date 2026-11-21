-- LAY-99: Tailorings. One per Job and Resume pair, so switching a Job's Resume
-- and back brings the earlier Tailoring back. Starting over replaces it.
--
-- `markdown` is the Resume's text as structured Markdown; Suggestions quote it.
-- `items` is the Match Report items the Tailoring covers, each with its
-- Suggestion (or none, for a gap) and the user's decision (LAY-100).
--
-- `match_report_generated_at` and `resume_content_hash` record what it was made
-- from: the Match Report's analysis_documents.match_analysis.generated_at, and
-- resumeContentHash() of the Resume (public.resume_content_hash() in SQL).
-- When either differs from the Job's now, the Tailoring is an Earlier version.
-- `match_report_generated_at` is text, kept exactly as the jsonb has it, so the
-- two compare as equal strings (a timestamptz would come back reformatted).

create table public.tailorings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  user_job_id uuid not null references public.user_job_listings (id) on delete cascade,
  resume_document_id uuid not null references public.documents (id) on delete cascade,
  version integer not null,
  markdown text not null,
  items jsonb not null default '[]'::jsonb,
  match_report_generated_at text not null,
  resume_content_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_job_id, resume_document_id)
);

create index idx_tailorings_user_id on public.tailorings (user_id);
create index idx_tailorings_resume_document_id on public.tailorings (resume_document_id);

alter table public.tailorings enable row level security;

create policy "Users can view own tailorings" on public.tailorings
  for select to authenticated using ((select auth.uid()) = user_id);
-- Tailorings can only be written for the user's own Jobs and Resumes.
create policy "Users can insert own tailorings" on public.tailorings
  for insert to authenticated with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.user_job_listings j
        where j.id = user_job_id and j.user_id = (select auth.uid())
    )
    and exists (
      select 1 from public.documents d
        where d.id = resume_document_id
          and d.user_id = (select auth.uid())
          and d.document_type = 'resume'
    )
  );
create policy "Users can update own tailorings" on public.tailorings
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.user_job_listings j
        where j.id = user_job_id and j.user_id = (select auth.uid())
    )
    and exists (
      select 1 from public.documents d
        where d.id = resume_document_id
          and d.user_id = (select auth.uid())
          and d.document_type = 'resume'
    )
  );
create policy "Users can delete own tailorings" on public.tailorings
  for delete to authenticated using ((select auth.uid()) = user_id);
