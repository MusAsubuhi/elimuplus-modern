import 'server-only';
import type { Q } from './db';
import { asAdmin } from './db';
import { sendEmail } from './mail';
import { training, followups, MIN_SESSIONS } from './pricing';

const SITE = () => (process.env.NEXT_PUBLIC_PORTAL_URL || 'https://portal.elimuplus.com').replace(/\/$/, '');
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
export const docUrl = (kind: 'proposal' | 'quote' | 'invoice' | 'receipt', token: string) => `${SITE()}/d/${kind}/${token}`;

/** A short code for document numbers: the one the founders typed, else initials of the name. */
export const orgCode = (name: string, code?: string | null) =>
  (code || name.split(/\s+/).filter((w) => /^[A-Za-z0-9]/.test(w)).map((w) => w[0]).join('').slice(0, 5)).toUpperCase().replace(/[^A-Z0-9]/g, '') || 'ORG';

export async function nextQuoteNumber(q: Q, code: string) {
  const y = new Date().getFullYear();
  const n = Number((await q('select count(*)::int n from quotes where number like $1', [`ELIMU+-${code}-Q%-${y}`]))[0].n) + 1;
  return `ELIMU+-${code}-Q${n}-${y}`;
}
export async function nextInvoiceNumber(q: Q, code: string) {
  const y = new Date().getFullYear();
  const n = Number((await q('select count(*)::int n from invoices where number like $1', [`ELIMU+-INV-${code}-%-${y}`]))[0].n) + 1;
  return `ELIMU+-INV-${code}-${String(n).padStart(2, '0')}-${y}`;
}
export async function nextReceiptNumber(q: Q) {
  const y = new Date().getFullYear();
  const n = Number((await q('select count(*)::int n from receipts where number like $1', [`ELIMU+-R-${y}-%`]))[0].n) + 1;
  return `ELIMU+-R-${y}-${String(n).padStart(4, '0')}`;
}

/** Quote lines from the standard price list. Training is one line; the three follow-up visits are one line, billed ahead of the first visit. */
export function quoteLines(participants: number, sessions = MIN_SESSIONS) {
  const t = training(participants, sessions), f = followups(participants);
  return [
    t.flat
      ? { kind: 'training', description: `Training: flat rate per 2-hour session, ${sessions} sessions (${participants} participants)`, qty: sessions, unit_kes: t.perSession }
      : { kind: 'training', description: `Training: KES ${t.tier.rate} per participant per 2-hour session, ${sessions} sessions (${t.tier.label})`, qty: participants * sessions, unit_kes: t.tier.rate },
    f.total === 10000 && participants <= 10
      ? { kind: 'followup_30', description: '30, 60 and 90-day follow-up visits (flat rate for up to 10 participants)', qty: 1, unit_kes: f.total }
      : { kind: 'followup_30', description: '30, 60 and 90-day follow-up visits (per participant)', qty: participants, unit_kes: f.perParticipant },
  ];
}

/** Issue a receipt for a payment that has just been recorded. Safe to call twice. */
export async function issueReceipt(q: Q, paymentId: string): Promise<{ id: string; token: string; number: string }> {
  const have = (await q('select id, number, share_token from receipts where payment_id=$1', [paymentId]))[0];
  if (have) return { id: have.id, token: have.share_token, number: have.number };
  const num = await nextReceiptNumber(q);
  const r = (await q('insert into receipts(payment_id, number) values ($1,$2) returning id, share_token', [paymentId, num]))[0];
  return { id: r.id, token: r.share_token, number: num };
}

/** Mail a link to a document. Returns a plain message on failure so the page can show it. */
export async function mailDoc(to: string[], subject: string, intro: string, links: { label: string; url: string }[]): Promise<string | null> {
  if (!process.env.RESEND_API_KEY) return 'Email is not switched on yet (no RESEND_API_KEY). Copy the link and send it yourself.';
  const clean = to.filter((e) => /@/.test(e));
  if (!clean.length) return 'There is no email address on file for this organisation. Add one on the People page.';
  const html = `<div style="font-family:Arial,sans-serif;max-width:600px;color:#222"><h2 style="color:#0D3B3B;margin:0 0 8px">Elimu+</h2>
    <p style="line-height:1.55">${esc(intro).replace(/\n/g, '<br>')}</p>
    ${links.map((l) => `<p><a href="${l.url}" style="display:inline-block;background:#0D3B3B;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:bold">${esc(l.label)}</a></p>`).join('')}
    <p style="font-size:12px;color:#777">Elimu+ · Mombasa · hello@elimuplus.com · www.elimuplus.com</p></div>`;
  const text = `${intro}\n\n${links.map((l) => `${l.label}: ${l.url}`).join('\n')}\n\nElimu+ · hello@elimuplus.com`;
  try { await sendEmail(clean, subject, html, text); return null; } catch (e: any) { console.error('[mailDoc]', e); return 'The email could not be sent. Copy the link and send it yourself.'; }
}

export async function orgContacts(orgId: string): Promise<string[]> {
  const r = (await asAdmin((q) => q('select contact_email from organisations where id=$1', [orgId])))[0];
  return r?.contact_email ? [String(r.contact_email).trim()] : [];
}

/** Create an invoice from a quote. Used by the founders' Deals page and by the daily job that bills follow-ups. */
export async function createInvoice(q: Q, o: { quoteId: string; orgId: string; cohortId: string | null; kind: 'training' | 'followup' | 'other'; visit?: 30 | 60 | 90; amount: number; description: string; dueOn: string }) {
  const org = (await q('select name, code from organisations where id=$1', [o.orgId]))[0];
  const num = await nextInvoiceNumber(q, orgCode(org.name, org.code));
  const r = (await q(
    `insert into invoices(quote_id, organisation_id, cohort_id, number, issued_on, due_on, amount_kes, status, kind, description, visit)
     values ($1,$2,$3,$4,current_date,$5,$6,'issued',$7,$8,$9) returning id, number, share_token`,
    [o.quoteId, o.orgId, o.cohortId, num, o.dueOn, o.amount, o.kind, o.description, o.visit ?? null]))[0];
  return { id: r.id as string, number: r.number as string, token: r.share_token as string };
}

export async function alertFounders(q: Q, title: string, body: string, link: string, severity: 'info' | 'attention' | 'urgent' = 'info') {
  await q(`insert into founder_alerts(kind, severity, title, body, link, source_table) values ('billing',$1,$2,$3,$4,'invoices')`, [severity, title, body, link]);
}

const plus = (iso: string, n: number) => { const x = new Date(String(iso).slice(0, 10) + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
/** When training finishes: the recorded end date, else the start date plus the length of the programme. */
export const trainingEnds = (c: { start_date?: any; end_date?: any; format?: string }): string | null =>
  c.end_date ? String(c.end_date).slice(0, 10) : c.start_date ? plus(String(c.start_date), c.format === '12-day' ? 11 : 4) : null;
/** The 30, 60 and 90 day visit dates a partner can expect, counted from the end of training. */
export const visitDates = (c: { start_date?: any; end_date?: any; format?: string }) => {
  const e = trainingEnds(c);
  return e ? ([30, 60, 90] as const).map((v) => ({ visit: v, due: plus(e, v) })) : [];
};
export const addDaysIso = plus;

/** Split the follow-up fee over the three visits (the last one takes the rounding). */
export const splitFollowup = (fee: number) => { const a = Math.floor(fee / 3 / 10) * 10; return { 30: a, 60: a, 90: fee - 2 * a } as Record<30 | 60 | 90, number>; };

/**
 * Quotations a partner asked for themselves are held back for a short, uneven while so the reply does not feel automatic.
 * Called whenever a partner page opens and by the daily job; sends anything whose time has come.
 */
export async function releaseDueQuotes(): Promise<number> {
  const due = await asAdmin((q) => q(
    `select qt.id, qt.share_token, qt.number, qt.organisation_id, o.name org_name, o.contact_person
       from quotes qt join organisations o on o.id=qt.organisation_id
      where qt.self_service and qt.status='draft' and qt.release_at <= now() order by qt.release_at limit 20`));
  let n = 0;
  for (const x of due) {
    const claimed = await asAdmin((q) => q("update quotes set status='sent', sent_at=now(), valid_until=current_date + 30 where id=$1 and status='draft' returning id", [x.id]));
    if (!claimed.length) continue;
    n++;
    const to = await orgContacts(x.organisation_id);
    const err = await mailDoc(to, `Your Elimu+ partnership proposal and quotation`,
      `Dear ${x.contact_person || x.org_name},\n\nThank you for your interest in working with Elimu+. Your partnership proposal and quotation (${x.number}) are ready. Both are also in your partner portal under Invoices and payments. The quotation is valid for 30 days.\n\nWhen you are ready, reply to this email or call us and we will confirm dates with you.\n\nWarm regards,\nElimu+`,
      [{ label: 'Read the partnership proposal', url: docUrl('proposal', x.share_token) }, { label: 'Open the quotation', url: docUrl('quote', x.share_token) }]);
    await asAdmin((q) => q('update quotes set sent_to=$2 where id=$1', [x.id, to.join(', ') || null]));
    await asAdmin((q) => alertFounders(q, `Quotation ${x.number} released to ${x.org_name}`, err ? `Email not sent: ${err}` : 'Emailed to the partner.', '/portal/deals', err ? 'attention' : 'info'));
  }
  return n;
}
