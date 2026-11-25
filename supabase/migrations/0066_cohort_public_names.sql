-- Public numbering and names for cohorts. The portal's own number (cohorts.seq) is a counter that began at 10 after early test cohorts,
-- so the real cohorts were 11, 12, 13 while the website says seven. Public pages now use public_no (1 to 7, in the order they ran) and public_name.
alter table public.cohorts add column if not exists public_no int, add column if not exists public_name text;
alter table public.historical_cohorts add column if not exists public_no int, add column if not exists public_name text;

update public.historical_cohorts h set public_no = v.n, public_name = v.nm from (values
  ('Youth Cohort 1 (2025)', 1, 'Chipukizi'), ('Adult Cohort 1 (2026)', 2, 'Mwanzo'),
  ('Adult Cohort 2 (2026)', 3, 'Juhudi'), ('Adult Cohort 3 (2026)', 4, 'Msingi')) v(name, n, nm)
 where h.name = v.name and h.public_no is null;
update public.cohorts c set public_no = v.n, public_name = v.nm from (values
  ('KE0740 HVC 27/6', 5, 'Mtongwe Imara'), ('Youth class- Maendeleo', 6, 'Maendeleo'), ('Youth class- Amka Kijana', 7, 'Amka Kijana')) v(name, n, nm)
 where c.name = v.name and c.public_no is null;

-- A new cohort takes the next public number.
create or replace function app.assign_public_no() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.public_no is null and new.name not ilike 'founders%' then
    new.public_no := greatest((select coalesce(max(public_no),0) from public.cohorts), (select coalesce(max(public_no),0) from public.historical_cohorts)) + 1;
  end if;
  return new;
end $$;
drop trigger if exists cohort_public_no on public.cohorts;
create trigger cohort_public_no before insert on public.cohorts for each row execute function app.assign_public_no();
