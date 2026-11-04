create table public.job_chat_messages (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity,
  user_id uuid not null references auth.users (id) on delete cascade,
  user_job_id uuid not null references public.user_job_listings (id) on delete cascade,
  conversation_id uuid not null,
  message_id text not null,
  role text not null check (role in ('system', 'user', 'assistant')),
  message jsonb not null,
  created_at timestamptz not null default now(),
  unique (conversation_id, message_id)
);

create index job_chat_messages_user_job_seq_idx
  on public.job_chat_messages (user_job_id, seq desc);

alter table public.job_chat_messages enable row level security;

create policy "Users can view own chat messages"
  on public.job_chat_messages for select to authenticated
  using ((select auth.uid()) = user_id);

-- Upserts need insert and update; both require the job to belong to the user.
create policy "Users can insert own chat messages"
  on public.job_chat_messages for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.user_job_listings j
      where j.id = user_job_id and j.user_id = (select auth.uid())
    )
  );

create policy "Users can update own chat messages"
  on public.job_chat_messages for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.user_job_listings j
      where j.id = user_job_id and j.user_id = (select auth.uid())
    )
  );
