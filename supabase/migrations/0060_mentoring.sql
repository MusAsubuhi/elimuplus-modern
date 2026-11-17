-- Mentoring: applications arrive from the website, founders vet them, vetted mentors lead small circles tied to a cohort,
-- each circle meets, records commitments, and everyone answers a short form after a session so the next one improves.
-- Privacy: mentees' feedback rows are private to the person who wrote them; mentors and founders only ever see totals
-- (and only once at least three people have answered). Meeting notes are visible to the mentor and the founders only.

-- 1. The website mentor form lands in the same queue as the other website forms, and "mentor" becomes a sign-in role.
alter table public.web_enquiries drop constraint if exists web_enquiries_kind_check;
alter table public.web_enquiries add constraint web_enquiries_kind_check check (kind in ('trainer','organisation','partner','quote','mentor'));
alter table public.role_assignments drop constraint if exists role_assignments_role_check;
alter table public.role_assignments add constraint role_assignments_role_check
  check (role in ('participant','facilitator','trainer_candidate','org_admin','org_viewer','founder','staff','mentor'));

-- 2. Mentors. A row exists from the moment a founder moves an application into vetting; the sign-in is created only on activation.
create table if not exists public.mentors (
  id uuid primary key default gen_random_uuid(),
  person_id uuid unique references public.people(id) on delete set null,
  enquiry_id uuid references public.web_enquiries(id) on delete set null,
  full_name text not null,
  phone text,
  email text,
  county text,
  occupation text,
  serves text not null default 'both' check (serves in ('youth','caregivers','both')),
  languages text[] not null default '{}',
  hours_per_month int check (hours_per_month is null or hours_per_month between 1 and 80),
  background text,
  motivation text,
  referee_name text,
  referee_phone text,
  status text not null default 'vetting' check (status in ('vetting','active','paused','declined','ended')),
  interview_on date,
  referee_on date,
  briefing_on date,
  agreement_on date,
  vetting_note text,
  decided_by uuid references public.people(id) on delete set null,
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  safeguarding_ok boolean generated always as (briefing_on is not null and agreement_on is not null) stored,
  check (status <> 'active' or (person_id is not null and interview_on is not null and referee_on is not null and briefing_on is not null and agreement_on is not null))
);
create index if not exists mentors_status on public.mentors(status);

-- 3. Circles, one mentor and up to five people from one cohort.
create table if not exists public.mentoring_circles (
  id uuid primary key default gen_random_uuid(),
  cohort_id uuid not null references public.cohorts(id) on delete cascade,
  mentor_id uuid not null references public.mentors(id) on delete restrict,
  name text not null,
  focus text not null default 'business' check (focus in ('business','employability','mixed')),
  status text not null default 'planned' check (status in ('planned','active','closed')),
  start_date date,
  end_date date,
  place text,
  has_minors boolean not null default false,
  partner_rep_name text,
  partner_rep_phone text,
  created_by uuid references public.people(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (cohort_id, name)
);
create index if not exists circles_mentor on public.mentoring_circles(mentor_id);
create index if not exists circles_cohort on public.mentoring_circles(cohort_id);

create table if not exists public.circle_members (
  circle_id uuid not null references public.mentoring_circles(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  status text not null default 'active' check (status in ('active','left')),
  joined_on date not null default current_date,
  left_on date,
  primary key (circle_id, person_id)
);
create index if not exists circle_members_person on public.circle_members(person_id) where status = 'active';

create table if not exists public.circle_meetings (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.mentoring_circles(id) on delete cascade,
  held_on date not null,
  minutes int not null default 60 check (minutes between 15 and 480),
  place text,
  topic text,
  status text not null default 'planned' check (status in ('planned','held','cancelled')),
  logged_by uuid references public.people(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists circle_meetings_circle on public.circle_meetings(circle_id, held_on desc);

-- Notes the mentor writes for themselves and the founders. Mentees never see them.
create table if not exists public.circle_meeting_notes (
  meeting_id uuid primary key references public.circle_meetings(id) on delete cascade,
  notes text,
  concern boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.circle_attendance (
  meeting_id uuid not null references public.circle_meetings(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  attended boolean not null default false,
  primary key (meeting_id, person_id)
);

create table if not exists public.circle_commitments (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.circle_meetings(id) on delete cascade,
  circle_id uuid not null references public.mentoring_circles(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  text text not null check (length(text) between 3 and 300),
  due_on date,
  done boolean not null default false,
  done_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists circle_commitments_person on public.circle_commitments(person_id, done);

-- The short form after a session. Mentee rows are choice-only; the mentor's row also holds their own reflection.
create table if not exists public.mentoring_feedback (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.circle_meetings(id) on delete cascade,
  circle_id uuid not null references public.mentoring_circles(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  role text not null check (role in ('mentee','mentor')),
  usefulness int not null check (usefulness between 1 and 5),
  next_step_clear int check (next_step_clear between 1 and 5),
  pace text check (pace in ('too_slow','right','too_fast')),
  improve text[] not null default '{}',
  went_well text check (length(went_well) <= 500),
  to_improve text check (length(to_improve) <= 500),
  created_at timestamptz not null default now(),
  unique (meeting_id, person_id),
  check (role = 'mentor' or (went_well is null and to_improve is null))
);

-- 4. Helpers (security definer, so policies can read across these tables without recursion).
create or replace function app.my_mentor_id() returns uuid language sql stable security definer set search_path = public as $$
  select id from public.mentors where person_id = app.me() and status = 'active' limit 1
$$;
create or replace function app.my_circles() returns setof uuid language sql stable security definer set search_path = public as $$
  select c.id from public.mentoring_circles c where c.mentor_id = app.my_mentor_id()
  union
  select m.circle_id from public.circle_members m where m.person_id = app.me() and m.status = 'active'
$$;
create or replace function app.i_mentor_circle(c uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.mentoring_circles x where x.id = c and x.mentor_id = app.my_mentor_id()) or app.is_founder()
$$;
create or replace function app.is_minor(p uuid) returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((extract(year from (now() at time zone 'Africa/Nairobi'))::int - (select birth_year from public.people where id = p)) < 18, false)
$$;

-- 5. Row level security.
alter table public.mentors enable row level security;
create policy mentors_read on public.mentors for select using (app.is_founder() or person_id = app.me());
create policy mentors_write on public.mentors for all using (app.is_founder()) with check (app.is_founder());

alter table public.mentoring_circles enable row level security;
create policy circles_read on public.mentoring_circles for select using (
  app.is_founder() or id in (select app.my_circles())
  or cohort_id in (select id from public.cohorts where organisation_id in (select app.my_orgs())));
create policy circles_write on public.mentoring_circles for all using (app.is_founder()) with check (app.is_founder());

alter table public.circle_members enable row level security;
create policy cm_read on public.circle_members for select using (app.is_founder() or person_id = app.me() or app.i_mentor_circle(circle_id));
create policy cm_write on public.circle_members for all using (app.is_founder()) with check (app.is_founder());

alter table public.circle_meetings enable row level security;
create policy mt_read on public.circle_meetings for select using (app.is_founder() or circle_id in (select app.my_circles()));
create policy mt_write on public.circle_meetings for all using (app.i_mentor_circle(circle_id)) with check (app.i_mentor_circle(circle_id));

alter table public.circle_meeting_notes enable row level security;
create policy mn_all on public.circle_meeting_notes for all
  using (exists (select 1 from public.circle_meetings m where m.id = meeting_id and app.i_mentor_circle(m.circle_id)))
  with check (exists (select 1 from public.circle_meetings m where m.id = meeting_id and app.i_mentor_circle(m.circle_id)));

alter table public.circle_attendance enable row level security;
create policy ca_read on public.circle_attendance for select using (
  person_id = app.me() or exists (select 1 from public.circle_meetings m where m.id = meeting_id and app.i_mentor_circle(m.circle_id)));
create policy ca_write on public.circle_attendance for all
  using (exists (select 1 from public.circle_meetings m where m.id = meeting_id and app.i_mentor_circle(m.circle_id)))
  with check (exists (select 1 from public.circle_meetings m where m.id = meeting_id and app.i_mentor_circle(m.circle_id)));

alter table public.circle_commitments enable row level security;
create policy cc_read on public.circle_commitments for select using (person_id = app.me() or app.i_mentor_circle(circle_id));
create policy cc_insert on public.circle_commitments for insert with check (app.i_mentor_circle(circle_id));
create policy cc_update on public.circle_commitments for update using (person_id = app.me() or app.i_mentor_circle(circle_id)) with check (person_id = app.me() or app.i_mentor_circle(circle_id));
create policy cc_delete on public.circle_commitments for delete using (app.i_mentor_circle(circle_id));

alter table public.mentoring_feedback enable row level security;
-- Own row only. Founders read mentors' own reflections, never what mentees wrote.
create policy mf_read on public.mentoring_feedback for select using (person_id = app.me() or (role = 'mentor' and app.is_founder()));
create policy mf_insert on public.mentoring_feedback for insert with check (person_id = app.me() and circle_id in (select app.my_circles()));

grant select, insert, update, delete on public.mentors, public.mentoring_circles, public.circle_members, public.circle_meetings,
  public.circle_meeting_notes, public.circle_attendance, public.circle_commitments to authenticated;
grant select, insert on public.mentoring_feedback to authenticated;

-- 6. Safeguarding and integrity guards, in the database so no page can skip them.
create or replace function app.guard_circle() returns trigger language plpgsql security definer set search_path = public as $$
declare m public.mentors%rowtype;
begin
  select * into m from public.mentors where id = new.mentor_id;
  if m.status <> 'active' or m.safeguarding_ok is not true then
    raise exception 'The mentor must be an active, vetted mentor who has agreed to the safeguarding rules';
  end if;
  if new.status = 'active' and new.has_minors and coalesce(new.partner_rep_name, '') = '' then
    raise exception 'A circle that includes anyone under 18 needs the partner representative who will be present';
  end if;
  return new;
end $$;
drop trigger if exists circle_guard on public.mentoring_circles;
create trigger circle_guard before insert or update on public.mentoring_circles for each row execute function app.guard_circle();

create or replace function app.guard_member() returns trigger language plpgsql security definer set search_path = public as $$
declare c public.mentoring_circles%rowtype; mp uuid; n int;
begin
  select * into c from public.mentoring_circles where id = new.circle_id;
  select person_id into mp from public.mentors where id = c.mentor_id;
  if new.person_id = mp then raise exception 'A mentor cannot also be a member of their own circle'; end if;
  if new.status = 'active' then
    if not exists (select 1 from public.enrolments e where e.cohort_id = c.cohort_id and e.person_id = new.person_id and e.status <> 'dropped') then
      raise exception 'Only people enrolled in this circle''s cohort can join it';
    end if;
    select count(*) into n from public.circle_members m where m.circle_id = new.circle_id and m.status = 'active' and m.person_id <> new.person_id;
    if n >= 5 then raise exception 'A circle holds at most five people'; end if;
    if app.is_minor(new.person_id) then
      if not exists (select 1 from public.enrolments e where e.cohort_id = c.cohort_id and e.person_id = new.person_id and e.guardian_consent) then
        raise exception 'Someone under 18 can join only once a guardian''s agreement is recorded';
      end if;
      if coalesce(c.partner_rep_name, '') = '' then
        raise exception 'Add the partner representative who will be present before adding someone under 18';
      end if;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists member_guard on public.circle_members;
create trigger member_guard before insert or update on public.circle_members for each row execute function app.guard_member();

create or replace function app.sync_circle_minors() returns trigger language plpgsql security definer set search_path = public as $$
declare cid uuid := coalesce(new.circle_id, old.circle_id);
begin
  update public.mentoring_circles set has_minors = exists (select 1 from public.circle_members m where m.circle_id = cid and m.status = 'active' and app.is_minor(m.person_id)) where id = cid;
  return null;
end $$;
drop trigger if exists member_minors on public.circle_members;
create trigger member_minors after insert or update or delete on public.circle_members for each row execute function app.sync_circle_minors();

-- A person may tick off their own commitment but change nothing else about it.
create or replace function app.guard_commitment() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if app.i_mentor_circle(old.circle_id) then return new; end if;
  if new.text is distinct from old.text or new.person_id is distinct from old.person_id or new.meeting_id is distinct from old.meeting_id
     or new.circle_id is distinct from old.circle_id or new.due_on is distinct from old.due_on then
    raise exception 'You can only mark your own commitment done';
  end if;
  new.done_at := case when new.done then coalesce(old.done_at, now()) else null end;
  return new;
end $$;
drop trigger if exists commitment_guard on public.circle_commitments;
create trigger commitment_guard before update on public.circle_commitments for each row execute function app.guard_commitment();

create or replace function app.guard_meeting() returns trigger language plpgsql as $$
begin
  if new.status = 'held' and new.held_on > (now() at time zone 'Africa/Nairobi')::date then
    raise exception 'A session can be recorded as held only on or after its date';
  end if;
  return new;
end $$;
drop trigger if exists meeting_guard on public.circle_meetings;
create trigger meeting_guard before insert or update on public.circle_meetings for each row execute function app.guard_meeting();

-- Feedback only for a session that was held, from someone who belongs to that circle, in the right role.
create or replace function app.guard_feedback() returns trigger language plpgsql security definer set search_path = public as $$
declare m public.circle_meetings%rowtype; is_mentor boolean;
begin
  select * into m from public.circle_meetings where id = new.meeting_id;
  if m.status <> 'held' then raise exception 'Feedback opens once the session has been recorded'; end if;
  new.circle_id := m.circle_id;
  is_mentor := exists (select 1 from public.mentoring_circles c where c.id = m.circle_id and c.mentor_id = app.my_mentor_id());
  new.role := case when is_mentor then 'mentor' else 'mentee' end;
  if new.role = 'mentee' and not exists (select 1 from public.circle_members x where x.circle_id = m.circle_id and x.person_id = new.person_id and x.status = 'active') then
    raise exception 'Only members of this circle can answer';
  end if;
  return new;
end $$;
drop trigger if exists feedback_guard on public.mentoring_feedback;
create trigger feedback_guard before insert on public.mentoring_feedback for each row execute function app.guard_feedback();

-- 7. Totals. Founders see the whole picture; a mentor sees their own circle's totals. Groups under three answers are hidden.
create or replace function app.circle_feedback(c uuid) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare out jsonb;
begin
  if not app.i_mentor_circle(c) then raise exception 'not allowed'; end if;
  select case when count(*) < 3 then jsonb_build_object('n', count(*)::int, 'hidden', true) else jsonb_build_object(
      'n', count(*)::int, 'hidden', false,
      'usefulness', round(avg(usefulness), 2), 'next_step_clear', round(avg(next_step_clear), 2),
      'pace', jsonb_build_object('too_slow', count(*) filter (where pace = 'too_slow'), 'right', count(*) filter (where pace = 'right'), 'too_fast', count(*) filter (where pace = 'too_fast')),
      'improve', coalesce((select jsonb_object_agg(v, k) from (select v, count(*)::int k from public.mentoring_feedback f2, unnest(f2.improve) v where f2.circle_id = c and f2.role = 'mentee' group by v) x), '{}'::jsonb)) end
  into out from public.mentoring_feedback where circle_id = c and role = 'mentee';
  return out;
end $$;
grant execute on function app.circle_feedback(uuid) to authenticated;

create or replace function app.circle_roster(c uuid) returns table(person_id uuid, name text, role text)
language sql stable security definer set search_path = public as $$
  select p.id, case when app.i_mentor_circle(c) then p.full_name else split_part(coalesce(p.display_name, p.full_name), ' ', 1) end, 'mentee'::text
    from public.circle_members m join public.people p on p.id = m.person_id
    where m.circle_id = c and m.status = 'active' and (app.i_mentor_circle(c) or c in (select app.my_circles()))
  union all
  select p.id, p.full_name, 'mentor'::text
    from public.mentoring_circles x join public.mentors mm on mm.id = x.mentor_id join public.people p on p.id = mm.person_id
    where x.id = c and (app.i_mentor_circle(c) or c in (select app.my_circles()))
$$;
grant execute on function app.circle_roster(uuid) to authenticated;

create or replace function app.mentoring_summary() returns jsonb language plpgsql stable security definer set search_path = public as $$
declare out jsonb;
begin
  if not app.is_founder() then raise exception 'founders only'; end if;
  with fb as (select * from public.mentoring_feedback where role = 'mentee'),
  fbs as (select count(*)::int n, round(avg(usefulness), 2) usefulness, round(avg(next_step_clear), 2) clear,
            count(*) filter (where pace = 'too_slow')::int slow, count(*) filter (where pace = 'right')::int righ, count(*) filter (where pace = 'too_fast')::int fast from fb),
  imp as (select v, count(*)::int k from fb, unnest(improve) v group by v),
  held as (select m.* from public.circle_meetings m where m.status = 'held'),
  att as (select count(*)::int total, count(*) filter (where a.attended)::int came from public.circle_attendance a join held h on h.id = a.meeting_id),
  per as (
    select c.id, c.name, c.status, c.focus, c.start_date, co.name cohort_name, mm.full_name mentor_name,
      (select count(*)::int from public.circle_members x where x.circle_id = c.id and x.status = 'active') members,
      (select count(*)::int from held h where h.circle_id = c.id) meetings,
      (select max(h.held_on) from held h where h.circle_id = c.id) last_held,
      (select count(*)::int from fb f where f.circle_id = c.id) answers,
      (select case when count(*) >= 3 then round(avg(f.usefulness), 2) end from fb f where f.circle_id = c.id) usefulness
    from public.mentoring_circles c join public.cohorts co on co.id = c.cohort_id join public.mentors mm on mm.id = c.mentor_id
  )
  select jsonb_build_object(
    'mentors', jsonb_build_object('active', (select count(*)::int from public.mentors where status = 'active'), 'vetting', (select count(*)::int from public.mentors where status = 'vetting'),
      'applications', (select count(*)::int from public.web_enquiries where kind = 'mentor' and status = 'new')),
    'circles', jsonb_build_object('planned', (select count(*)::int from public.mentoring_circles where status = 'planned'), 'active', (select count(*)::int from public.mentoring_circles where status = 'active'), 'closed', (select count(*)::int from public.mentoring_circles where status = 'closed')),
    'people', (select count(distinct person_id)::int from public.circle_members where status = 'active'),
    'meetings', (select count(*)::int from held),
    'hours', (select round(coalesce(sum(minutes), 0) / 60.0, 1) from held),
    'attendance', (select case when total > 0 then round(100.0 * came / total) end from att),
    'commitments', (select jsonb_build_object('total', count(*)::int, 'done', count(*) filter (where done)::int) from public.circle_commitments),
    'feedback', (select case when n < 3 then jsonb_build_object('n', n, 'hidden', true) else jsonb_build_object('n', n, 'hidden', false, 'usefulness', usefulness, 'next_step_clear', clear,
        'pace', jsonb_build_object('too_slow', slow, 'right', righ, 'too_fast', fast),
        'improve', coalesce((select jsonb_object_agg(v, k) from imp), '{}'::jsonb)) end from fbs),
    'by_circle', coalesce((select jsonb_agg(to_jsonb(p) order by p.start_date desc nulls last) from per p), '[]'::jsonb)
  ) into out;
  return out;
end $$;
grant execute on function app.mentoring_summary() to authenticated;

-- 8. Public figures (server-side only, never granted): counts, with small groups hidden.
create or replace function app.public_mentoring() returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'circles', (select count(*)::int from public.mentoring_circles where status in ('active','closed')),
    'meetings', (select count(*)::int from public.circle_meetings where status = 'held'),
    'people', (select case when count(distinct person_id) >= 5 then count(distinct person_id)::int end from public.circle_members m join public.mentoring_circles c on c.id = m.circle_id where c.status in ('active','closed')))
$$;
revoke all on function app.public_mentoring() from public, anon, authenticated;
