-- Website forms (trainer interest, organisation registration, partner enquiry, quote request) land here as well as in email,
-- so a founder can open one, adjust the details and create the account from a pre-filled form.
create table if not exists public.web_enquiries (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('trainer','organisation','partner','quote')),
  status text not null default 'new' check (status in ('new','accepted','dismissed')),
  name text,
  email text,
  phone text,
  org_name text,
  payload jsonb not null default '{}'::jsonb,
  person_id uuid references public.people(id) on delete set null,
  organisation_id uuid references public.organisations(id) on delete set null,
  handled_by uuid references public.people(id) on delete set null,
  handled_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists web_enquiries_open on public.web_enquiries(created_at desc) where status = 'new';
alter table public.web_enquiries enable row level security;
create policy we_read on public.web_enquiries for select using (app.is_founder());
create policy we_write on public.web_enquiries for update using (app.is_founder()) with check (app.is_founder());
grant select, update on public.web_enquiries to authenticated;
