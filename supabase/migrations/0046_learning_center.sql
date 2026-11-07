-- 0046: learning center.
-- Founders add PDFs and links and choose who each one is for and whether finishing it is required.
-- Everyone else sees only what is published for their role. People mark what they have read; founders see who has and has not.
-- A goal on an improvement plan can point to the resources that help with it.
-- Safe to run twice.

create table if not exists public.learning_resources (
  id            uuid primary key default gen_random_uuid(),
  title         text not null check (length(btrim(title)) > 0),
  description   text,
  kind          text not null default 'pdf' check (kind in ('pdf','link','video')),
  topic         text not null default 'general',
  url           text,
  storage_path  text unique,
  file_name     text,
  size_bytes    bigint,
  -- who may see it besides the founders: any of master, facilitator, participant, org_admin (partner admins and viewers)
  audience      text[] not null default array['master','facilitator']::text[],
  required      boolean not null default false,
  due_on        date,
  status        text not null default 'published' check (status in ('draft','published','archived')),
  sort_order    int not null default 100,
  added_by      uuid references public.people(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check ((kind = 'pdf' and storage_path is not null) or (kind in ('link','video') and url is not null))
);
create index if not exists learning_resources_status on public.learning_resources(status, topic, sort_order);

create table if not exists public.learning_completions (
  id           uuid primary key default gen_random_uuid(),
  resource_id  uuid not null references public.learning_resources(id) on delete cascade,
  person_id    uuid not null references public.people(id) on delete cascade,
  completed_at timestamptz not null default now(),
  unique (resource_id, person_id)
);
create index if not exists learning_completions_person on public.learning_completions(person_id);

create table if not exists public.goal_resources (
  goal_id      uuid not null references public.improvement_goals(id) on delete cascade,
  resource_id  uuid not null references public.learning_resources(id) on delete cascade,
  added_by     uuid references public.people(id) on delete set null,
  created_at   timestamptz not null default now(),
  primary key (goal_id, resource_id)
);

-- Is a resource meant for the person asking? Founders see everything, including drafts and archived items.
create or replace function app.can_see_resource(aud text[], st text) returns boolean language sql stable security definer set search_path = public as $$
  select app.is_founder() or (st = 'published' and (
       ('master'      = any(aud) and app.is_master_trainer())
    or ('facilitator' = any(aud) and app.has_role('facilitator'))
    or ('participant' = any(aud) and app.has_role('participant'))
    or ('org_admin'   = any(aud) and (app.has_role('org_admin') or app.has_role('org_viewer')))))
$$;

create or replace function app.plan_of_goal(gid uuid) returns uuid language sql stable security definer set search_path = public as $$
  select plan_id from public.improvement_goals where id = gid
$$;

alter table public.learning_resources enable row level security;
alter table public.learning_completions enable row level security;
alter table public.goal_resources enable row level security;

drop policy if exists lr_founders on public.learning_resources;
create policy lr_founders on public.learning_resources for all to authenticated using (app.is_founder()) with check (app.is_founder());
drop policy if exists lr_read on public.learning_resources;
create policy lr_read on public.learning_resources for select to authenticated using (app.can_see_resource(audience, status));

drop policy if exists lc_founders on public.learning_completions;
create policy lc_founders on public.learning_completions for select to authenticated using (app.is_founder());
drop policy if exists lc_own_read on public.learning_completions;
create policy lc_own_read on public.learning_completions for select to authenticated using (person_id = app.me());
drop policy if exists lc_own_insert on public.learning_completions;
create policy lc_own_insert on public.learning_completions for insert to authenticated with check (
  person_id = app.me() and exists (select 1 from public.learning_resources r where r.id = resource_id and app.can_see_resource(r.audience, r.status)));
drop policy if exists lc_own_delete on public.learning_completions;
create policy lc_own_delete on public.learning_completions for delete to authenticated using (person_id = app.me());

-- The plan's owner, their reviewer or supervisor and the founders may attach resources to a goal; anyone who can read the plan can see the links.
drop policy if exists gr_read on public.goal_resources;
create policy gr_read on public.goal_resources for select to authenticated using (app.can_see_plan(app.plan_of_goal(goal_id)));
drop policy if exists gr_insert on public.goal_resources;
create policy gr_insert on public.goal_resources for insert to authenticated with check (
  app.can_see_plan(app.plan_of_goal(goal_id)) and exists (select 1 from public.learning_resources r where r.id = resource_id and app.can_see_resource(r.audience, r.status)));
drop policy if exists gr_delete on public.goal_resources;
create policy gr_delete on public.goal_resources for delete to authenticated using (app.can_see_plan(app.plan_of_goal(goal_id)));

grant select, insert, update, delete on public.learning_resources to authenticated;
grant select, insert, delete on public.learning_completions to authenticated;
grant select, insert, delete on public.goal_resources to authenticated;
grant execute on function app.can_see_resource(text[], text) to authenticated;
grant execute on function app.plan_of_goal(uuid) to authenticated;
