-- LAY-50: Example Works. A project is a document of type 'project'. Users can
-- write one in the app (source 'written', no file) or upload a file that is
-- split into several projects (source 'uploaded', each row pointing at the
-- same stored file).

alter table public.documents
  drop constraint documents_document_type_check,
  add constraint documents_document_type_check
    check (document_type in ('resume', 'cover_letter', 'project'));

alter table public.documents
  drop constraint documents_source_check,
  add constraint documents_source_check
    check (source in ('uploaded', 'generated', 'written'));

-- Written projects have no file.
alter table public.documents
  alter column original_filename drop not null,
  alter column mime_type drop not null,
  alter column file_size_bytes drop not null,
  alter column storage_bucket drop not null,
  alter column storage_path drop not null;

alter table public.documents
  add constraint documents_file_check
    check (
      source = 'written'
      or (
        original_filename is not null
        and mime_type is not null
        and file_size_bytes is not null
        and storage_bucket is not null
        and storage_path is not null
      )
    );

alter table public.documents
  add constraint documents_written_project_check
    check (source <> 'written' or document_type = 'project');

-- Projects have no default.
alter table public.documents
  add constraint documents_project_not_default_check
    check (document_type <> 'project' or not is_default);

-- Same as before, but projects can't be made the default.
create or replace function public.set_default_document(doc_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target public.documents%rowtype;
begin
  select * into target
    from public.documents
    where id = doc_id
      and user_id = (select auth.uid())
      and source = 'uploaded'
      and document_type <> 'project'
      and deleted_at is null;

  if not found then
    raise exception 'Document not found' using errcode = 'P0002';
  end if;

  update public.documents
    set is_default = false, updated_at = now()
    where user_id = target.user_id
      and document_type = target.document_type
      and source = 'uploaded'
      and deleted_at is null
      and is_default
      and id <> target.id;

  update public.documents
    set is_default = true, updated_at = now()
    where id = target.id;
end;
$$;
