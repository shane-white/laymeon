-- LAY-7: allow many uploaded resumes and cover letters per user, each with a
-- name, a target role and a default flag. At most one default per user and type.

drop index if exists public.idx_documents_unique_slot;

alter table public.documents
  add column display_name text,
  add column target_role text,
  add column is_default boolean not null default false;

-- The old unique slot index guaranteed at most one live uploaded document per
-- user and type, so each of those becomes the default.
update public.documents
  set is_default = true
  where source = 'uploaded' and deleted_at is null;

update public.documents set display_name = original_filename;

alter table public.documents alter column display_name set not null;

create unique index idx_documents_one_default
  on public.documents (user_id, document_type)
  where is_default and deleted_at is null and source = 'uploaded';

-- Moves the default flag to doc_id, unsetting the previous default first so the
-- unique index is never violated. Runs as the caller, so RLS applies.
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

-- Soft-deletes doc_id. If it was the default, the newest remaining uploaded
-- document of the same type becomes the default. Runs as the caller.
create or replace function public.delete_document(doc_id uuid)
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
      and deleted_at is null;

  if not found then
    raise exception 'Document not found' using errcode = 'P0002';
  end if;

  update public.documents
    set deleted_at = now(), is_default = false, updated_at = now()
    where id = target.id;

  if target.is_default then
    update public.documents
      set is_default = true, updated_at = now()
      where id = (
        select id from public.documents
          where user_id = target.user_id
            and document_type = target.document_type
            and source = 'uploaded'
            and deleted_at is null
          order by created_at desc
          limit 1
      );
  end if;
end;
$$;
