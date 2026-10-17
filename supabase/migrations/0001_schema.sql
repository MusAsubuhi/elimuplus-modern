-- Elimu+ platform schema, v1. Supabase-compatible Postgres.
-- All tables have row level security enabled in 0002_rls.sql.

create schema if not exists app;

-- ---------- organisations and agreements ----------
create table public.organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null check (type in ('church','cdc','school','college','ngo','company','other')),
  parent_id uuid references public.organisations(id),
  county text,
  ward text,
  status text not null default 'active' check (status in ('prospect','active','paused','closed')),
  created_at timestamptz not null default now()
);

create table public.agreements (
  organisation_id uuid primary key references public.organisations(id) on delete cascade,
  named_participant_access text not null default 'aggregates' check (named_participant_access in ('none','aggregates','named')),
  welfare_flag_visibility boolean not null default false,
  released_report_types text[] not null default '{}',
  can_nominate text[] not null default '{participant}',
  confidentiality_label text,
  valid_from date,
  valid_to date
);

-- ---------- people and roles ----------
create table public.people (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  full_name text not null,
  display_name text,
  phone text,
  email text,
  preferred_language text not null default 'sw' check (preferred_language in ('sw','en')),
  birth_year int,
  status text not null default 'active' check (status in ('active','inactive','archived')),
  created_at timestamptz not null default now()
);

create table public.role_assignments (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id) on delete cascade,
  role text not null check (role in ('participant','facilitator','trainer_candidate','org_admin','org_viewer','founder','staff')),
  tier int check (tier between 1 and 4),
  organisation_id uuid references public.organisations(id),
  start_date date not null default current_date,
  end_date date,
  status text not null default 'active' check (status in ('active','ended','suspended')),
  check (role <> 'facilitator' or tier is not null)
);
create index on public.role_assignments(person_id);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  contact text not null,
  role text not null check (role in ('participant','trainer_candidate','facilitator','org_admin','org_viewer')),
  tier int check (tier between 1 and 4),
  organisation_id uuid references public.organisations(id),
  cohort_id uuid,
  birth_year int,
  guardian_consent boolean not null default false,
  nominated_by uuid not null references public.people(id),
  approved_by uuid references public.people(id),
  status text not null default 'nominated' check (status in ('nominated','approved','activated','declined','expired')),
  note text,
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);

-- ---------- cohorts and delivery ----------
create table public.cohorts (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  name text not null,
  format text not null check (format in ('5-day','12-day','3-day-legacy')),
  language text not null default 'sw' check (language in ('sw','en')),
  audience text,
  start_date date,
  end_date date,
  venue text,
  expected_participants int,
  status text not null default 'requested' check (status in ('requested','quoted','confirmed','delivering','followup','closed')),
  created_at timestamptz not null default now()
);
alter table public.invitations add constraint invitations_cohort_fk foreign key (cohort_id) references public.cohorts(id);

create table public.cohort_facilitators (
  cohort_id uuid not null references public.cohorts(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  role text not null default 'lead' check (role in ('lead','co','observer')),
  primary key (cohort_id, person_id)
);

create table public.enrolments (
  id uuid primary key default gen_random_uuid(),
  cohort_id uuid not null references public.cohorts(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  has_business_at_entry boolean not null default true,
  track text not null default 'standard' check (track in ('standard','starter')),
  status text not null default 'enrolled' check (status in ('enrolled','completed','dropped')),
  unique (cohort_id, person_id)
);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  cohort_id uuid not null references public.cohorts(id) on delete cascade,
  day_number int not null,
  session_date date,
  topic text,
  canvas_boxes int[] not null default '{}',
  unique (cohort_id, day_number)
);

create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  enrolment_id uuid not null references public.enrolments(id) on delete cascade,
  present boolean not null default true,
  late_minutes int not null default 0,
  unique (session_id, enrolment_id)
);

-- private to facilitators, QA and founders
create table public.session_logs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references public.sessions(id) on delete cascade,
  author_id uuid not null references public.people(id),
  flow_rating int check (flow_rating between 1 and 5),
  checks jsonb not null default '{}'::jsonb,
  hardest_concepts text,
  went_well text,
  to_improve text,
  notable_quotes text,
  created_at timestamptz not null default now()
);

-- ---------- canvas ----------
create table public.canvas_boxes (
  number int primary key check (number between 1 and 12),
  name_en text not null,
  name_sw text not null,
  phase int not null check (phase between 1 and 5),
  questions jsonb not null default '[]'::jsonb
);

create table public.canvas_unlocks (
  cohort_id uuid not null references public.cohorts(id) on delete cascade,
  box_number int not null references public.canvas_boxes(number),
  unlocked_at timestamptz not null default now(),
  primary key (cohort_id, box_number)
);

create table public.canvases (
  id uuid primary key default gen_random_uuid(),
  enrolment_id uuid not null unique references public.enrolments(id) on delete cascade,
  status text not null default 'draft' check (status in ('draft','submitted','presented')),
  updated_at timestamptz not null default now()
);

create table public.canvas_answers (
  id uuid primary key default gen_random_uuid(),
  canvas_id uuid not null references public.canvases(id) on delete cascade,
  box_number int not null references public.canvas_boxes(number),
  question_key text not null,
  answer text not null,
  language text not null default 'sw',
  assisted boolean not null default false,
  entered_by uuid references public.people(id),
  version int not null default 1,
  created_at timestamptz not null default now()
);
create index on public.canvas_answers(canvas_id, box_number, question_key, version desc);

create table public.canvas_comments (
  id uuid primary key default gen_random_uuid(),
  canvas_id uuid not null references public.canvases(id) on delete cascade,
  box_number int not null references public.canvas_boxes(number),
  author_id uuid not null references public.people(id),
  body text not null,
  shared boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------- follow-up ----------
create table public.followup_schedule (
  id uuid primary key default gen_random_uuid(),
  enrolment_id uuid not null references public.enrolments(id) on delete cascade,
  visit int not null check (visit in (30,60,90)),
  due_date date not null,
  window_end date,
  status text not null default 'scheduled' check (status in ('scheduled','done','missed','unreachable')),
  assigned_to uuid references public.people(id),
  attempts int not null default 0,
  unique (enrolment_id, visit)
);

create table public.followup_visits (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null unique references public.followup_schedule(id) on delete cascade,
  visited_on date not null,
  still_operating boolean,
  sold_within_14_days boolean,
  income_direction text check (income_direction in ('higher','same','lower')),
  weekly_sales_range text,
  stock_cash_value_kes int,
  knows_breakeven boolean,
  tracks_key_metric boolean,
  used_calc_for_decision boolean,
  confidence int check (confidence between 1 and 5),
  challenges text[] not null default '{}',
  notes text,
  officer_id uuid references public.people(id)
);

create table public.welfare_flags (
  id uuid primary key default gen_random_uuid(),
  enrolment_id uuid not null references public.enrolments(id) on delete cascade,
  raised_by uuid not null references public.people(id),
  category text not null check (category in ('health','nutrition','safety','economic','family','other')),
  summary text not null,
  status text not null default 'open' check (status in ('open','referred','resolved')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

-- money given to participants (kept apart from fees and expenses)
create table public.support_ledger (
  id uuid primary key default gen_random_uuid(),
  enrolment_id uuid not null references public.enrolments(id) on delete cascade,
  entry_date date not null,
  amount_kes int not null,
  item text not null,
  funder text
);

-- ---------- certification and quality ----------
create table public.certifications (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id) on delete cascade,
  tier int not null check (tier between 1 and 4),
  number text not null unique,
  issued_on date not null,
  status text not null default 'active' check (status in ('active','inactive','on_review','decertified'))
);

create table public.qa_visits (
  id uuid primary key default gen_random_uuid(),
  facilitator_id uuid not null references public.people(id) on delete cascade,
  observer_id uuid references public.people(id),
  window_open date,
  window_close date,
  observed_on date,
  score int check (score between 0 and 18),
  outcome text check (outcome in ('pass','conditional','concern')),
  notes text
);

-- ---------- commercial and finance ----------
create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  cohort_id uuid references public.cohorts(id),
  issued_on date not null default current_date,
  valid_until date,
  status text not null default 'draft' check (status in ('draft','sent','signed','declined'))
);
create table public.quote_lines (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete cascade,
  kind text not null check (kind in ('training','followup_30','followup_60','followup_90','other')),
  description text not null,
  qty int not null default 1,
  unit_kes int not null
);
create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid references public.quotes(id),
  organisation_id uuid not null references public.organisations(id),
  number text not null unique,
  issued_on date not null,
  due_on date not null,
  amount_kes int not null,
  status text not null default 'issued' check (status in ('issued','part_paid','paid','overdue'))
);
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  amount_kes int not null check (amount_kes > 0),
  method text not null default 'mpesa' check (method in ('mpesa','bank','cash','card')),
  reference text,
  received_on date not null,
  recorded_by uuid references public.people(id)
);

create table public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);
create table public.expense_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.people(id),
  cohort_id uuid references public.cohorts(id),
  category_id uuid references public.expense_categories(id),
  amount_kes int not null check (amount_kes > 0),
  reason text not null,
  status text not null default 'submitted' check (status in ('submitted','approved','declined','queried','paid','reconciled')),
  created_at timestamptz not null default now(),
  decided_on date,
  paid_on date,
  paid_amount_kes int,
  receipt_note text
);
create table public.expense_approvals (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.expense_requests(id) on delete cascade,
  approver_id uuid not null references public.people(id),
  decision text not null check (decision in ('approve','decline','query')),
  note text,
  created_at timestamptz not null default now(),
  unique (request_id, approver_id)
);
create table public.trainer_payments (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id),
  cohort_id uuid references public.cohorts(id),
  kind text not null check (kind in ('stipend','fee','transport')),
  amount_kes int not null,
  paid_on date not null
);

-- ---------- reports, documents, directory ----------
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  cohort_id uuid references public.cohorts(id),
  type text not null check (type in ('session','followup_30','followup_60','followup_90','completion','impact')),
  title text not null,
  period text,
  summary text,
  status text not null default 'draft' check (status in ('draft','reviewed','released')),
  reviewed_by uuid references public.people(id),
  released_by uuid references public.people(id),
  released_on date,
  confidentiality_label text,
  created_at timestamptz not null default now()
);
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid references public.organisations(id),
  cohort_id uuid references public.cohorts(id),
  person_id uuid references public.people(id),
  kind text not null check (kind in ('certificate','attendance_list','report','invoice','agreement','other')),
  title text not null,
  file_ref text,
  visible_to_org boolean not null default false,
  created_at timestamptz not null default now()
);
create table public.directory_listings (
  id uuid primary key default gen_random_uuid(),
  enrolment_id uuid not null unique references public.enrolments(id) on delete cascade,
  display_name text not null,
  business_sw text not null,
  business_en text,
  wish_list text,
  consent_given boolean not null default false,
  host_approved boolean not null default false,
  status text not null default 'pending' check (status in ('pending','listed','withdrawn'))
);

-- ---------- settings and audit ----------
create table public.settings (
  key text primary key,
  value jsonb not null,
  note text
);
create table public.audit_log (
  id bigserial primary key,
  actor_id uuid,
  action text not null,
  table_name text,
  record_id text,
  at timestamptz not null default now()
);
