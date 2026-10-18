-- 0017: News and signals: daily curated digest (written by Claude through the ingest endpoint) plus a free RSS feed,
-- grouped by region, with follow-up actions. Safe to run twice.
create table if not exists public.news_items (
  id uuid primary key default gen_random_uuid(),
  region text not null check (region in ('local','national','east_africa','africa')),
  title text not null,
  summary text not null default '',
  why_it_matters text,
  source_name text,
  source_url text not null unique,
  published_on date,
  origin text not null default 'curated' check (origin in ('curated','feed')),
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists news_items_region_idx on public.news_items (region, published_on desc);
create table if not exists public.news_followups (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.news_items(id) on delete cascade,
  person_id uuid references public.people(id),
  note text not null,
  status text not null default 'open' check (status in ('open','done')),
  created_at timestamptz not null default now(),
  done_at timestamptz
);
alter table public.news_items enable row level security;
alter table public.news_followups enable row level security;
drop policy if exists ni_read on public.news_items;      create policy ni_read on public.news_items for select using (app.is_staff());
drop policy if exists nf_read on public.news_followups;  create policy nf_read on public.news_followups for select using (app.is_staff());
grant select on public.news_items, public.news_followups to authenticated;
