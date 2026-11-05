-- Session photos: at most one per training day and five per cohort, taken from behind or at a distance (no written consent from
-- participants), held back until a founder approves them. Partners see approved photos of their own cohorts only.
create table if not exists public.session_photos (
  id uuid primary key default gen_random_uuid(),
  cohort_id uuid not null references public.cohorts(id) on delete cascade,
  day_number int not null check (day_number between 1 and 12),
  storage_path text not null unique,
  caption text,
  status text not null default 'pending' check (status in ('pending','approved')),
  behind_confirmed boolean not null default false check (behind_confirmed),
  width int, height int, bytes int,
  uploaded_by uuid references public.people(id),
  approved_by uuid references public.people(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (cohort_id, day_number)
);
create index if not exists session_photos_cohort on public.session_photos(cohort_id, status);

create or replace function app.guard_session_photos() returns trigger language plpgsql as $$
begin
  if (select count(*) from public.session_photos where cohort_id = new.cohort_id) >= 5 then
    raise exception 'A cohort can have at most five session photos';
  end if;
  return new;
end $$;
drop trigger if exists session_photos_max on public.session_photos;
create trigger session_photos_max before insert on public.session_photos for each row execute function app.guard_session_photos();

alter table public.session_photos enable row level security;
-- Cohort visibility already follows the organisation, so a partner only reaches its own cohorts; pending photos stay with the
-- uploader, the cohort's trainers and the founders.
drop policy if exists sph_read on public.session_photos;
create policy sph_read on public.session_photos for select to authenticated using (
  exists (select 1 from public.cohorts c where c.id = cohort_id)
  and (status = 'approved' or app.is_staff() or uploaded_by = app.me() or cohort_id in (select app.my_cohorts()) or app.is_master_trainer()));
grant select on public.session_photos to authenticated;

do $$ begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('session-photos', 'session-photos', false, 2097152, array['image/jpeg'])
    on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
  end if;
end $$;
