import 'server-only';
import type { Q } from './db';
import { todayNairobi } from './book';

/**
 * Keeps the stage of a training in step with the calendar:
 *  - confirmed, and the first training day has arrived  -> delivering
 *  - confirmed or delivering, and the last training day is past (from the next day on) -> followup
 * The 30, 60 and 90 day visits are separate: they keep their own set dates inside the follow-up stage.
 * Requested and quoted cohorts are never moved here: confirming one needs the partner's agreement and the readiness check.
 * Every page that lists "running" or "follow-up" cohorts (payouts, reports, forms, suppliers, billing) reads this status.
 */
export async function advanceCohortStatuses(q: Q): Promise<number> {
  const today = todayNairobi();
  const a = await q("update cohorts set status='followup' where status in ('confirmed','delivering') and end_date is not null and end_date < $1 returning id", [today]);
  const b = await q("update cohorts set status='delivering' where status='confirmed' and start_date is not null and start_date <= $1 returning id", [today]);
  return a.length + b.length;
}
