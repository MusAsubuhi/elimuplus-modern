-- 0023: participant stories and photos, collected through the portal with consent. Safe to run twice.
-- A story belongs to one enrolment. It can be written by the participant or collected by a trainer.
-- Consent is copied onto the story when it is saved, and nothing can be approved or shared without it.

create table if not exists public.participant_stories (
  id uuid primary key default gen_random_uuid(),
  enrolment_id uuid not null references public.enrolments(id) on delete restrict,
  person_id uuid not null references public.people(id) on delete restrict,
  cohort_id uuid not null references public.cohorts(id) on delete restrict,
  title text,
  body text not null check (length(trim(body)) >= 20),
  quote text,
  language text not null default 'sw' check (language in ('sw', 'en', 'mixed')),
  themes text[] not null default '{}',
  source text not null default 'self' check (source in ('self', 'trainer', 'followup')),
  collected_by uuid references public.people(id),
  consent_story text not null check (consent_story in ('named', 'anonymous')),
  consent_photo boolean not null default false,
  consent_guardian boolean not null default false,
  consent_at timestamptz not null default now(),
  shown_name text,
  status text not null default 'submitted' check (status in ('submitted', 'approved', 'published', 'declined', 'withdrawn')),
  review_note text,
  reviewed_by uuid references public.people(id),
  reviewed_at timestamptz,
  published_on date,
  social_idea_id uuid references public.social_ideas(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
create index if not exists participant_stories_cohort on public.participant_stories (cohort_id, status);
create index if not exists participant_stories_person on public.participant_stories (person_id);
create index if not exists participant_stories_enrolment on public.participant_stories (enrolment_id);

create table if not exists public.story_photos (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.participant_stories(id) on delete restrict,
  storage_path text not null unique,
  caption text,
  cover boolean not null default false,
  width int,
  height int,
  bytes int,
  uploaded_by uuid references public.people(id),
  created_at timestamptz not null default now()
);
create index if not exists story_photos_story on public.story_photos (story_id);

-- The database enforces what the pages promise.
create or replace function app.guard_story() returns trigger language plpgsql security definer set search_path = public as $$
declare born int;
begin
  select birth_year into born from public.people where id = new.person_id;
  if born is not null and extract(year from current_date)::int - born < 18 and not new.consent_guardian then
    raise exception 'A guardian must agree before a story from someone under 18 is saved';
  end if;
  -- people using the portal cannot rewrite the review, the introduction line or the consent that was recorded
  if auth.uid() is not null and not app.is_staff() then
    if tg_op = 'INSERT' then
      if new.status <> 'submitted' or new.reviewed_by is not null or new.shown_name is not null or new.published_on is not null then
        raise exception 'New stories start as submitted';
      end if;
    else
      if new.reviewed_by is distinct from old.reviewed_by or new.reviewed_at is distinct from old.reviewed_at
         or new.shown_name is distinct from old.shown_name or new.published_on is distinct from old.published_on
         or new.review_note is distinct from old.review_note or new.person_id <> old.person_id or new.enrolment_id <> old.enrolment_id
         or new.consent_story is distinct from old.consent_story or new.consent_photo is distinct from old.consent_photo
         or new.consent_guardian is distinct from old.consent_guardian then
        raise exception 'Only founders can change the review or the consent record';
      end if;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists guard_story on public.participant_stories;
create trigger guard_story before insert or update on public.participant_stories for each row execute function app.guard_story();
drop trigger if exists touch_updated_at on public.participant_stories;
create trigger touch_updated_at before update on public.participant_stories for each row execute function app.touch_updated_at();

create or replace function app.guard_story_photo() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not (select consent_photo from public.participant_stories where id = new.story_id) then
    raise exception 'Photo consent is not on file for this story';
  end if;
  if (select count(*) from public.story_photos where story_id = new.story_id) >= 4 then
    raise exception 'A story can have up to four photos';
  end if;
  return new;
end $$;
drop trigger if exists guard_story_photo on public.story_photos;
create trigger guard_story_photo before insert on public.story_photos for each row execute function app.guard_story_photo();

alter table public.participant_stories enable row level security;
alter table public.story_photos enable row level security;

-- Who can read: the person, their trainers, founders and master trainers. A partner sees only approved or published stories of its own cohorts.
drop policy if exists st_read on public.participant_stories;
create policy st_read on public.participant_stories for select to authenticated using (
  person_id = app.me() or app.is_staff() or cohort_id in (select app.my_cohorts()) or app.is_master_trainer()
  or (status in ('approved', 'published') and cohort_id in (select app.cohorts_of_my_orgs())));

drop policy if exists st_insert on public.participant_stories;
create policy st_insert on public.participant_stories for insert to authenticated with check (
  app.is_staff()
  or (person_id = app.me() and source = 'self' and collected_by = app.me() and enrolment_id in (select app.my_enrolments()))
  or (collected_by = app.me() and source in ('trainer', 'followup') and enrolment_id in (select app.my_cohort_enrolments())));

drop policy if exists st_update on public.participant_stories;
create policy st_update on public.participant_stories for update to authenticated using (
  app.is_staff() or person_id = app.me() or cohort_id in (select app.my_cohorts())
) with check (
  app.is_staff() or status in ('submitted', 'withdrawn'));

-- Photos follow the story: whoever can read the story can read its photo rows. Files are written by the server only.
drop policy if exists sp_read on public.story_photos;
create policy sp_read on public.story_photos for select to authenticated using (
  exists (select 1 from public.participant_stories s where s.id = story_id));

grant select, insert, update on public.participant_stories to authenticated;
grant select on public.story_photos to authenticated;

-- Private bucket: nobody reads it directly. The portal signs short-lived links after checking the rules above.
do $$ begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('story-photos', 'story-photos', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
  end if;
end $$;
