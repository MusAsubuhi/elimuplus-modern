-- Detailed 30/60/90 day follow-up visits, captured by the Elimu+ follow-up Google Form.
-- The full answers are kept as written; the headline fields are copied out so lists and filters stay fast.
create table if not exists public.followup_forms (
  id uuid primary key default gen_random_uuid(),
  stage int not null check (stage in (30,60,90)),
  cohort_id uuid references public.cohorts(id),
  enrolment_id uuid references public.enrolments(id) on delete set null,
  officer_id uuid references public.people(id),
  officer_text text,                         -- name and phone typed on the form when no account matched
  participant_name text not null,
  participant_phone text,
  visited_on date not null default current_date,
  business_status text check (business_status in ('growing','stable','struggling','closed')),
  urgent boolean not null default false,
  operating boolean,
  sales_range text,
  stock_value_kes int,
  answers jsonb not null default '{}'::jsonb,
  response_id text unique,
  routed_to uuid references public.people(id),
  source text not null default 'google_form',
  created_at timestamptz not null default now()
);
create index if not exists followup_forms_cohort on public.followup_forms(cohort_id, stage);
create index if not exists followup_forms_enrolment on public.followup_forms(enrolment_id);
alter table public.followup_forms enable row level security;

-- Founders and staff, master trainers, the officer who did the visit and the person it was sent to can read.
-- Rows arrive only through the trusted forms endpoint, so there is no insert policy for signed-in users.
create policy ff_read on public.followup_forms for select using (
  app.is_staff() or app.is_master_trainer() or officer_id = app.me() or routed_to = app.me());
grant select on public.followup_forms to authenticated;

-- Founder alert for every recorded visit; urgent ones are marked urgent.
create or replace function app.tr_alert_followup_form() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform app.raise_alert('followup_forms',
    case when new.urgent then 'urgent' when new.business_status in ('struggling','closed') then 'attention' else 'info' end,
    'Day ' || new.stage || ' follow-up: ' || new.participant_name || coalesce(' (' || new.business_status || ')', ''),
    nullif(left(coalesce(new.answers->>'a7_words', ''), 300), ''),
    '/portal/cohorts' || coalesce('/' || new.cohort_id::text, ''), 'followup_forms', new.id);
  return new;
end $$;
drop trigger if exists alert_followup_forms on public.followup_forms;
create trigger alert_followup_forms after insert on public.followup_forms for each row execute function app.tr_alert_followup_form();

-- When the form also fills the standard follow-up visit record, skip that record's own alert so founders get one email, not two.
drop trigger if exists alert_followup_visits on public.followup_visits;
create trigger alert_followup_visits after insert on public.followup_visits for each row
  when (coalesce(current_setting('app.skip_alert', true), '') <> '1') execute function app.tr_alert();
