-- 0010: where every Google Form and its response sheet lives, and how many responses Google holds against what the portal has.
-- The Forms script posts this every hour. Safe to run twice.

create table if not exists public.form_registry (
  key text primary key,                  -- followup, youth_followup, baseline, learning, exit, register, 0..3, att_<cohort>, obs_<cohort>
  title text not null,
  kind text not null default 'other',    -- followup, start_end, cohort, report, other
  fill_url text,
  edit_url text,
  sheet_url text,
  google_responses int,                  -- how many responses Google holds for the form
  last_response_at timestamptz,          -- when Google last received one
  checked_at timestamptz not null default now()
);

alter table public.form_registry enable row level security;
drop policy if exists fr_read on public.form_registry;
create policy fr_read on public.form_registry for select using (app.is_staff() or app.is_master_trainer());
