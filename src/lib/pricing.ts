/** Elimu+ partner pricing, as set out in the standard quotation. Change the numbers here and every new quote follows. */
export const SESSION_HOURS = 2;
export const MIN_SESSIONS = 5;
export const FOLLOWUP_PER_PARTICIPANT = 1000;
export const SMALL_GROUP = 10;            // groups this size or smaller may be charged a flat rate per session
export const SMALL_GROUP_SESSION = 3000;  // flat rate per 2-hour session for small groups
export const SMALL_GROUP_FOLLOWUP = 10000;

export const TIERS = [
  { min: 1, max: 15, rate: 300, label: '1 – 15 participants' },
  { min: 16, max: 25, rate: 250, label: '16 – 25 participants' },
  { min: 26, max: 9999, rate: 200, label: '26+ participants' },
];
export const tierFor = (n: number) => TIERS.find((t) => n >= t.min && n <= t.max) ?? TIERS[2];

export function training(n: number, sessions = MIN_SESSIONS) {
  const t = tierFor(n);
  const flat = n <= SMALL_GROUP;
  const perSession = flat ? SMALL_GROUP_SESSION : t.rate * n;
  return { tier: t, flat, perSession, perParticipant: t.rate * sessions, total: perSession * sessions };
}
export function followups(n: number) {
  return { perParticipant: FOLLOWUP_PER_PARTICIPANT, total: n <= SMALL_GROUP ? SMALL_GROUP_FOLLOWUP : FOLLOWUP_PER_PARTICIPANT * n };
}

export const BANK = { name: 'Elimu Plus Skills Hub', number: '1349651362', bank: 'KCB' };
export const CONTACT = { email: 'hello@elimuplus.com', phone: '+254 798 639 546', web: 'www.elimuplus.com', signer: 'Kimani James', signerRole: 'Co-founder & Executive Director' };
