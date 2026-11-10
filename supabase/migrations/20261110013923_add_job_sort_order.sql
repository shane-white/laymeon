-- LAY-5: users can drag jobs into their own order. Lower sort_order shows
-- first. A moved job gets the midpoint of its new neighbors, so a move updates
-- one row; renumber_job_sort_order() respaces a user's jobs when gaps get tiny.
alter table public.user_job_listings
  add column sort_order double precision;

-- Keep the current newest-first order for existing users.
update public.user_job_listings u
set sort_order = r.rn
from (
  select id,
         row_number() over (partition by user_id order by created_at desc, id) as rn
  from public.user_job_listings
) r
where u.id = r.id;

-- New jobs go to the top: one below the user's current lowest position.
create or replace function public.set_user_job_sort_order()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.sort_order is null then
    select coalesce(min(sort_order), 1) - 1
      into new.sort_order
      from public.user_job_listings
     where user_id = new.user_id
       and deleted_at is null;
  end if;
  return new;
end;
$$;

create trigger user_job_listings_set_sort_order
  before insert on public.user_job_listings
  for each row execute function public.set_user_job_sort_order();

alter table public.user_job_listings
  alter column sort_order set not null;

create index user_job_listings_user_sort_order_idx
  on public.user_job_listings (user_id, sort_order);

-- Respaces the calling user's live jobs to 1, 2, 3... keeping their order.
-- Runs as the caller, so RLS limits it to their own rows.
create or replace function public.renumber_job_sort_order()
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.user_job_listings u
  set sort_order = r.rn
  from (
    select id,
           row_number() over (order by sort_order, created_at desc, id) as rn
    from public.user_job_listings
    where user_id = (select auth.uid())
      and deleted_at is null
  ) r
  where u.id = r.id;
$$;
