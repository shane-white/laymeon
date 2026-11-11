-- LAY-42: details extracted from the posting, shown in the job header.
-- All are null when the posting doesn't say, and for jobs added before this.
alter table public.job_listings
  add column location text,
  add column work_arrangement text,
  add column salary text,
  add column seniority_level text;

alter table public.job_listings
  add constraint job_listings_work_arrangement_check
    check (work_arrangement in ('on_site', 'hybrid', 'remote')),
  add constraint job_listings_seniority_level_check
    check (seniority_level in (
      'intern', 'junior', 'mid', 'senior', 'staff', 'principal',
      'lead', 'manager', 'director', 'vp', 'executive'
    ));

comment on column public.job_listings.location is 'Where the job is based, as the posting states it';
comment on column public.job_listings.work_arrangement is 'on_site, hybrid or remote';
comment on column public.job_listings.salary is 'Pay as the posting states it, formatted for display';
comment on column public.job_listings.seniority_level is 'Level of the role, from intern to executive';
