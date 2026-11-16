import 'server-only';
import type { Q } from './db';
import { todayNairobi } from './book';

/**
 * Keeps the stage of a training in step with the calendar. A confirmed cohort whose first day has arrived is now
 * being delivered; every page that lists "running" cohorts (payouts, reports, forms, suppliers, billing) reads this status.
 * Requested and quoted cohorts are never moved here: confirming one needs the partner's agreement and the readiness check.
 */
export async function advanceCohortStatuses(q: Q): Promise<number> {
  const rows = await q("update cohorts set status='delivering' where status='confirmed' and start_date is not null and start_date <= $1 returning id", [todayNairobi()]);
  return rows.length;
}
