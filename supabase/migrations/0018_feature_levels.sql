-- 0018: view-or-edit levels for shared sections, forms visible to trainers, and a stricter review chain.
-- Safe to run twice.
alter table public.role_features   add column if not exists level text not null default 'edit' check (level in ('view','edit'));
alter table public.person_features add column if not exists level text not null default 'edit' check (level in ('view','edit'));

-- Any active trainer may see the list of forms (links and counts). What the numbers contain is still limited by each table's own rules.
drop policy if exists fr_read on public.form_registry;
create policy fr_read on public.form_registry for select using (app.is_staff() or app.facilitator_tier() >= 1);

-- Review chain: nobody marks their own report as read, and a trainer reviews another only if they are the person it was
-- routed to, the author's supervisor, or on a higher tier. Founders review anything.
create or replace function app.guard_report_review() returns trigger language plpgsql security definer set search_path = public as $$
declare me uuid := app.me(); mine int; theirs int;
begin
  if me is null or app.is_staff() then return new; end if;
  if new.status is not distinct from old.status and new.review_note is not distinct from old.review_note then return new; end if;
  if old.author_id = me then raise exception 'You cannot review your own report'; end if;
  if old.routed_to = me or app.supervises(old.author_id) then return new; end if;
  select coalesce(max(tier),0) into mine from role_assignments where person_id = me and role = 'facilitator' and status = 'active';
  select coalesce(max(tier),0) into theirs from role_assignments where person_id = old.author_id and role = 'facilitator' and status = 'active';
  if mine <= theirs then raise exception 'Reports are reviewed by someone on a higher tier, a supervisor, or the person it was sent to'; end if;
  return new;
end $$;
drop trigger if exists day_reports_guard_review on public.day_reports;
create trigger day_reports_guard_review before update on public.day_reports for each row execute function app.guard_report_review();

-- News can feed the social ideas bank and the weekly letter.
alter table public.news_items add column if not exists newsletter_pick boolean not null default false;
alter table public.news_items add column if not exists social_idea_id uuid references public.social_ideas(id) on delete set null;
