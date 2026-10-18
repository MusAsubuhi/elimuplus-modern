import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { asAdmin } from './db';
import { sendTransactional, removeFromList, broadcastDays } from './brevo';
import { welcomeEmail, orgConfirmEmail, trainerConfirmEmail, letterEmail } from './emails';

const PORTAL = () => (process.env.PORTAL_URL || 'https://portal.elimuplus.com').replace(/\/$/, '');
const secret = () => process.env.NEWSLETTER_SECRET || process.env.CRON_SECRET || process.env.FORMS_WEBHOOK_SECRET || '';
export const lc = (e: string) => e.trim().toLowerCase();

/** A signed token proves an unsubscribe link was really issued by us for that address. */
export function tokenFor(email: string): string {
  return createHmac('sha256', secret()).update(lc(email)).digest('hex').slice(0, 32);
}
export function tokenOk(email: string, token: string): boolean {
  if (!secret() || !token) return false;
  const a = Buffer.from(tokenFor(email)), b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}
export function unsubscribeUrl(email: string): string {
  return `${PORTAL()}/unsubscribe?e=${encodeURIComponent(lc(email))}&t=${tokenFor(email)}`;
}
export function listHeaders(email: string): Record<string, string> {
  const u = `${PORTAL()}/api/newsletter/unsubscribe?e=${encodeURIComponent(lc(email))}&t=${tokenFor(email)}`;
  return { 'List-Unsubscribe': `<${u}>, <mailto:hello@elimuplus.com?subject=Unsubscribe>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' };
}

async function log(kind: string, email: string, detail?: string, error?: string) {
  await asAdmin((q) => q('insert into email_log (kind, email, detail, error) values ($1,$2,$3,$4)', [kind, lc(email), detail ?? null, error ?? null]));
}

/** Adds the person to the portal's own subscriber list. Someone who unsubscribed stays off unless they sign up again on purpose. */
export async function recordSubscriber(email: string, name: string, source: string, resubscribe = false) {
  const e = lc(email);
  await asAdmin((q) => q(
    `insert into newsletter_subscribers (email, name, source) values ($1,$2,$3)
     on conflict (email) do update set
       name = coalesce(nullif(newsletter_subscribers.name,''), excluded.name),
       unsubscribed_at = case when $4 then null else newsletter_subscribers.unsubscribed_at end,
       unsubscribe_reason = case when $4 then null else newsletter_subscribers.unsubscribe_reason end`,
    [e, name, source, resubscribe]));
}

/** Sends the welcome email once. The row is claimed first so two requests can never send it twice, and released if sending fails. */
export async function sendWelcomeIfDue(email: string): Promise<boolean> {
  const e = lc(email);
  const got = await asAdmin((q) => q(
    `update newsletter_subscribers set welcomed_at = now() where email=$1 and welcomed_at is null and unsubscribed_at is null returning name`, [e]));
  if (!got.length) return false;
  try {
    const m = welcomeEmail(got[0].name || undefined, unsubscribeUrl(e));
    await sendTransactional({ to: e, name: got[0].name || undefined, subject: m.subject, html: m.html, text: m.text, headers: listHeaders(e), tags: ['welcome'] });
    await log('welcome', e);
    return true;
  } catch (err: any) {
    await asAdmin((q) => q('update newsletter_subscribers set welcomed_at = null where email=$1', [e]));
    await log('welcome', e, undefined, String(err.message).slice(0, 200));
    return false;
  }
}

/** Switches the person off everywhere: the subscriber list, every consent box in the portal, and the Brevo list. */
export async function unsubscribe(email: string, reason: string): Promise<void> {
  const e = lc(email);
  await asAdmin(async (q) => {
    await q(`insert into newsletter_subscribers (email, source, unsubscribed_at, unsubscribe_reason) values ($1,'unsubscribe', now(), $2)
             on conflict (email) do update set unsubscribed_at = coalesce(newsletter_subscribers.unsubscribed_at, now()), unsubscribe_reason = $2`, [e, reason]);
    await q(`update people set newsletter_consent = false where lower(email) = $1`, [e]);
    await q(`update organisations set newsletter_consent = false where lower(contact_email) = $1`, [e]);
    await q(`update seminar_entries set newsletter_consent = false where lower(email) = $1`, [e]);
  });
  try { await removeFromList(e); } catch (err) { console.error('[unsubscribe brevo]', err); }
}

/** One confirmation per address and kind per hour, so the form cannot be used to flood someone's inbox. */
export async function sendConfirmation(kind: 'confirm_org' | 'confirm_trainer', email: string, name: string, organisation?: string): Promise<'sent' | 'skipped'> {
  const e = lc(email);
  const recent = await asAdmin((q) => q(`select 1 from email_log where kind=$1 and email=$2 and error is null and created_at > now() - interval '1 hour' limit 1`, [kind, e]));
  if (recent.length) return 'skipped';
  const first = name.trim().split(/\s+/)[0];
  const m = kind === 'confirm_org' ? orgConfirmEmail(first, organisation) : trainerConfirmEmail(first);
  try {
    await sendTransactional({ to: e, name: name || undefined, subject: m.subject, html: m.html, text: m.text, tags: [kind] });
    await log(kind, e);
    return 'sent';
  } catch (err: any) {
    await log(kind, e, undefined, String(err.message).slice(0, 200));
    throw err;
  }
}

export async function sequenceOn(): Promise<boolean> {
  const r = await asAdmin((q) => q('select sequence_on from newsletter_settings where id=1'));
  return !!r[0]?.sequence_on;
}
export async function setSequenceOn(on: boolean) {
  await asAdmin((q) => q('update newsletter_settings set sequence_on=$1 where id=1', [on]));
}

/**
 * Daily run: each subscriber gets the next letter once at least 7 days after their previous email.
 * Steps aside on any day a Brevo campaign is queued or went out, so one-off news is never crowded.
 * Does nothing at all unless the founders have switched the sequence on.
 */
export async function runSequence(): Promise<{ sent: number; skipped?: string }> {
  if (!(await sequenceOn())) return { sent: 0, skipped: 'sequence is switched off' };
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
  try { if ((await broadcastDays()).has(today)) return { sent: 0, skipped: 'a campaign goes out today' }; }
  catch (e) { return { sent: 0, skipped: 'could not check Brevo campaigns' }; }
  const letters = await asAdmin((q) => q('select subject, body from newsletter_letters order by position, created_at'));
  if (!letters.length) return { sent: 0, skipped: 'there are no letters yet' };
  const due = await asAdmin((q) => q(
    `select email, name, seq_sent from newsletter_subscribers
     where unsubscribed_at is null and welcomed_at is not null and seq_sent < $1
       and coalesce(seq_last_sent_at, welcomed_at) <= now() - interval '7 days'
     order by welcomed_at limit 50`, [letters.length]));
  let sent = 0;
  for (const s of due) {
    const l = letters[s.seq_sent];
    if (!l) continue;
    const m = letterEmail(l.subject, l.body, (s.name || '').split(' ')[0] || undefined, unsubscribeUrl(s.email));
    try {
      await sendTransactional({ to: s.email, name: s.name || undefined, subject: m.subject, html: m.html, text: m.text, headers: listHeaders(s.email), tags: ['sequence'] });
      await asAdmin((q) => q('update newsletter_subscribers set seq_sent = seq_sent + 1, seq_last_sent_at = now() where email=$1', [s.email]));
      await log('sequence', s.email, `letter ${s.seq_sent + 1}`);
      sent++;
    } catch (err: any) { await log('sequence', s.email, `letter ${s.seq_sent + 1}`, String(err.message).slice(0, 200)); }
  }
  return { sent };
}

/** Sends one letter to a single address so a founder can see exactly how it will look. */
export async function sendLetterTest(to: string, subject: string, body: string) {
  const m = letterEmail(`[Test] ${subject}`, body, 'there', unsubscribeUrl(to));
  await sendTransactional({ to, subject: m.subject, html: m.html, text: m.text, tags: ['letter-test'] });
}
