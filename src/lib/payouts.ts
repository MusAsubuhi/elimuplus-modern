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
 * Claims are created by the database as work is recorded (a training ending, a day report, each follow-up visit), so trainers are paid as they go.
 * This runs the same rules on demand for a cohort, for example after a rate is set that was missing, and reports what it found.
 */
export async function generateClaims(q: Q, cohortId: string, byPerson: string): Promise<GenResult> {
  const r = (await q('select app.sync_payout_claims($1, $2) as r', [cohortId, byPerson]))[0]?.r ?? {};
  const names: Record<string, string> = RATE_KINDS;
  return {
    created: Number(r.created ?? 0), updated: Number(r.updated ?? 0), waiting: Number(r.waiting ?? 0),
    missingRate: ((r.missing_rate ?? []) as string[]).map((m) => { const [who, k] = m.split(': '); return `${who}: ${names[k] ?? k}`; }),
  };
}
