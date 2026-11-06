-- 0042: HR and payroll. Founders only (this holds pay, tax numbers and performance notes).
-- Statutory rates live in an effective-dated table so a change in the law is a new row, not a code change.
-- payroll_runs uses the columns src/lib/books.ts already reads: gross and employer cost go to the P&L, net and statutory amounts owed go to the balance sheet.

create table if not exists public.statutory_rates (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  value numeric not null,
  effective_from date not null,
  note text,
  created_by uuid references public.people(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (key, effective_from)
);
-- Kenya. Confirm with KRA, NSSF, SHA or an accountant before relying on these for filing.
insert into public.statutory_rates(key, value, effective_from, note) values
  ('paye_b1_upper', 24000, '2023-07-01', 'PAYE monthly band 1 upper limit'), ('paye_b1_rate', 0.10, '2023-07-01', null),
  ('paye_b2_upper', 32333, '2023-07-01', 'band 2 upper limit'),            ('paye_b2_rate', 0.25, '2023-07-01', null),
  ('paye_b3_upper', 500000, '2023-07-01', 'band 3 upper limit'),           ('paye_b3_rate', 0.30, '2023-07-01', null),
  ('paye_b4_upper', 800000, '2023-07-01', 'band 4 upper limit'),           ('paye_b4_rate', 0.325, '2023-07-01', null),
  ('paye_b5_rate', 0.35, '2023-07-01', 'above band 4'),
  ('paye_personal_relief', 2400, '2023-07-01', 'Monthly personal relief'),
  ('nssf_rate', 0.06, '2024-02-01', 'Employee and employer each'),
  ('nssf_lower', 8000, '2025-02-01', 'NSSF lower earnings limit, year 3'), ('nssf_upper', 72000, '2025-02-01', 'NSSF upper earnings limit, year 3'),
  ('nssf_lower', 9000, '2026-02-01', 'NSSF lower earnings limit, year 4'), ('nssf_upper', 108000, '2026-02-01', 'NSSF upper earnings limit, year 4'),
  ('shif_rate', 0.0275, '2024-10-01', 'Social Health Insurance Fund, employee, on gross pay'),
  ('shif_min', 300, '2024-10-01', 'Minimum monthly SHIF'),
  ('housing_rate', 0.015, '2024-03-01', 'Affordable Housing Levy, employee and employer each'),
  ('nita_per_employee', 50, '2024-01-01', 'NITA levy per employee per month, employer')
on conflict (key, effective_from) do nothing;

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  person_id uuid references public.people(id) on delete set null,
  full_name text not null,
  job_title text not null,
  department text not null default 'Programme' check (department in ('Programme','Partnerships','Marketing','Finance and admin','Leadership','Other')),
  employment_type text not null default 'contract' check (employment_type in ('permanent','contract','casual','intern')),
  status text not null default 'active' check (status in ('active','on_leave','exited')),
  start_date date not null,
  probation_end date,
  contract_end date,
  end_date date,
  exit_reason text,
  manager_id uuid references public.employees(id) on delete set null,
  basic_kes numeric(14,2) not null default 0 check (basic_kes >= 0),
  allowances_kes numeric(14,2) not null default 0 check (allowances_kes >= 0),
  phone text, email text,
  kra_pin text, nssf_no text, sha_no text,
  pay_to text,
  emergency_name text, emergency_phone text,
  onboarding jsonb not null default '{}'::jsonb,
  note text,
  created_by uuid references public.people(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  kind text not null check (kind in ('annual','sick','maternity','paternity','compassionate','unpaid','study')),
  start_date date not null,
  end_date date not null check (end_date >= start_date),
  days numeric(5,1) not null check (days > 0),
  status text not null default 'approved' check (status in ('requested','approved','declined','cancelled')),
  note text,
  decided_by uuid references public.people(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.payroll_runs (
  id uuid primary key default gen_random_uuid(),
  period_start date not null,
  period_end date not null,
  status text not null default 'draft' check (status in ('draft','approved','paid','void')),
  gross_kes numeric(14,2) not null default 0,
  employer_kes numeric(14,2) not null default 0,
  net_kes numeric(14,2) not null default 0,
  statutory_kes numeric(14,2) not null default 0,
  net_paid_on date,
  statutory_paid_on date,
  approved_by uuid references public.people(id) on delete set null,
  approved_at timestamptz,
  note text,
  created_by uuid references public.people(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index if not exists payroll_runs_one_per_month on public.payroll_runs(period_start) where status <> 'void';

create table if not exists public.payslips (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.payroll_runs(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete restrict,
  days_worked int not null, days_in_month int not null,
  basic numeric(14,2) not null, allowances numeric(14,2) not null default 0, bonus numeric(14,2) not null default 0,
  gross numeric(14,2) not null,
  nssf_ee numeric(14,2) not null default 0, shif numeric(14,2) not null default 0, housing_ee numeric(14,2) not null default 0,
  taxable numeric(14,2) not null default 0, paye_gross numeric(14,2) not null default 0, relief numeric(14,2) not null default 0, paye numeric(14,2) not null default 0,
  other_deduction numeric(14,2) not null default 0, other_note text,
  net numeric(14,2) not null,
  nssf_er numeric(14,2) not null default 0, housing_er numeric(14,2) not null default 0, nita numeric(14,2) not null default 0,
  unique (run_id, employee_id)
);

create table if not exists public.job_openings (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  department text,
  status text not null default 'open' check (status in ('draft','open','closed')),
  description text,
  opened_on date not null default current_date,
  closed_on date,
  created_by uuid references public.people(id) on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists public.candidates (
  id uuid primary key default gen_random_uuid(),
  opening_id uuid not null references public.job_openings(id) on delete cascade,
  full_name text not null,
  phone text, email text, source text,
  stage text not null default 'applied' check (stage in ('applied','screened','interview','offer','hired','rejected','withdrew')),
  expected_pay_kes numeric(14,2),
  note text,
  created_at timestamptz not null default now()
);
create table if not exists public.interviews (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  interview_on date not null,
  mode text not null default 'in_person' check (mode in ('in_person','phone','online')),
  interviewer text,
  score_skills smallint check (score_skills between 1 and 5),
  score_communication smallint check (score_communication between 1 and 5),
  score_values smallint check (score_values between 1 and 5),
  score_problem smallint check (score_problem between 1 and 5),
  recommendation text check (recommendation in ('strong_yes','yes','maybe','no')),
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.kpis (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  period text not null,
  title text not null,
  unit text,
  target numeric not null,
  actual numeric,
  weight int not null default 1 check (weight between 1 and 10),
  note text,
  created_at timestamptz not null default now()
);
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  period text not null,
  rating smallint check (rating between 1 and 5),
  strengths text, development text, next_goals text,
  reviewed_on date not null default current_date,
  reviewed_by uuid references public.people(id) on delete set null,
  created_at timestamptz not null default now()
);

do $$ declare t text; begin
  foreach t in array array['statutory_rates','employees','leave_requests','payroll_runs','payslips','job_openings','candidates','interviews','kpis','reviews'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists founders_all on public.%I', t);
    execute format('create policy founders_all on public.%I for all to authenticated using (app.is_founder()) with check (app.is_founder())', t);
  end loop;
end $$;

grant select, insert, update on public.statutory_rates to authenticated;
grant select, insert, update on public.employees to authenticated;
grant select, insert, update on public.leave_requests to authenticated;
grant select, insert, update on public.payroll_runs to authenticated;
grant select, insert, update, delete on public.payslips to authenticated;
grant select, insert, update on public.job_openings to authenticated;
grant select, insert, update on public.candidates to authenticated;
grant select, insert, update on public.interviews to authenticated;
grant select, insert, update on public.kpis to authenticated;
grant select, insert, update on public.reviews to authenticated;
