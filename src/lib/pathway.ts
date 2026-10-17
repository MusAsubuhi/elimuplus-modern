import 'server-only';
import type { Q, Row } from './db';

export const TIER_TITLES: Record<number, string> = { 1: 'Foundation Facilitator', 2: 'Programme Facilitator', 3: 'Senior Facilitator (master trainer)', 4: 'Accredited ToT Lead (master trainer)' };
export const MAINTENANCE_MIN: Record<number, number> = { 1: 2, 2: 3, 3: 4, 4: 0 };

export interface Req { label: string; have: number; need: number; unit?: string; note?: string; manual?: boolean }

export async function facilitatorStats(q: Q, personId: string) {
  const year = new Date().getFullYear();
  const cert = (await q("select * from certifications where person_id=$1 and status='active' order by tier desc limit 1", [personId]))[0] ?? null;
  const led = await q(
    `select c.id, c.format, c.end_date,
       (select count(*) from enrolments e where e.cohort_id=c.id)::int n,
       (select count(*) from followup_schedule s join enrolments e on e.id=s.enrolment_id where e.cohort_id=c.id and s.status in ('done','unreachable'))::int recorded,
       (select count(*) from followup_schedule s join enrolments e on e.id=s.enrolment_id where e.cohort_id=c.id)::int planned
     from cohort_facilitators cf join cohorts c on c.id=cf.cohort_id
     where cf.person_id=$1 and cf.role='lead' and c.end_date <= current_date`, [personId]);
  const complete = led.filter((c) => c.planned > 0 && c.recorded === c.planned);
  const qa = (await q('select count(*)::int n from qa_visits where observer_id=$1 and observed_on is not null', [personId]))[0].n as number;
  const lastQa = (await q('select max(observed_on) d from qa_visits where facilitator_id=$1', [personId]))[0]?.d ?? null;
  const months = cert ? Math.floor((Date.now() - new Date(cert.issued_on).getTime()) / (30.44 * 86400000)) : 0;
  const thisYear = led.filter((c) => new Date(c.end_date).getFullYear() === year);
  return {
    cert, deliveries: led.length, twelveDay: led.filter((c) => c.format === '12-day').length,
    completeFollowups: complete.length, qaConducted: qa, lastQa, tenureMonths: months,
    thisYear: thisYear.length, thisYear12: thisYear.filter((c) => c.format === '12-day').length, year,
  };
}
export type FStats = Awaited<ReturnType<typeof facilitatorStats>>;

/** Requirements to move up from `tier` to tier+1, taken from the Facilitator Certification Pathway v2. */
export function nextTierRequirements(tier: number, s: FStats): { to: number; reqs: Req[] } | null {
  if (tier === 1) return { to: 2, reqs: [
    { label: 'Months held as active Tier 1', have: s.tenureMonths, need: 12, unit: 'months' },
    { label: 'Independent deliveries (not co-facilitation)', have: s.deliveries, need: 5 },
    { label: 'Cohorts with complete 30/60/90 records', have: s.completeFollowups, need: 3 },
    { label: 'Co-founder review', have: 0, need: 1, manual: true, note: 'Recorded by a founder at application' },
  ] };
  if (tier === 2) return { to: 3, reqs: [
    { label: 'Months held as active Tier 2', have: s.tenureMonths, need: 18, unit: 'months' },
    { label: 'Independent deliveries (5-Day and 12-Day)', have: s.deliveries, need: 10 },
    { label: 'of which 12-Day deliveries', have: s.twelveDay, need: 4 },
    { label: 'Structured QA observations of Tier 1 facilitators', have: s.qaConducted, need: 3 },
    { label: 'Cohorts with complete 30/60/90 records', have: s.completeFollowups, need: 5 },
    { label: 'Co-founder endorsement', have: 0, need: 1, manual: true },
  ] };
  if (tier === 3) return { to: 4, reqs: [
    { label: 'Months held as active Tier 3', have: s.tenureMonths, need: 12, unit: 'months' },
    { label: 'ToT programmes led or co-led', have: 0, need: 3, manual: true, note: 'ToT records are entered by founders for now' },
    { label: 'Tier 1 certifications issued under supervision', have: 0, need: 1, manual: true },
    { label: 'Endorsement by both co-founders', have: 0, need: 1, manual: true },
  ] };
  return null;
}

export function maintenance(tier: number, s: FStats): Req[] {
  const out: Req[] = [];
  if (MAINTENANCE_MIN[tier]) out.push({ label: `Independent deliveries in ${s.year}`, have: s.thisYear, need: MAINTENANCE_MIN[tier] });
  if (tier === 2) out.push({ label: `12-Day deliveries in ${s.year} (at least one)`, have: s.thisYear12, need: 1 });
  if (tier === 3) out.push({ label: `QA observations conducted in ${s.year}`, have: s.qaConducted, need: 3 });
  return out;
}
