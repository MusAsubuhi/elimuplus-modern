import type { Q } from './db';
import { FOLLOWUP_PER_PARTICIPANT, MIN_SESSIONS, tierFor } from './pricing';

/** How many people the quotation covers, how many are already on the list, and the cost of each extra person. */
export async function rosterRoom(q: Q, cohortId: string) {
  const c = (await q('select expected_participants from cohorts where id=$1', [cohortId]))[0];
  const qt = (await q('select participants, sessions from quotes where cohort_id=$1 order by issued_on desc limit 1', [cohortId]))[0];
  const quoted = Number(qt?.participants ?? c?.expected_participants ?? 0) || null;
  const sessions = Number(qt?.sessions) || MIN_SESSIONS;
  const counts = (await q(
    `select count(*) filter (where status in ('expected','enrolled'))::int active, count(*) filter (where status='pending_extra')::int pending,
            count(*) filter (where extra_invoice_id is not null and status<>'withdrawn')::int paid_extra from cohort_roster where cohort_id=$1`, [cohortId]))[0];
  const cap = quoted === null ? null : quoted + counts.paid_extra;
  return { quoted, cap, sessions, active: counts.active as number, pending: counts.pending as number, room: cap === null ? Infinity : Math.max(0, cap - counts.active) };
}

/** Price of extra people joining during a session: each at the rate for the new group size, plus the follow-up fee per person. */
export function supplementCost(quoted: number, extra: number, sessions: number) {
  const rate = tierFor(quoted + extra).rate;
  const training = rate * sessions * extra, followup = FOLLOWUP_PER_PARTICIPANT * extra;
  return { rate, training, followup, total: training + followup };
}
