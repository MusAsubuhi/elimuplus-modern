-- 0015: a shared bank of social media ideas. Founders and facilitators submit real ideas in one of four angles;
-- both founders approve before anything is posted. Safe to run twice.
create table if not exists public.social_ideas (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  angle text not null check (angle in ('actionable','analytical','aspirational','anthropological')),
  material text not null default '',            -- the real story, fact, quote or moment behind the idea
  consent_ok boolean not null default false,    -- author confirms nobody is named or shown without consent
  author_id uuid references public.people(id),
  partner_name text,
  partner_logo_url text,
  image_url text,
  drafts jsonb not null default '{}'::jsonb,    -- {whatsapp, facebook, instagram, linkedin}
  status text not null default 'idea' check (status in ('idea','pending','approved','posted','returned')),
  return_note text,
  created_at timestamptz not null default now(),
  posted_at timestamptz
);
create table if not exists public.social_approvals (
  idea_id uuid not null references public.social_ideas(id) on delete cascade,
  person_id uuid not null references public.people(id),
  created_at timestamptz not null default now(),
  primary key (idea_id, person_id)
);
alter table public.social_ideas enable row level security;
alter table public.social_approvals enable row level security;
drop policy if exists si_read on public.social_ideas;
create policy si_read on public.social_ideas for select using (app.is_staff());
drop policy if exists sa_read on public.social_approvals;
create policy sa_read on public.social_approvals for select using (app.is_staff());
grant select on public.social_ideas, public.social_approvals to authenticated;
