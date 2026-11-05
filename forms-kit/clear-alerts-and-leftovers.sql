-- Elimu+ portal: clear alerts, the 153,940 figure, the October forum record and old people records
-- after keep-only-KE0740.sql.
-- Run in the Supabase SQL editor. Same dry-run pattern: leave dry_run = true first,
-- read the counts, then set it to false and run again.
-- Delete any line below you want to KEEP before running.

do $$
declare
  dry_run boolean := true;          -- <<< change to false for the real delete
  report text;
begin
  delete from alert_reads;                 -- who has seen which alert
  delete from founder_alerts;              -- every alert on the Alerts page (26)
  delete from expense_approvals;           -- the 2 test expense requests and their approvals
  delete from expense_requests;
  delete from email_log;                   -- 5 test email records
  delete from org_suggestions;             -- 1 suggested organisation
  delete from seminars;                    -- the October participants' forum record
  delete from settings where key = 'cohort1_support_total_kes';   -- the KES 153,940 figure

  -- People: keep anyone who holds a role (the two founders and the KE0740 organisation admin)
-- and every record named Musa Asubuhi or James Kimani.
  -- Ideas they wrote stay, with the author cleared; everything else linked to them is already gone.
  update social_ideas  set author_id = null where author_id in (select id from people where id not in (select person_id from role_assignments) and full_name not in ('Musa Asubuhi','James Kimani'));
  update organisations set crm_owner = null where crm_owner in (select id from people where id not in (select person_id from role_assignments) and full_name not in ('Musa Asubuhi','James Kimani'));
  delete from people where id not in (select person_id from role_assignments) and full_name not in ('Musa Asubuhi','James Kimani');

  select string_agg(t || '=' || n, ', ' order by t) into report from (
    select 'founder_alerts' t, count(*) n from founder_alerts union all
    select 'expense_requests', count(*) from expense_requests union all
    select 'email_log', count(*) from email_log union all
    select 'org_suggestions', count(*) from org_suggestions union all
    select 'organisations', count(*) from organisations union all
    select 'seminars', count(*) from seminars union all
    select 'settings_153940', count(*) from settings where key = 'cohort1_support_total_kes' union all
    select 'people', count(*) from people
  ) x;

  if dry_run then
    raise exception 'DRY RUN, nothing saved. Would be left: %', report;
  else
    raise notice 'DONE. Left: %', report;
  end if;
end $$;
