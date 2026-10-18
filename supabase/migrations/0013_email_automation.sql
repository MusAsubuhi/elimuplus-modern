-- 0013: one record per newsletter subscriber (for the welcome email, the weekly sequence and unsubscribes), a switch for the sequence, and a log of automatic emails. Safe to run twice.

create table if not exists public.newsletter_subscribers (
  email text primary key,                       -- always lower case
  name text,
  source text not null default 'website',       -- website, portal, seminar, registration, organisation, founder
  subscribed_at timestamptz not null default now(),
  welcomed_at timestamptz,
  seq_sent int not null default 0,              -- how many letters of the weekly sequence this person has had
  seq_last_sent_at timestamptz,
  unsubscribed_at timestamptz,
  unsubscribe_reason text
);

create table if not exists public.newsletter_settings (
  id int primary key default 1 check (id = 1),
  sequence_on boolean not null default false,   -- the weekly sequence stays off until a founder switches it on
  updated_at timestamptz not null default now()
);
insert into public.newsletter_settings(id) values (1) on conflict do nothing;

create table if not exists public.email_log (
  id uuid primary key default gen_random_uuid(),
  kind text not null,                           -- welcome, sequence, confirm_org, confirm_trainer
  email text not null,
  detail text,
  error text,
  created_at timestamptz not null default now()
);
create index if not exists email_log_email_idx on public.email_log (email, kind, created_at desc);

alter table public.newsletter_subscribers enable row level security;
alter table public.newsletter_settings enable row level security;
alter table public.email_log enable row level security;
drop policy if exists ns_read on public.newsletter_subscribers;
create policy ns_read on public.newsletter_subscribers for select using (app.is_staff());
drop policy if exists nset_read on public.newsletter_settings;
create policy nset_read on public.newsletter_settings for select using (app.is_staff());
drop policy if exists el_read on public.email_log;
create policy el_read on public.email_log for select using (app.is_staff());
grant select on public.newsletter_subscribers, public.newsletter_settings, public.email_log to authenticated;

-- Musa and James already received the first letter by hand, so they count as welcomed.
insert into public.newsletter_subscribers(email, name, source, welcomed_at)
values ('musasubuhi@gmail.com', 'Asubuhi', 'founder', now()), ('kimanijamest@gmail.com', 'James', 'founder', now())
on conflict do nothing;
