import 'server-only';
import type { Q } from './db';

export async function partnerData(q: Q) {
  const orgs = await q('select o.*, a.named_participant_access, a.welfare_flag_visibility, a.released_report_types, a.confidentiality_label from organisations o left join agreements a on a.organisation_id=o.id order by o.parent_id nulls first, o.name');
  // Counts and follow-up results come from de-identified functions so aggregate-only partners never see names.
  const cohorts = await q(`select c.*, o.name org_name, coalesce(k.enrolled,0) n, coalesce(k.completed,0) completed
      from cohorts c join organisations o on o.id=c.organisation_id
      left join app.partner_cohort_counts() k on k.cohort_id=c.id order by c.seq`);
  const follow = await q('select visit, status, sold, operating, income, knows_breakeven be, tracks_metric km from app.partner_followup_results()');
  return { orgs, cohorts, follow };
}
