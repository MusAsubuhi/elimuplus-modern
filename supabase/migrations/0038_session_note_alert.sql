-- Session note alerts say which cohort and day, link to that day, and skip founders' own notes.
create or replace function app.tr_alert() returns trigger language plpgsql security definer set search_path = public as $$
declare t text; b text; sev text := 'info'; l text; k text := tg_table_name; cname text; oname text; dnum int; cid uuid;
begin
  if tg_table_name = 'day_reports' then
    t := 'Day report from ' || coalesce(app.name_of(new.author_id), new.form_respondent, 'someone') || case when new.kind = 'qa' then ' (QA visit)' else '' end;
    b := coalesce(new.concern_note, '');
    sev := case new.concern when 'urgent' then 'urgent' when 'watch' then 'attention' else 'info' end;
    l := '/portal/reports';
  elsif tg_table_name = 'session_logs' then
    -- a founder's own note needs no alert to the founders
    if exists (select 1 from public.role_assignments ra where ra.person_id = new.author_id and ra.role = 'founder' and ra.status = 'active') then return new; end if;
    select c.name, s.day_number, c.id into cname, dnum, cid from public.sessions s join public.cohorts c on c.id = s.cohort_id where s.id = new.session_id;
    t := 'Session note: ' || coalesce(cname, 'a cohort') || coalesce(', Day ' || dnum, '') || ' from ' || app.nm(new.author_id);
    b := coalesce(new.hardest_concepts, ''); l := '/portal/cohorts/' || cid || '?session=' || new.session_id;
  elsif tg_table_name = 'followup_visits' then
    t := 'Follow-up visit recorded'; b := coalesce(new.notes, ''); l := '/portal/cohorts';
  elsif tg_table_name = 'welfare_flags' then
    t := 'Welfare flag raised (' || new.category || ')'; b := new.summary; sev := 'urgent'; l := '/portal/command';
  elsif tg_table_name = 'org_suggestions' then
    t := 'Organisation suggested: ' || new.name; b := 'Suggested by ' || app.nm(new.suggested_by) || ' in ' || new.county; sev := 'attention'; l := '/portal/people';
  elsif tg_table_name = 'invitations' then
    t := 'Person suggested: ' || new.full_name; b := 'Nominated by ' || coalesce(app.name_of(new.nominated_by), 'a partner'); sev := 'attention'; l := '/portal/people';
  elsif tg_table_name = 'expense_requests' then
    t := 'Expense request of KES ' || new.amount_kes || ' from ' || app.nm(new.requester_id); b := new.reason; sev := 'attention'; l := '/portal/approvals';
  elsif tg_table_name = 'cohorts' then
    select name into oname from public.organisations where id = new.organisation_id;
    t := 'Training requested by ' || coalesce(oname, 'a partner'); b := new.name; sev := 'attention'; l := '/portal/crm';
  elsif tg_table_name = 'qa_visits' then
    if new.outcome is null then return new; end if;
    t := 'QA visit recorded: ' || new.outcome; b := coalesce(new.notes, ''); sev := case when new.outcome = 'pass' then 'info' else 'attention' end; l := '/portal/qa';
  elsif tg_table_name = 'readiness_checks' then
    if new.status <> 'issue' then return new; end if;
    select name into oname from public.organisations where id = new.organisation_id;
    t := 'Venue issue flagged at ' || coalesce(oname, 'an organisation'); b := coalesce(new.note, new.item_key); sev := 'attention'; l := '/portal/crm/' || new.organisation_id;
  else
    return new;
  end if;
  perform app.raise_alert(k, sev, t, nullif(b, ''), l, tg_table_name, new.id);
  return new;
end $$;
