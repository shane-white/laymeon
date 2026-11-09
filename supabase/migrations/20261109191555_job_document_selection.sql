-- LAY-9: each job can pick a resume and cover letter; null means "use the
-- default". analysis_documents records which documents each analysis used,
-- keyed by analysis type, with name snapshots so it survives renames/deletes.
alter table public.user_job_listings
  add column resume_document_id uuid references public.documents (id) on delete set null,
  add column cover_letter_document_id uuid references public.documents (id) on delete set null,
  add column analysis_documents jsonb;
