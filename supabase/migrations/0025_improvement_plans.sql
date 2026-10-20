-- 0025: personal improvement plans.
-- A plan belongs to one person. They write the goals and report their own progress.
-- Their supervisor (or the reviewer they name) can read it, suggest goals and leave notes, but cannot move the person's progress.
-- Founders and staff can read every plan and help set one up. Partner organisations never see plans.
-- Safe to run twice.

create table if not exists public.improvement_plans (
  id          uuid primary key default gen_random_uuid(),
  person_id   uuid not null references public.people(id) on delete cascade,
  title       text not null,
  focus       text not null default 'general' check (focus in ('general','facilitation','follow_up','business','finance','communication','leadership')),
  summary     text,
  starts_on   date not null default current_date,
  review_on   date,
  status      text not null default 'active' check (status in ('draft','active','completed','closed')),
  reviewer_id uuid references public.people(id) on delete set null,
  origin      text not null default 'self' check (origin in ('self','reviewer','qa','pathway')),
  created_by  uuid references public.people(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists improvement_plans_person on public.improvement_plans(person_id, status);

create table if not exists public.improvement_goals (
  id          uuid primary key default gen_random_uuid(),
  plan_id     uuid not null references public.improvement_plans(id) on delete cascade,
  title       text not null,
  why         text,
  measure     text,
  due_on      date,
  status      text not null default 'not_started' check (status in ('not_started','in_progress','done','dropped')),
  progress    smallint not null default 0 check (progress between 0 and 100),
  source_kind text check (source_kind in ('pathway','qa_visit','followup','canvas','own')),
  source_ref  text,
  proposed_by uuid references public.people(id) on delete set null,
  accepted    boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists improvement_goals_plan on public.improvement_goals(plan_id);

create table if not exists public.improvement_checkins (
  id         uuid primary key default gen_random_uuid(),
  plan_id    uuid not null references public.improvement_plans(id) on delete cascade,
  goal_id    uuid references public.improvement_goals(id) on delete set null,
  author_id  uuid not null references public.people(id) on delete cascade,
  kind       text not null default 'update' check (kind in ('update','reviewer_note','review')),
  body       text not null check (length(btrim(body)) > 0),
  progress   smallint check (progress between 0 and 100),
  created_at timestamptz not null default now()
);
create index if not exists improvement_checkins_plan on public.improvement_checkins(plan_id, created_at desc);

-- Helpers are SECURITY DEFINER so the policies can look up a plan without recursing into their own rules.
create or replace function app.owns_plan(pid uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.improvement_plans where id = pid and person_id = app.me())
$$;
create or replace function app.can_see_plan(pid uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.improvement_plans p
    where p.id = pid and (p.person_id = app.me() or p.reviewer_id = app.me() or app.supervises(p.person_id) or app.is_staff()))
$$;

alter table public.improvement_plans    enable row level security;
alter table public.improvement_goals    enable row level security;
alter table public.improvement_checkins enable row level security;

drop policy if exists ip_read on public.improvement_plans;
create policy ip_read on public.improvement_plans for select using (
  person_id = app.me() or reviewer_id = app.me() or app.supervises(person_id) or app.is_staff());

-- You start your own plan, or the person's supervisor or a founder helps set one up. Always recorded under the real author.
drop policy if exists ip_insert on public.improvement_plans;
create policy ip_insert on public.improvement_plans for insert with check (
  created_by = app.me() and (person_id = app.me() or app.supervises(person_id) or app.is_staff()));

drop policy if exists ip_update on public.improvement_plans;
create policy ip_update on public.improvement_plans for update
  using (person_id = app.me() or reviewer_id = app.me() or app.supervises(person_id) or app.is_staff())
  with check (person_id = app.me() or reviewer_id = app.me() or app.supervises(person_id) or app.is_staff());

drop policy if exists ip_delete on public.improvement_plans;
create policy ip_delete on public.improvement_plans for delete using (
  (person_id = app.me() and status = 'draft') or app.is_staff());

-- Whose plan it is, and who made it, never change after the fact.
create or replace function app.guard_plan_update() returns trigger language plpgsql as $$
begin
  if new.person_id is distinct from old.person_id then raise exception 'A plan cannot be moved to another person'; end if;
  if new.created_by is distinct from old.created_by then raise exception 'The author of a plan cannot be changed'; end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists improvement_plans_guard on public.improvement_plans;
create trigger improvement_plans_guard before update on public.improvement_plans for each row execute function app.guard_plan_update();

drop policy if exists ig_read on public.improvement_goals;
create policy ig_read on public.improvement_goals for select using (app.can_see_plan(plan_id));

-- The owner adds goals as accepted. Anyone else who can see the plan can only suggest (accepted = false) until the owner accepts.
drop policy if exists ig_insert on public.improvement_goals;
create policy ig_insert on public.improvement_goals for insert with check (
  app.can_see_plan(plan_id) and proposed_by = app.me() and accepted = app.owns_plan(plan_id));

-- Only the owner changes goals (including accepting a suggestion). Reviewers speak through check-ins instead.
drop policy if exists ig_update on public.improvement_goals;
create policy ig_update on public.improvement_goals for update
  using (app.owns_plan(plan_id)) with check (app.owns_plan(plan_id));

drop policy if exists ig_delete on public.improvement_goals;
create policy ig_delete on public.improvement_goals for delete using (
  app.owns_plan(plan_id) or (proposed_by = app.me() and accepted = false));

create or replace function app.guard_goal_update() returns trigger language plpgsql as $$
begin
  if new.plan_id is distinct from old.plan_id then raise exception 'A goal cannot move to another plan'; end if;
  if new.proposed_by is distinct from old.proposed_by then raise exception 'Who suggested a goal cannot be changed'; end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists improvement_goals_guard on public.improvement_goals;
create trigger improvement_goals_guard before update on public.improvement_goals for each row execute function app.guard_goal_update();

drop policy if exists ic_read on public.improvement_checkins;
create policy ic_read on public.improvement_checkins for select using (app.can_see_plan(plan_id));

-- The owner posts updates about their own progress; everyone else with sight of the plan can leave notes. Nobody posts in another person's name.
drop policy if exists ic_insert on public.improvement_checkins;
create policy ic_insert on public.improvement_checkins for insert with check (
  author_id = app.me() and app.can_see_plan(plan_id)
  and ((kind = 'update' and app.owns_plan(plan_id)) or (kind in ('reviewer_note','review') and not app.owns_plan(plan_id))));
-- No update or delete policy on purpose: check-ins are a record.

grant select, insert, update, delete on public.improvement_plans, public.improvement_goals to authenticated;
grant select, insert on public.improvement_checkins to authenticated;
