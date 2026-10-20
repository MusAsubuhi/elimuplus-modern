import 'server-only';
import type { Q } from './db';

export const CLAIM_STEPS = ['pending_work', 'ready', 'approved', 'paid'] as const;
export const CLAIM_LABEL: Record<string, string> = {
  pending_work: 'Waiting for the work to be recorded', ready: 'With the founders', queried: 'Founders have a question', approved: 'Approved, payment on its way',
  paid: 'Paid', declined: 'Declined', cancelled: 'Cancelled',
};
export const RATE_KINDS: Record<string, string> = {
  delivery_lead: 'Delivery, lead facilitator', delivery_co: 'Delivery, co-facilitator', delivery_observer: 'Delivery, trainee observer',
  followup_visit: 'Follow-up visit (each)', qa_visit: 'Quality visit (each)',
};
export const METHOD_LABEL: Record<string, string> = { mpesa: 'M-Pesa', cash: 'Cash', bank_transfer: 'Bank transfer' };

/**
 * How a payment is made. Today every payment is made by a founder outside the portal and then recorded here with its reference.
 * When sending from the portal is switched on, a provider takes the same approved claims and returns its own reference, and nothing else changes.
 */
export interface PayoutProvider {
  id: 'manual' | 'mpesa_b2c';
  label: string;
  enabled: boolean;
  why?: string;
}
export const PROVIDERS: PayoutProvider[] = [
  { id: 'manual', label: 'Record a payment already made', enabled: true },
  {
    id: 'mpesa_b2c', label: 'Send with M-Pesa from the portal',
    enabled: false,
    why: 'Needs a Safaricom Daraja business-to-customer account, its credentials, and a test run. Until then, pay from the M-Pesa app and record the code here.',
  },
];

type Rate = { kind: string; tier: number | null; format: string | null; amount_kes: number };
/** The most specific matching rate: an exact tier and format beats a general one. Returns null when no rate is set. */
export function pickRate(rates: Rate[], kind: string, tier: number, format: string | null): number | null {
  const hits = rates.filter((r) => r.kind === kind && (r.tier === null || r.tier === tier) && (r.format === null || r.format === format));
  hits.sort((a, b) => Number(b.tier !== null) - Number(a.tier !== null) || Number(b.format !== null) - Number(a.format !== null));
  return hits[0]?.amount_kes ?? null;
}

export interface GenResult { created: number; updated: number; waiting: number; missingRate: string[] }

/**
 * Turns finished work on a cohort into claims, and keeps unapproved claims in step with what has been recorded since.
 * Delivery: the cohort has ended and its sessions were logged (lead and co-facilitators), or the trainee filed at least one day report (observers).
 * Follow-up: each visit the person completed, counted once per visit stage.
 * Safe to run again: approved and paid claims are never touched.
 */
export async function generateClaims(q: Q, cohortId: string, byPerson: string): Promise<GenResult> {
  const out: GenResult = { created: 0, updated: 0, waiting: 0, missingRate: [] };
  const c = (await q('select id, name, format, status, end_date from cohorts where id=$1', [cohortId]))[0];
  if (!c) return out;
  const rates = (await q('select kind, tier, format, amount_kes from payout_rates')) as Rate[];
  const fmt = c.format === '5-day' || c.format === '12-day' ? c.format : null;
  const ended = ['followup', 'closed'].includes(c.status) || (c.end_date && new Date(c.end_date) <= new Date());
  const sessionsLogged = Number((await q('select count(*)::int n from session_logs sl join sessions s on s.id=sl.session_id where s.cohort_id=$1', [cohortId]))[0].n);
  const team = await q(
    `select cf.person_id, cf.role, p.display_name,
       coalesce((select max(tier) from role_assignments ra where ra.person_id=cf.person_id and ra.role='facilitator' and ra.status='active'),0)::int tier,
       (select count(*)::int from day_reports r where r.author_id=cf.person_id and r.cohort_id=cf.cohort_id) reports
     from cohort_facilitators cf join people p on p.id=cf.person_id where cf.cohort_id=$1`, [cohortId]);

  const upsert = async (person: string, kind: string, description: string, amount: number, evidence: object, ready: boolean) => {
    const status = ready ? 'ready' : 'pending_work';
    const had = (await q('select id, status from payout_claims where person_id=$1 and cohort_id=$2 and kind=$3', [person, cohortId, kind]))[0];
    if (!had) {
      await q('insert into payout_claims(person_id,cohort_id,kind,description,amount_kes,evidence,status,created_by) values($1,$2,$3,$4,$5,$6,$7,$8)',
        [person, cohortId, kind, description, amount, JSON.stringify(evidence), status, byPerson]);
      out.created++;
    } else if (['pending_work', 'ready'].includes(had.status)) {
      await q('update payout_claims set amount_kes=$2, evidence=$3, status=$4, description=$5 where id=$1', [had.id, amount, JSON.stringify(evidence), status, description]);
      out.updated++;
    }
    if (!ready) out.waiting++;
  };

  if (fmt) {
    for (const m of team) {
      const kind = m.role === 'lead' ? 'delivery_lead' : m.role === 'co' ? 'delivery_co' : 'delivery_observer';
      const amount = pickRate(rates, kind, m.tier, fmt);
      if (!amount) { out.missingRate.push(`${m.display_name}: ${RATE_KINDS[kind]}`); continue; }
      const done = m.role === 'observer' ? !!ended && m.reports >= 1 : !!ended && sessionsLogged >= 1;
      const role = m.role === 'lead' ? 'Led' : m.role === 'co' ? 'Co-facilitated' : 'Observed';
      await upsert(m.person_id, 'delivery', `${role} ${c.name} (${fmt})`, amount, { sessions_logged: sessionsLogged, reports_filed: m.reports, cohort_ended: !!ended }, done);
    }
  }
  const visitRate = pickRate(rates, 'followup_visit', 0, null);
  const visits = await q(
    `select s.assigned_to person_id, s.visit, count(*)::int n, p.display_name
     from followup_schedule s join enrolments e on e.id=s.enrolment_id join people p on p.id=s.assigned_to
     where e.cohort_id=$1 and s.status in ('done','unreachable') and s.assigned_to is not null group by s.assigned_to, s.visit, p.display_name`, [cohortId]);
  for (const v of visits) {
    if (!visitRate) { out.missingRate.push(`${v.display_name}: ${RATE_KINDS.followup_visit}`); continue; }
    await upsert(v.person_id, `followup_${v.visit}`, `${v.n} ${v.visit}-day follow-up visit${v.n === 1 ? '' : 's'}, ${c.name}`, v.n * visitRate, { visits_recorded: v.n }, true);
  }
  out.missingRate = [...new Set(out.missingRate)];
  return out;
}
