-- Row level security. Helper functions are SECURITY DEFINER so policies can read
-- role_assignments without recursion. Auth is Supabase auth.uid(); tests stub it.

create or replace function app.me() returns uuid language sql stable security definer set search_path = public as $$
  select id from public.people where auth_user_id = auth.uid() limit 1
$$;

create or replace function app.has_role(r text) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.role_assignments ra
    where ra.person_id = app.me() and ra.role = r and ra.status = 'active'
      and (ra.end_date is null or ra.end_date >= current_date))
$$;

create or replace function app.is_founder() returns boolean language sql stable as $$ select app.has_role('founder') $$;
create or replace function app.is_staff() returns boolean language sql stable as $$ select app.has_role('staff') or app.has_role('founder') $$;

-- Highest active facilitator tier (0 if none)
create or replace function app.facilitator_tier() returns int language sql stable security definer set search_path = public as $$
  select coalesce(max(tier),0) from public.role_assignments
  where person_id = app.me() and role = 'facilitator' and status='active'
    and (end_date is null or end_date >= current_date)
$$;
create or replace function app.is_master_trainer() returns boolean language sql stable as $$ select app.facilitator_tier() >= 3 $$;

-- Organisations the caller administers or views, including descendants
create or replace function app.my_orgs() returns setof uuid language sql stable security definer set search_path = public as $$
  with recursive roots as (
    select organisation_id as id from public.role_assignments
    where person_id = app.me() and role in ('org_admin','org_viewer') and status='active'
      and organisation_id is not null and (end_date is null or end_date >= current_date)
  ), tree as (
    select id from roots
    union
    select o.id from public.organisations o join tree t on o.parent_id = t.id
  ) select id from tree
$$;

create or replace function app.my_org_admin_orgs() returns setof uuid language sql stable security definer set search_path = public as $$
  with recursive roots as (
    select organisation_id as id from public.role_assignments
    where person_id = app.me() and role = 'org_admin' and status='active'
      and organisation_id is not null and (end_date is null or end_date >= current_date)
  ), tree as (
    select id from roots union select o.id from public.organisations o join tree t on o.parent_id = t.id
  ) select id from tree
$$;

-- Cohorts where caller is assigned as facilitator
create or replace function app.my_cohorts() returns setof uuid language sql stable security definer set search_path = public as $$
  select cohort_id from public.cohort_facilitators where person_id = app.me()
$$;

create or replace function app.my_enrolments() returns setof uuid language sql stable security definer set search_path = public as $$
  select id from public.enrolments where person_id = app.me()
$$;

-- Org may see named participants of a cohort only if its agreement allows
create or replace function app.org_sees_named(org uuid) returns boolean language sql stable security definer set search_path = public as $$
  select org in (select app.my_orgs()) and coalesce((select named_participant_access = 'named' from public.agreements where organisation_id = org), false)
$$;

-- Cross-table lookups used by policies live in SECURITY DEFINER helpers to avoid policy recursion.
create or replace function app.my_participant_cohorts() returns setof uuid language sql stable security definer set search_path = public as $$
  select cohort_id from public.enrolments where person_id = app.me()
$$;
create or replace function app.cohort_sees_named(c uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.cohorts co where co.id = c and app.org_sees_named(co.organisation_id))
$$;
create or replace function app.org_of_cohort(c uuid) returns uuid language sql stable security definer set search_path = public as $$
  select organisation_id from public.cohorts where id = c
$$;
create or replace function app.cohorts_of_my_orgs() returns setof uuid language sql stable security definer set search_path = public as $$
  select id from public.cohorts where organisation_id in (select app.my_orgs())
$$;
create or replace function app.named_people_visible_to_me() returns setof uuid language sql stable security definer set search_path = public as $$
  select e.person_id from public.enrolments e where app.cohort_sees_named(e.cohort_id)
     or e.cohort_id in (select app.my_cohorts())
$$;
create or replace function app.my_cohort_enrolments() returns setof uuid language sql stable security definer set search_path = public as $$
  select id from public.enrolments where cohort_id in (select app.my_cohorts())
$$;
create or replace function app.my_cohort_sessions() returns setof uuid language sql stable security definer set search_path = public as $$
  select id from public.sessions where cohort_id in (select app.my_cohorts())
$$;
create or replace function app.my_canvases() returns setof uuid language sql stable security definer set search_path = public as $$
  select id from public.canvases where enrolment_id in (select app.my_enrolments())
$$;
create or replace function app.my_cohort_canvases() returns setof uuid language sql stable security definer set search_path = public as $$
  select id from public.canvases where enrolment_id in (select app.my_cohort_enrolments())
$$;
create or replace function app.cohort_facilitator_people() returns setof uuid language sql stable security definer set search_path = public as $$
  select person_id from public.cohort_facilitators where cohort_id in (select app.my_cohorts())
$$;
create or replace function app.my_org_invoices() returns setof uuid language sql stable security definer set search_path = public as $$
  select id from public.invoices where organisation_id in (select app.my_org_admin_orgs())
$$;
create or replace function app.my_org_quotes() returns setof uuid language sql stable security definer set search_path = public as $$
  select id from public.quotes where organisation_id in (select app.my_org_admin_orgs())
$$;
create or replace function app.welfare_visible_to_org(en uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.enrolments e join public.cohorts c on c.id=e.cohort_id
    join public.agreements a on a.organisation_id=c.organisation_id
    where e.id = en and a.welfare_flag_visibility and c.organisation_id in (select app.my_orgs()))
$$;
create or replace function app.report_released_to_me(org uuid, t text, st text) returns boolean language sql stable security definer set search_path = public as $$
  select st = 'released' and org in (select app.my_orgs())
    and exists (select 1 from public.agreements a where a.organisation_id = org and t = any(a.released_report_types))
$$;

-- enable RLS everywhere
do $$ declare t text; begin
  for t in select tablename from pg_tables where schemaname='public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- ---- organisations / agreements
create policy org_read on public.organisations for select using (
  app.is_staff() or id in (select app.my_orgs())
  or id in (select app.org_of_cohort(c) from (select app.my_cohorts() as c) x)
  or id in (select app.org_of_cohort(c) from (select app.my_participant_cohorts() as c) y));
create policy org_write on public.organisations for all using (app.is_founder()) with check (app.is_founder());
create policy agr_read on public.agreements for select using (app.is_staff() or organisation_id in (select app.my_orgs()));
create policy agr_write on public.agreements for all using (app.is_founder()) with check (app.is_founder());

-- ---- people and roles
create policy people_self on public.people for select using (
  id = app.me() or app.is_staff()
  or id in (select app.named_people_visible_to_me())
  or id in (select app.cohort_facilitator_people())
  or (app.is_master_trainer() and id in (select person_id from public.role_assignments where role in ('facilitator','trainer_candidate'))));
create policy people_update_self on public.people for update using (id = app.me()) with check (id = app.me());
create policy people_founder on public.people for all using (app.is_founder()) with check (app.is_founder());

create policy ra_read on public.role_assignments for select using (
  person_id = app.me() or app.is_staff() or (app.is_master_trainer() and role in ('facilitator','trainer_candidate'))
  or organisation_id in (select app.my_orgs()));
create policy ra_founder on public.role_assignments for all using (app.is_founder()) with check (app.is_founder());

-- ---- invitations: nominate within own scope, founders/staff approve
create policy inv_read on public.invitations for select using (
  nominated_by = app.me() or app.is_staff() or organisation_id in (select app.my_orgs()));
create policy inv_nominate on public.invitations for insert with check (
  nominated_by = app.me() and (
    app.is_staff()
    or (organisation_id in (select app.my_org_admin_orgs()) and role in ('participant','org_viewer'))
    or (app.is_master_trainer() and role in ('trainer_candidate','participant'))
    or (app.facilitator_tier() >= 1 and role = 'participant')));
create policy inv_staff on public.invitations for update using (app.is_staff()) with check (app.is_staff());

-- ---- cohorts and delivery
create policy cohort_read on public.cohorts for select using (
  app.is_staff() or id in (select app.my_cohorts()) or organisation_id in (select app.my_orgs())
  or id in (select app.my_participant_cohorts())
  or app.is_master_trainer());
create policy cohort_write on public.cohorts for all using (app.is_staff()) with check (app.is_staff());
create policy cohort_request on public.cohorts for insert with check (
  status = 'requested' and organisation_id in (select app.my_org_admin_orgs()));

create policy cf_read on public.cohort_facilitators for select using (
  app.is_staff() or person_id = app.me() or cohort_id in (select app.my_cohorts()) or app.is_master_trainer());
create policy cf_write on public.cohort_facilitators for all using (app.is_staff()) with check (app.is_staff());

create policy enr_read on public.enrolments for select using (
  person_id = app.me() or app.is_staff() or cohort_id in (select app.my_cohorts()) or app.is_master_trainer()
  or app.cohort_sees_named(cohort_id));
create policy enr_write on public.enrolments for all using (app.is_staff() or cohort_id in (select app.my_cohorts()))
  with check (app.is_staff() or cohort_id in (select app.my_cohorts()));

create policy ses_read on public.sessions for select using (
  app.is_staff() or cohort_id in (select app.my_cohorts()) or app.is_master_trainer()
  or cohort_id in (select app.my_participant_cohorts()));
create policy ses_write on public.sessions for all using (app.is_staff() or cohort_id in (select app.my_cohorts()))
  with check (app.is_staff() or cohort_id in (select app.my_cohorts()));

create policy att_read on public.attendance for select using (
  app.is_staff() or enrolment_id in (select app.my_enrolments())
  or session_id in (select app.my_cohort_sessions()) or app.is_master_trainer());
create policy att_write on public.attendance for all using (
  app.is_staff() or session_id in (select app.my_cohort_sessions()))
  with check (app.is_staff() or session_id in (select app.my_cohort_sessions()));

-- session logs: NEVER visible to participants or partner organisations
create policy log_read on public.session_logs for select using (
  app.is_staff() or app.is_master_trainer() or author_id = app.me()
  or session_id in (select app.my_cohort_sessions()));
create policy log_write on public.session_logs for all using (author_id = app.me() or app.is_founder())
  with check (author_id = app.me() and session_id in (select app.my_cohort_sessions()) or app.is_founder());

-- ---- canvas
create policy cb_read on public.canvas_boxes for select using (auth.uid() is not null);
create policy cb_write on public.canvas_boxes for all using (app.is_founder()) with check (app.is_founder());
create policy cu_read on public.canvas_unlocks for select using (auth.uid() is not null);
create policy cu_write on public.canvas_unlocks for all using (app.is_staff() or cohort_id in (select app.my_cohorts()))
  with check (app.is_staff() or cohort_id in (select app.my_cohorts()));

create policy cv_read on public.canvases for select using (
  enrolment_id in (select app.my_enrolments()) or app.is_staff()
  or enrolment_id in (select app.my_cohort_enrolments()));
create policy cv_write on public.canvases for all using (
  enrolment_id in (select app.my_enrolments()) or enrolment_id in (select app.my_cohort_enrolments()))
  with check (enrolment_id in (select app.my_enrolments()) or enrolment_id in (select app.my_cohort_enrolments()));

create policy ca_read on public.canvas_answers for select using (
  app.is_staff() or canvas_id in (select app.my_canvases()) or canvas_id in (select app.my_cohort_canvases()));
create policy ca_write on public.canvas_answers for insert with check (
  canvas_id in (select app.my_canvases()) or canvas_id in (select app.my_cohort_canvases()));

create policy cc_read on public.canvas_comments for select using (
  author_id = app.me() or app.is_staff()
  or canvas_id in (select app.my_cohort_canvases())
  or (shared and canvas_id in (select app.my_canvases())));
create policy cc_write on public.canvas_comments for insert with check (
  author_id = app.me() and (canvas_id in (select app.my_cohort_canvases()) or app.is_staff()));

-- ---- follow-up
create policy fs_read on public.followup_schedule for select using (
  app.is_staff() or assigned_to = app.me() or app.is_master_trainer()
  or enrolment_id in (select app.my_cohort_enrolments())
  or enrolment_id in (select app.my_enrolments()));
create policy fs_write on public.followup_schedule for all using (app.is_staff() or assigned_to = app.me())
  with check (app.is_staff() or assigned_to = app.me());
create policy fv_read on public.followup_visits for select using (
  app.is_staff() or officer_id = app.me() or app.is_master_trainer()
  or schedule_id in (select id from public.followup_schedule where enrolment_id in (select app.my_cohort_enrolments())));
create policy fv_write on public.followup_visits for all using (app.is_staff() or officer_id = app.me())
  with check (app.is_staff() or officer_id = app.me());

-- welfare: staff, master trainers, the raising facilitator, org only if the agreement says so
create policy wf_read on public.welfare_flags for select using (
  app.is_staff() or raised_by = app.me() or app.is_master_trainer()
  or app.welfare_visible_to_org(enrolment_id));
create policy wf_write on public.welfare_flags for insert with check (raised_by = app.me() and app.facilitator_tier() >= 1);
create policy wf_staff on public.welfare_flags for update using (app.is_staff()) with check (app.is_staff());

-- support ledger: money given to participants, founders and staff only
create policy sl_staff on public.support_ledger for all using (app.is_staff()) with check (app.is_staff());

-- ---- certification and QA
create policy cert_read on public.certifications for select using (
  person_id = app.me() or app.is_staff() or app.is_master_trainer());
create policy cert_write on public.certifications for all using (app.is_founder()) with check (app.is_founder());
create policy qa_read on public.qa_visits for select using (
  facilitator_id = app.me() or observer_id = app.me() or app.is_staff() or app.is_master_trainer());
create policy qa_write on public.qa_visits for all using (app.is_staff() or (app.is_master_trainer() and observer_id = app.me()))
  with check (app.is_staff() or (app.is_master_trainer() and observer_id = app.me()));

-- ---- commercial and finance: founders/staff only, orgs see own quotes/invoices/payments
create policy q_read on public.quotes for select using (app.is_staff() or organisation_id in (select app.my_org_admin_orgs()));
create policy q_write on public.quotes for all using (app.is_founder()) with check (app.is_founder());
create policy ql_read on public.quote_lines for select using (
  app.is_staff() or quote_id in (select app.my_org_quotes()));
create policy ql_write on public.quote_lines for all using (app.is_founder()) with check (app.is_founder());
create policy inv2_read on public.invoices for select using (app.is_staff() or organisation_id in (select app.my_org_admin_orgs()));
create policy inv2_write on public.invoices for all using (app.is_founder()) with check (app.is_founder());
create policy pay_read on public.payments for select using (
  app.is_staff() or invoice_id in (select app.my_org_invoices()));
create policy pay_write on public.payments for all using (app.is_founder()) with check (app.is_founder());

create policy ec_read on public.expense_categories for select using (auth.uid() is not null);
create policy ec_write on public.expense_categories for all using (app.is_founder()) with check (app.is_founder());

create policy er_read on public.expense_requests for select using (requester_id = app.me() or app.is_founder());
create policy er_insert on public.expense_requests for insert with check (
  requester_id = app.me() and status = 'submitted' and (app.facilitator_tier() >= 1 or app.is_staff()));
create policy er_founder on public.expense_requests for update using (app.is_founder()) with check (app.is_founder());

-- approvals: founders only, and never on their own request
create policy ea_read on public.expense_approvals for select using (
  app.is_founder() or request_id in (select id from public.expense_requests where requester_id = app.me()));
create policy ea_insert on public.expense_approvals for insert with check (
  app.is_founder() and approver_id = app.me()
  and not exists (select 1 from public.expense_requests r where r.id = request_id and r.requester_id = app.me()));

create policy tp_read on public.trainer_payments for select using (person_id = app.me() or app.is_founder());
create policy tp_write on public.trainer_payments for all using (app.is_founder()) with check (app.is_founder());

-- ---- reports and documents
create policy rep_read on public.reports for select using (
  app.is_staff() or app.is_master_trainer()
  or app.report_released_to_me(organisation_id, type, status));
create policy rep_write on public.reports for all using (app.is_staff() or app.is_master_trainer())
  with check (app.is_staff() or (app.is_master_trainer() and status in ('draft','reviewed')));
create policy doc_read on public.documents for select using (
  app.is_staff() or person_id = app.me()
  or (visible_to_org and organisation_id in (select app.my_orgs())));
create policy doc_write on public.documents for all using (app.is_staff()) with check (app.is_staff());

-- directory: listed entries with consent are readable by any signed-in user
create policy dl_read on public.directory_listings for select using (
  (status = 'listed' and consent_given and host_approved and auth.uid() is not null)
  or enrolment_id in (select app.my_enrolments()) or app.is_staff());
create policy dl_own on public.directory_listings for all using (enrolment_id in (select app.my_enrolments()) or app.is_staff())
  with check (enrolment_id in (select app.my_enrolments()) or app.is_staff());

-- ---- settings, audit
create policy set_read on public.settings for select using (app.is_staff());
create policy set_write on public.settings for all using (app.is_founder()) with check (app.is_founder());
create policy audit_read on public.audit_log for select using (app.is_founder());
create policy audit_insert on public.audit_log for insert with check (auth.uid() is not null);
