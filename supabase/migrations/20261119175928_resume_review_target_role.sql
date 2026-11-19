-- LAY-86: a Resume Review is written for its resume's Target role, so changing
-- the Target role makes the review an Earlier version too.
--
-- resume_content_hash() gains the Target role, matching resumeContentHash()
-- in src/lib/resume-review/content-hash.ts: sha256 of the storage path, the
-- Target role and the parsed text, one per line.

create function public.resume_content_hash(storage_path text, target_role text, parsed_markdown text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(
    sha256(convert_to(
      coalesce(storage_path, '') || E'\n' || coalesce(target_role, '') || E'\n' || coalesce(parsed_markdown, ''),
      'UTF8'
    )),
    'hex'
  )
$$;

-- Reviews that are current now stay current: they were made from the resume
-- as it is, Target role included. Reviews already out of date keep their old
-- hash, which never matches the new one, so they stay out of date.
update public.resume_reviews r
  set resume_content_hash = public.resume_content_hash(d.storage_path, d.target_role, d.parsed_markdown)
  from public.documents d
  where d.id = r.resume_document_id
    and r.resume_content_hash = public.resume_content_hash(d.storage_path, d.parsed_markdown);

create or replace view public.resume_review_summaries
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
    and r.resume_content_hash <> public.resume_content_hash(d.storage_path, d.target_role, d.parsed_markdown)
  ) as out_of_date
from public.resume_reviews r
left join public.documents d on d.id = r.resume_document_id;

drop function public.resume_content_hash(text, text);
