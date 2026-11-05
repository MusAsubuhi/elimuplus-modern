-- Elimu+ portal: keep only KE0740 GNCA Mtongwe, remove everything else.
-- Run in the Supabase SQL editor (project utngccrgoaehybdbswcb).
--
-- BEFORE YOU RUN: first run   select app.run_portal_backup();   and wait for it to finish.
--
-- HOW IT WORKS: it runs inside one block. With dry_run = true it deletes, counts what is
-- left, then stops with an error that lists the counts, so NOTHING is saved. Read the counts.
-- When they look right, change dry_run to false and run it again to make the delete real.

do $$
declare
  dry_run boolean := true;          -- <<< change to false for the real delete
  keep uuid;
  doomed_orgs uuid[];
  doomed_cohorts uuid[];
  doomed_enrols uuid[];
  report text;
begin
  select id into keep from organisations where name = 'KE0740 GNCA Mtongwe';
  if keep is null then raise exception 'KE0740 GNCA Mtongwe not found, stopping'; end if;

  select array_agg(id) into doomed_orgs from organisations where id <> keep;
  select array_agg(id) into doomed_cohorts from cohorts where organisation_id <> keep;
  select array_agg(id) into doomed_enrols from enrolments where cohort_id = any(doomed_cohorts);

  -- 0. Rows that block the others (found by the first dry run)
  delete from story_photos  where story_id in (select id from participant_stories where enrolment_id = any(doomed_enrols) or cohort_id = any(doomed_cohorts));
  delete from payout_items  where claim_id in (select id from payout_claims where cohort_id = any(doomed_cohorts));
  delete from payment_notices where organisation_id = any(doomed_orgs) or payment_id in (select id from payments where invoice_id in (select id from invoices where cohort_id = any(doomed_cohorts) or organisation_id = any(doomed_orgs)));
  delete from payments      where invoice_id in (select id from invoices where cohort_id = any(doomed_cohorts) or organisation_id = any(doomed_orgs));

  -- 1. Everything hanging off participants (enrolments)
  delete from participant_stories     where enrolment_id = any(doomed_enrols) or cohort_id = any(doomed_cohorts);
  delete from participant_certificates where enrolment_id = any(doomed_enrols) or cohort_id = any(doomed_cohorts);
  delete from attendance               where enrolment_id = any(doomed_enrols);
  delete from canvases                 where enrolment_id = any(doomed_enrols);
  delete from directory_listings       where enrolment_id = any(doomed_enrols);
  delete from followup_schedule        where enrolment_id = any(doomed_enrols);
  delete from support_ledger           where enrolment_id = any(doomed_enrols);
  delete from welfare_flags            where enrolment_id = any(doomed_enrols);
  delete from business_books           where enrolment_id = any(doomed_enrols);
  delete from cohort_roster            where cohort_id = any(doomed_cohorts) or organisation_id = any(doomed_orgs);

  -- 2. Form answers: KE0740 has no cohorts, so every form answer in the portal goes, matched or not
  delete from baselines;
  delete from learning_checks;
  delete from exit_feedback;
  delete from followup_forms;
  delete from youth_followups;

  -- 3. Everything hanging off cohorts
  delete from day_reports       where cohort_id = any(doomed_cohorts);
  delete from expense_requests  where cohort_id = any(doomed_cohorts);
  delete from payout_claims     where cohort_id = any(doomed_cohorts);
  delete from trainer_payments  where cohort_id = any(doomed_cohorts);
  delete from invoices          where cohort_id = any(doomed_cohorts) or organisation_id = any(doomed_orgs);
  delete from quotes            where cohort_id = any(doomed_cohorts) or organisation_id = any(doomed_orgs);
  delete from reports           where cohort_id = any(doomed_cohorts) or organisation_id = any(doomed_orgs);
  delete from invitations       where cohort_id = any(doomed_cohorts) or organisation_id = any(doomed_orgs);
  delete from documents         where cohort_id = any(doomed_cohorts) or organisation_id = any(doomed_orgs);
  delete from enrolments        where id = any(doomed_enrols);
  delete from cohorts           where id = any(doomed_cohorts);   -- also clears sessions, day summaries, canvas unlocks, facilitators

  -- 4. Everything hanging off organisations
  delete from org_suggestions   where organisation_id = any(doomed_orgs) or parent_id = any(doomed_orgs);
  delete from role_assignments  where organisation_id = any(doomed_orgs);
  delete from organisations     where id = any(doomed_orgs);      -- also clears agreements, CRM notes, readiness checks, report exports

  select string_agg(t || '=' || n, ', ' order by t) into report from (
    select 'organisations' t, count(*) n from organisations union all
    select 'cohorts', count(*) from cohorts union all
    select 'enrolments', count(*) from enrolments union all
    select 'baselines', count(*) from baselines union all
    select 'followup_forms', count(*) from followup_forms union all
    select 'youth_followups', count(*) from youth_followups union all
    select 'day_reports', count(*) from day_reports union all
    select 'role_assignments', count(*) from role_assignments union all
    select 'form_registry', count(*) from form_registry
  ) x;

  if dry_run then
    raise exception 'DRY RUN, nothing saved. Would be left: %', report;
  else
    raise notice 'DONE. Left: %', report;
  end if;
end $$;
