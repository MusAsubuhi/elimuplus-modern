-- 0016: scheduling, per-platform posting records, post metrics and tracked links for social content;
-- plus feature permissions (who sees which section) that the founders control. Safe to run twice.
alter table public.social_ideas add column if not exists scheduled_for date;
alter table public.social_ideas add column if not exists pillar text;

create table if not exists public.social_posts (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid not null references public.social_ideas(id) on delete cascade,
  platform text not null check (platform in ('whatsapp','facebook','instagram','linkedin','tiktok')),
  posted_at timestamptz not null default now(),
  post_url text,
  posted_by uuid references public.people(id),
  -- numbers the founders read off each platform's own insights and type in
  reach int, reactions int, comments int, shares int, saves int, replies int, followers_gained int,
  note text,
  metrics_updated_at timestamptz,
  unique (idea_id, platform)
);

create table if not exists public.social_links (
  code text primary key,
  idea_id uuid references public.social_ideas(id) on delete cascade,
  platform text,
  target_url text not null,
  created_at timestamptz not null default now()
);
create table if not exists public.social_clicks (
  id bigint generated always as identity primary key,
  code text not null references public.social_links(code) on delete cascade,
  clicked_at timestamptz not null default now(),
  is_bot boolean not null default false
);
create index if not exists social_clicks_code_idx on public.social_clicks (code, clicked_at);

create table if not exists public.role_features (
  role text not null,
  feature text not null,
  allowed boolean not null,
  primary key (role, feature)
);
create table if not exists public.person_features (
  person_id uuid not null references public.people(id) on delete cascade,
  feature text not null,
  allowed boolean not null,
  primary key (person_id, feature)
);

alter table public.social_posts enable row level security;
alter table public.social_links enable row level security;
alter table public.social_clicks enable row level security;
alter table public.role_features enable row level security;
alter table public.person_features enable row level security;
drop policy if exists sp_read on public.social_posts;   create policy sp_read on public.social_posts for select using (app.is_staff());
drop policy if exists sl_read on public.social_links;   create policy sl_read on public.social_links for select using (app.is_staff());
drop policy if exists sc_read on public.social_clicks;  create policy sc_read on public.social_clicks for select using (app.is_staff());
drop policy if exists rf_read on public.role_features;  create policy rf_read on public.role_features for select using (app.is_staff());
drop policy if exists pf_read on public.person_features; create policy pf_read on public.person_features for select using (app.is_staff());
grant select on public.social_posts, public.social_links, public.social_clicks, public.role_features, public.person_features to authenticated;
