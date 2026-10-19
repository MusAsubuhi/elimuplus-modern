-- 0022: hardening from the October 2026 database review. Safe to run twice. Nothing here deletes data.
-- Other ventures that share the project (the Angaza tables, contacts, the contact-photos bucket) are deliberately left untouched.

-- 1. One person per email (the partner preview had created the same stand-in twice) and per phone number.
update public.people set email = regexp_replace(email, '@', '+dup' || substr(id::text, 1, 6) || '@')
where email like 'preview-%@preview.elimuplus.invalid'
  and id <> (select p2.id from public.people p2 where lower(p2.email) = lower(public.people.email) order by p2.created_at, p2.id limit 1);
create unique index if not exists people_email_uq on public.people (lower(email)) where email is not null and email <> '';
-- Phones are compared on their last nine digits, so 0712 345 678 and +254712345678 are the same person.
create unique index if not exists people_phone_uq on public.people (right(regexp_replace(phone, '\D', '', 'g'), 9))
  where phone is not null and length(regexp_replace(phone, '\D', '', 'g')) >= 9;

-- 2. Evidence and money can no longer be removed by a cascade. Deleting a person, an enrolment or an invoice must be done on purpose.
do $$
declare r record;
begin
  for r in
    select c.conrelid::regclass::text as tbl, c.conname, pg_get_constraintdef(c.oid) as def
    from pg_constraint c
    where c.contype = 'f' and c.confdeltype = 'c' and c.connamespace = 'public'::regnamespace
      and c.confrelid in ('public.people'::regclass, 'public.invoices'::regclass, 'public.enrolments'::regclass)
      and c.conrelid::regclass::text not in ('alert_reads', 'person_features')
  loop
    execute format('alter table %s drop constraint %I, add constraint %I %s',
      r.tbl, r.conname, r.conname, replace(r.def, 'ON DELETE CASCADE', 'ON DELETE RESTRICT'));
  end loop;
end $$;

-- 3. When was it recorded? Existing rows stay empty (we do not invent a time); new rows are stamped.
do $$
declare t text;
begin
  foreach t in array array['enrolments','attendance','payments','certifications','role_assignments','quote_lines','trainer_payments',
      'support_ledger','followup_schedule','followup_visits','qa_visits','sessions','canvases','directory_listings','participant_certificates',
      'readiness_checks','cohort_facilitators','agreements','day_summaries','social_posts']
  loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I add column if not exists created_at timestamptz', t);
      execute format('alter table public.%I alter column created_at set default now()', t);
    end if;
  end loop;
  foreach t in array array['people','enrolments','cohorts','organisations','invoices','quotes','payments']
  loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I add column if not exists updated_at timestamptz', t);
    end if;
  end loop;
end $$;

create or replace function app.touch_updated_at() returns trigger language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end $$;

do $$
declare t text;
begin
  foreach t in array array['people','enrolments','cohorts','organisations','invoices','quotes','payments']
  loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists touch_updated_at on public.%I', t);
      execute format('create trigger touch_updated_at before update on public.%I for each row execute function app.touch_updated_at()', t);
    end if;
  end loop;
end $$;

-- 4. Index every foreign key that lacks one (joins and deletes stay fast as the data grows).
do $$
declare r record; n int := 0;
begin
  for r in
    select c.conrelid::regclass::text as tbl, a.attname as col, c.conname
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f' and c.connamespace = 'public'::regnamespace and array_length(c.conkey, 1) = 1
      and c.conrelid::regclass::text not in ('angaza_social_posts', 'angaza_social_snapshots', 'contacts')
      and not exists (select 1 from pg_index i where i.indrelid = c.conrelid and i.indkey[0] = c.conkey[1])
  loop
    execute format('create index if not exists %I on public.%I (%I)', left('fk_' || r.tbl || '_' || r.col, 63), r.tbl, r.col);
    n := n + 1;
  end loop;
  raise notice 'foreign key indexes added: %', n;
end $$;

-- 5. Helper functions get a fixed search path; the auto-RLS event function is no longer callable through the API.
alter function app.to_int(text) set search_path = pg_catalog, public;
alter function app.code(text) set search_path = pg_catalog, public;
alter function app.tally(text[]) set search_path = pg_catalog, public;
do $$ begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end $$;

-- 6. Policies apply to signed-in users only. The portal never reads data as an anonymous visitor
--    (public pages use the server's own connection), and this also removes most "multiple permissive policy" warnings.
--    Inside the same pass, auth.uid() is wrapped so it is evaluated once per query and not once per row.
do $$
declare r record; q text; w text;
begin
  for r in select schemaname, tablename, policyname, qual, with_check from pg_policies
           where schemaname = 'public' and tablename not in ('angaza_social_posts', 'angaza_social_snapshots', 'contacts', 'user_roles')
  loop
    execute format('alter policy %I on public.%I to authenticated', r.policyname, r.tablename);
    if coalesce(r.qual, '') ~ 'auth\.uid\(\)' and r.qual !~* 'select auth\.uid' then
      execute format('alter policy %I on public.%I using (%s)', r.policyname, r.tablename, replace(r.qual, 'auth.uid()', '(select auth.uid())'));
    end if;
    if coalesce(r.with_check, '') ~ 'auth\.uid\(\)' and r.with_check !~* 'select auth\.uid' then
      execute format('alter policy %I on public.%I with check (%s)', r.policyname, r.tablename, replace(r.with_check, 'auth.uid()', '(select auth.uid())'));
    end if;
  end loop;
end $$;

-- 7. Erasing a participant on request (Data Protection Act): personal details go, the programme's anonymous numbers stay.
--    Founders only. Returns the login id and photo paths so the portal can remove them from sign-in and storage.
create or replace function app.erase_person(p uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare old_auth uuid; old_name text; paths text[] := '{}'; n_enrol int;
begin
  if not app.is_founder() then raise exception 'Only founders can erase a person'; end if;
  if exists (select 1 from role_assignments where person_id = p and role in ('founder', 'staff', 'facilitator', 'org_admin', 'org_viewer')) then
    raise exception 'This person has a team or partner role. Erase participants only.';
  end if;
  select auth_user_id, coalesce(display_name, full_name) into old_auth, old_name from people where id = p;
  if not found then raise exception 'No such person'; end if;

  if to_regclass('public.story_photos') is not null then
    execute 'select coalesce(array_agg(sp.storage_path), ''{}'') from story_photos sp join participant_stories s on s.id = sp.story_id where s.person_id = $1' into paths using p;
    execute 'delete from story_photos where story_id in (select id from participant_stories where person_id = $1)' using p;
    execute $q$update participant_stories set title = null, body = '[removed at the person''s request]', quote = null, status = 'withdrawn', shown_name = null where person_id = $1$q$ using p;
  end if;

  update followup_forms set participant_name = 'Removed', participant_phone = null, challenge_words = null, answers = '{}'::jsonb
    where enrolment_id in (select id from enrolments where person_id = p);
  update youth_followups set participant_name = 'Removed', participant_phone = null, challenge_words = null, answers = '{}'::jsonb
    where enrolment_id in (select id from enrolments where person_id = p);
  update baselines set hope_words = null, main_challenge = null, answers = '{}'::jsonb
    where enrolment_id in (select id from enrolments where person_id = p);
  update exit_feedback set most_useful = null, least_useful = null, change_suggestion = null, first_step = null, concern_note = null, answers = '{}'::jsonb
    where enrolment_id in (select id from enrolments where person_id = p);
  update cohort_roster set full_name = 'Removed', phone = null, birth_year = null, gender = null
    where enrolment_id in (select id from enrolments where person_id = p);
  update day_summary_names set name = 'Removed participant'
    where name = old_name and cohort_id in (select cohort_id from enrolments where person_id = p);
  delete from directory_listings where enrolment_id in (select id from enrolments where person_id = p);
  update enrolments set guardian_name = null, guardian_phone = null, story_consent = 'none', photo_consent = false, exit_note = null
    where person_id = p;
  get diagnostics n_enrol = row_count;
  update people set full_name = 'Removed participant', display_name = 'Removed participant', phone = null, email = null, birth_year = null,
    gender = null, has_disability = null, occupation = null, education_level = null, county = null, ward = null,
    auth_user_id = null, status = 'archived'
    where id = p;
  -- the newsletter column exists only where the newsletter sync migration has been applied
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'people' and column_name = 'newsletter_consent') then
    execute 'update people set newsletter_consent = false where id = $1' using p;
  end if;
  update role_assignments set status = 'ended', end_date = coalesce(end_date, current_date) where person_id = p;
  return jsonb_build_object('auth_user_id', old_auth, 'photo_paths', to_jsonb(paths), 'enrolments', n_enrol);
end $$;
revoke execute on function app.erase_person(uuid) from public, anon;
grant execute on function app.erase_person(uuid) to authenticated;
