-- 0007: facilitator levels (Trainee = tier 0), supervision, training day reports,
-- a CRM layer (calls, visits, venue readiness checks), requests linked to cohorts,
-- and founder alerts so no feedback goes unseen.

-- ---------- levels: tier 0 is the Trainee Facilitator ----------
alter table public.role_assignments drop constraint if exists role_assignments_tier_check;
alter table public.role_assignments add constraint role_assignments_tier_check check (tier between 0 and 4);
alter table public.invitations drop constraint if exists invitations_tier_check;
alter table public.invitations add constraint invitations_tier_check check (tier between 0 and 4);

-- who supervises whom: day reports from a trainee or associate go to their supervisor first
create table if not exists public.supervision (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id) on delete cascade,
  supervisor_id uuid not null references public.people(id),
  since date not null default current_date,
  status text not null default 'active' check (status in ('active','ended')),
  created_at timestamptz not null default now(),
  check (person_id <> supervisor_id)
);
create unique index if not exists supervision_one_active on public.supervision(person_id) where status = 'active';
alter table public.supervision enable row level security;

create or replace function app.supervises(p uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.supervision where person_id = p and supervisor_id = app.me() and status = 'active')
$$;
create policy sup_read on public.supervision for select using (
  person_id = app.me() or supervisor_id = app.me() or app.is_staff() or app.is_master_trainer());
create policy sup_write on public.supervision for all using (app.is_staff()) with check (app.is_staff());
grant select, insert, update, delete on public.supervision to authenticated;

-- ---------- training day reports (depth depends on the author's level) ----------
create table if not exists public.day_reports (
  id uuid primary key default gen_random_uuid(),
  author_id uuid references public.people(id),
  form_respondent text,                       -- name and phone as typed on a Google Form when no account matched
  cohort_id uuid references public.cohorts(id),
  level int not null check (level between 0 and 4),
  kind text not null default 'day' check (kind in ('day','qa')),
  phase text not null default 'training' check (phase in ('training','followup_30','followup_60','followup_90','other')),
  report_date date not null default current_date,
  day_number int,
  headcount int,
  concern text not null default 'none' check (concern in ('none','watch','urgent')),
  concern_note text,
  answers jsonb not null default '{}'::jsonb,
  routed_to uuid references public.people(id),
  source text not null default 'portal' check (source in ('portal','google_form')),
  status text not null default 'submitted' check (status in ('submitted','seen','actioned')),
  seen_by uuid references public.people(id),
  seen_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  check (author_id is not null or form_respondent is not null)
);
create index if not exists day_reports_cohort on public.day_reports(cohort_id);
create index if not exists day_reports_routed on public.day_reports(routed_to) where status = 'submitted';
alter table public.day_reports enable row level security;

create policy dr_read on public.day_reports for select using (
  author_id = app.me() or routed_to = app.me() or app.is_staff() or app.is_master_trainer() or app.supervises(author_id));
create policy dr_insert on public.day_reports for insert with check (
  author_id = app.me() and source = 'portal' and status = 'submitted' and (app.has_role('facilitator') or app.is_staff()));
create policy dr_review on public.day_reports for update using (
  app.is_staff() or routed_to = app.me() or app.supervises(author_id) or app.is_master_trainer())
  with check (app.is_staff() or routed_to = app.me() or app.supervises(author_id) or app.is_master_trainer());
grant select, insert, update, delete on public.day_reports to authenticated;

-- ---------- requests link to the training or follow-up they belong to ----------
alter table public.expense_requests
  add column if not exists purpose text not null default 'training'
    check (purpose in ('training','followup_30','followup_60','followup_90','other'));

-- ---------- CRM: every organisation and person is called and checked before anything is confirmed ----------
alter table public.organisations
  add column if not exists venue_name text,
  add column if not exists venue_capacity int,
  add column if not exists crm_owner uuid references public.people(id);

alter table public.cohorts add column if not exists readiness_override_note text;

create table if not exists public.crm_activities (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid references public.organisations(id) on delete cascade,
  invitation_id uuid references public.invitations(id) on delete cascade,
  kind text not null check (kind in ('call','visit','whatsapp','email','meeting','note')),
  outcome text not null default 'completed' check (outcome in ('reached','no_answer','completed','could_not_meet','not_interested')),
  summary text not null,
  occurred_on date not null default current_date,
  next_action text,
  next_action_due date,
  done boolean not null default false,
  logged_by uuid not null references public.people(id),
  created_at timestamptz not null default now(),
  check ((organisation_id is not null)::int + (invitation_id is not null)::int = 1)
);
create index if not exists crm_act_org on public.crm_activities(organisation_id);
create index if not exists crm_act_inv on public.crm_activities(invitation_id);
alter table public.crm_activities enable row level security;
create policy crm_read on public.crm_activities for select using (app.is_staff() or app.is_master_trainer());
create policy crm_insert on public.crm_activities for insert with check (logged_by = app.me() and (app.is_staff() or app.is_master_trainer()));
create policy crm_update on public.crm_activities for update using (app.is_staff() or logged_by = app.me())
  with check (app.is_staff() or logged_by = app.me());
grant select, insert, update, delete on public.crm_activities to authenticated;

-- master trainers do the calls and visits, so they can read organisations and pending suggestions (names and contacts, no agreements)
create policy org_read_master on public.organisations for select using (app.is_master_trainer());
create policy inv_read_master on public.invitations for select using (app.is_master_trainer());

-- the checklist template (founders can edit it from the database for now)
create table if not exists public.readiness_items (
  key text primary key,
  area text not null,
  label text not null,
  help text,
  required boolean not null default true,
  sort int not null default 0
);
alter table public.readiness_items enable row level security;
create policy ri_read on public.readiness_items for select using (auth.uid() is not null);
create policy ri_write on public.readiness_items for all using (app.is_founder()) with check (app.is_founder());
grant select, insert, update, delete on public.readiness_items to authenticated;

insert into public.readiness_items(key, area, label, help, required, sort) values
 ('room_capacity',  'Room',        'The room seats every expected participant comfortably', 'About 1.5 square metres each, with space to move for group work.', true, 10),
 ('room_quiet',     'Room',        'The room is quiet and private enough to teach', 'No competing services, markets or loud neighbours during session hours.', true, 20),
 ('seating_tables', 'Room',        'Chairs and a writing surface for every participant', 'Canvas work is written, so each person needs somewhere to write.', true, 30),
 ('wall_space',     'Room',        'Wall or board space for flip charts and the gallery walk', 'The canvas is built up on the wall across the days.', true, 40),
 ('power_light',    'Facilities',  'Enough light for the whole session, and power if a phone or projector is used', 'Check at the hours we will actually teach.', true, 50),
 ('water_toilets',  'Facilities',  'Clean toilets and drinking water on site', 'Safe and separate facilities for girls and women.', true, 60),
 ('safety_security','Safety',      'The building and compound are safe, exits are clear, and a first aid kit or nearest clinic is known', null, true, 70),
 ('safeguarding',   'Safety',      'A safeguarding contact is named and the guardian consent process is agreed for anyone under 18', 'Required before anyone under 18 is enrolled.', true, 80),
 ('access',         'Logistics',   'Participants can reach the venue easily and on time', 'Transport cost and travel time understood.', true, 90),
 ('dates_booked',   'Logistics',   'The venue is booked for every training day with no clashes', 'Services, exams, funerals, weddings and other events.', true, 100),
 ('meals_plan',     'Logistics',   'The meals or tea plan is agreed', 'Who provides, who pays, and for how many.', true, 110),
 ('host_contact',   'People',      'The host administrator is named and agrees to the dates and to the 30, 60 and 90 day follow-up visits', null, true, 120),
 ('participant_list','People',     'The participant list or nomination process is agreed with the host', null, true, 130),
 ('accessibility',  'Room',        'The room can be reached by people with disabilities, or there is a plan', null, false, 140),
 ('backup_venue',   'Logistics',   'A backup room or date exists if the venue becomes unavailable', null, false, 150),
 ('storage',        'Facilities',  'Lockable storage for materials overnight', 'Useful for the 12-Day programme.', false, 160)
on conflict (key) do nothing;

create table if not exists public.readiness_checks (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  item_key text not null references public.readiness_items(key),
  status text not null default 'unchecked' check (status in ('unchecked','ok','issue','na')),
  note text,
  checked_by uuid references public.people(id),
  checked_on date,
  unique (organisation_id, item_key)
);
alter table public.readiness_checks enable row level security;
create policy rc_read on public.readiness_checks for select using (app.is_staff() or app.is_master_trainer());
create policy rc_write on public.readiness_checks for all using (app.is_staff() or app.is_master_trainer())
  with check (app.is_staff() or app.is_master_trainer());
grant select, insert, update, delete on public.readiness_checks to authenticated;

-- where an organisation stands: computed from what has actually been logged, never typed in
create or replace view public.crm_org_status with (security_invoker = true) as
select o.id as organisation_id,
  coalesce((select count(*) from public.crm_activities a where a.organisation_id = o.id and a.kind = 'call'), 0)::int as calls,
  coalesce((select count(*) from public.crm_activities a where a.organisation_id = o.id and a.kind = 'visit'), 0)::int as visits,
  exists (select 1 from public.crm_activities a where a.organisation_id = o.id and a.kind in ('call','meeting') and a.outcome = 'reached') as called,
  exists (select 1 from public.crm_activities a where a.organisation_id = o.id and a.kind = 'visit' and a.outcome = 'completed') as visited,
  (select max(a.occurred_on) from public.crm_activities a where a.organisation_id = o.id) as last_contact_on,
  (select min(a.next_action_due) from public.crm_activities a where a.organisation_id = o.id and not a.done and a.next_action_due is not null) as next_action_due,
  (select count(*) from public.readiness_items i where i.required)::int as required_total,
  (select count(*) from public.readiness_items i join public.readiness_checks c on c.item_key = i.key and c.organisation_id = o.id
     where i.required and c.status in ('ok','na'))::int as required_ok,
  (select count(*) from public.readiness_checks c where c.organisation_id = o.id and c.status = 'issue')::int as issues,
  ((select count(*) from public.readiness_items i where i.required) > 0 and
   (select count(*) from public.readiness_items i join public.readiness_checks c on c.item_key = i.key and c.organisation_id = o.id
      where i.required and c.status in ('ok','na')) = (select count(*) from public.readiness_items i where i.required)) as checks_complete,
  exists (select 1 from public.cohorts k where k.organisation_id = o.id and k.status in ('confirmed','delivering','followup','closed')) as has_cohort
from public.organisations o;

grant select on public.crm_org_status to authenticated;

-- people (suggested individuals): have they been called, and is consent in place for minors?
create or replace view public.crm_person_status with (security_invoker = true) as
select i.id as invitation_id,
  exists (select 1 from public.crm_activities a where a.invitation_id = i.id and a.kind in ('call','meeting') and a.outcome = 'reached') as called,
  (select max(a.occurred_on) from public.crm_activities a where a.invitation_id = i.id) as last_contact_on,
  (select min(a.next_action_due) from public.crm_activities a where a.invitation_id = i.id and not a.done and a.next_action_due is not null) as next_action_due
from public.invitations i;
grant select on public.crm_person_status to authenticated;

-- a cohort cannot be confirmed or start delivering until the organisation has been called, visited and its checks pass,
-- unless a founder records an override reason
create or replace function app.guard_cohort_ready() returns trigger language plpgsql security definer set search_path = public as $$
declare st record;
begin
  if new.status in ('confirmed','delivering') and old.status is distinct from new.status and new.readiness_override_note is null then
    select * into st from public.crm_org_status where organisation_id = new.organisation_id;
    if not (coalesce(st.called, false) and coalesce(st.visited, false) and coalesce(st.checks_complete, false)) then
      raise exception 'Not ready: the organisation must be called, visited and pass the venue checks, or a founder must record an override reason.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists cohort_ready_guard on public.cohorts;
create trigger cohort_ready_guard before update on public.cohorts for each row execute function app.guard_cohort_ready();

-- ---------- founder alerts: nothing sent into the portal goes unseen ----------
create table if not exists public.founder_alerts (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  severity text not null default 'info' check (severity in ('info','attention','urgent')),
  title text not null,
  body text,
  link text,
  source_table text,
  source_id uuid,
  created_at timestamptz not null default now(),
  emailed_at timestamptz,
  email_error text
);
create index if not exists founder_alerts_unsent on public.founder_alerts(created_at) where emailed_at is null;
alter table public.founder_alerts enable row level security;
create policy fa_read on public.founder_alerts for select using (app.is_founder());

create table if not exists public.alert_reads (
  alert_id uuid not null references public.founder_alerts(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (alert_id, person_id)
);
alter table public.alert_reads enable row level security;
create policy ar_read on public.alert_reads for select using (person_id = app.me() and app.is_founder());
create policy ar_write on public.alert_reads for insert with check (person_id = app.me() and app.is_founder());
grant select on public.founder_alerts to authenticated;
grant select, insert on public.alert_reads to authenticated;

create or replace function app.raise_alert(k text, sev text, t text, b text, l text, tbl text, sid uuid) returns void
language sql security definer set search_path = public as $$
  insert into public.founder_alerts(kind, severity, title, body, link, source_table, source_id) values (k, sev, t, b, l, tbl, sid)
$$;

create or replace function app.name_of(p uuid) returns text language sql stable security definer set search_path = public as $$
  select display_name from public.people where id = p
$$;
create or replace function app.nm(p uuid) returns text language sql stable security definer set search_path = public as $$
  select coalesce(app.name_of(p), 'someone')
$$;

create or replace function app.tr_alert() returns trigger language plpgsql security definer set search_path = public as $$
declare t text; b text; sev text := 'info'; l text; k text := tg_table_name; cname text; oname text;
begin
  if tg_table_name = 'day_reports' then
    t := 'Day report from ' || coalesce(app.name_of(new.author_id), new.form_respondent, 'someone') || case when new.kind = 'qa' then ' (QA visit)' else '' end;
    b := coalesce(new.concern_note, '');
    sev := case new.concern when 'urgent' then 'urgent' when 'watch' then 'attention' else 'info' end;
    l := '/portal/reports';
  elsif tg_table_name = 'session_logs' then
    t := 'Session log from ' || app.nm(new.author_id); b := coalesce(new.hardest_concepts, ''); l := '/portal/cohorts';
  elsif tg_table_name = 'followup_visits' then
    t := 'Follow-up visit recorded'; b := coalesce(new.notes, ''); l := '/portal/cohorts';
  elsif tg_table_name = 'welfare_flags' then
    t := 'Welfare flag raised (' || new.category || ')'; b := new.summary; sev := 'urgent'; l := '/portal/command';
  elsif tg_table_name = 'org_suggestions' then
    t := 'Organisation suggested: ' || new.name; b := 'Suggested by ' || app.nm(new.suggested_by) || ' in ' || new.county; sev := 'attention'; l := '/portal/people';
  elsif tg_table_name = 'invitations' then
    t := 'Person suggested: ' || new.full_name; b := 'Nominated by ' || coalesce(app.name_of(new.nominated_by), 'a partner'); sev := 'attention'; l := '/portal/people';
  elsif tg_table_name = 'expense_requests' then
    t := 'Expense request of KES ' || new.amount_kes || ' from ' || app.nm(new.requester_id); b := new.reason; sev := 'attention'; l := '/portal/approvals';
  elsif tg_table_name = 'cohorts' then
    select name into oname from public.organisations where id = new.organisation_id;
    t := 'Training requested by ' || coalesce(oname, 'a partner'); b := new.name; sev := 'attention'; l := '/portal/crm';
  elsif tg_table_name = 'qa_visits' then
    if new.outcome is null then return new; end if;
    t := 'QA visit recorded: ' || new.outcome; b := coalesce(new.notes, ''); sev := case when new.outcome = 'pass' then 'info' else 'attention' end; l := '/portal/qa';
  elsif tg_table_name = 'readiness_checks' then
    if new.status <> 'issue' then return new; end if;
    select name into oname from public.organisations where id = new.organisation_id;
    t := 'Venue issue flagged at ' || coalesce(oname, 'an organisation'); b := coalesce(new.note, new.item_key); sev := 'attention'; l := '/portal/crm/' || new.organisation_id;
  else
    return new;
  end if;
  perform app.raise_alert(k, sev, t, nullif(b, ''), l, tg_table_name, new.id);
  return new;
end $$;

do $$ declare t text; begin
  foreach t in array array['day_reports','session_logs','followup_visits','welfare_flags','org_suggestions','invitations','expense_requests','qa_visits','readiness_checks']
  loop
    execute format('drop trigger if exists alert_%1$s on public.%1$s', t);
    execute format('create trigger alert_%1$s after insert on public.%1$s for each row execute function app.tr_alert()', t);
  end loop;
end $$;
drop trigger if exists alert_cohorts on public.cohorts;
create trigger alert_cohorts after insert on public.cohorts for each row when (new.status = 'requested') execute function app.tr_alert();
drop trigger if exists alert_readiness_upd on public.readiness_checks;
create trigger alert_readiness_upd after update of status on public.readiness_checks for each row
  when (new.status = 'issue' and old.status is distinct from new.status) execute function app.tr_alert();
drop trigger if exists alert_qa_upd on public.qa_visits;
create trigger alert_qa_upd after update of outcome on public.qa_visits for each row
  when (new.outcome is not null and old.outcome is distinct from new.outcome) execute function app.tr_alert();
