import 'server-only';
import { asAdmin } from './db';

export const API = 'https://api.brevo.com/v3';
export const SENDER = { name: 'Elimu+', email: 'hello@elimuplus.com' };
const LIST_ID = () => Number(process.env.BREVO_LIST_ID || 3);
const isEmail = (v: unknown): v is string => typeof v === 'string' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);

/** Adds or updates one contact on the Elimu+ Newsletter list. Throws with Brevo's message so it can be shown in the portal. */
export async function upsertContact(email: string, attributes: Record<string, string>, resubscribe = false) {
  const key = process.env.BREVO_API_KEY;
  if (!key) throw new Error('BREVO_API_KEY is not set');
  const r = await fetch(`${API}/contacts`, {
    method: 'POST',
    headers: { 'api-key': key, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ email: email.toLowerCase(), attributes, listIds: [LIST_ID()], updateEnabled: true, ...(resubscribe ? { emailBlacklisted: false } : {}) }),
  });
  if (!r.ok && r.status !== 204) throw new Error(`Brevo ${r.status}: ${(await r.text()).slice(0, 160)}`);
}

/** Records the subscriber in the portal and sends the welcome email. Never lets an email problem undo the Brevo sync. */
async function track(email: string, who: string, source: string) {
  try { const n = await import('./newsletter'); await n.recordSubscriber(email, String(who ?? '').trim().split(/\s+/)[0] ?? '', source); await n.sendWelcomeIfDue(email); }
  catch (e) { console.error('[newsletter track]', e); }
}

const names = (full: string) => {
  const [first, ...rest] = String(full ?? '').trim().split(/\s+/);
  return { FIRSTNAME: first ?? '', LASTNAME: rest.join(' ') };
};

/**
 * Sends everyone who agreed to the newsletter and has an email, but is not yet on the list.
 * Safe to run repeatedly: one failure is recorded against that person and the rest carry on.
 */
export async function syncNewsletter(): Promise<{ synced: number; failed: number; skipped?: string }> {
  if (!process.env.BREVO_API_KEY) return { synced: 0, failed: 0, skipped: 'BREVO_API_KEY is not set' };
  let synced = 0, failed = 0;

  const people = await asAdmin((q) => q(
    `select id, full_name, lower(email) email from people
     where newsletter_consent and email like '%@%' and status = 'active' and brevo_synced_at is null limit 200`));
  for (const p of people) {
    try {
      if (!isEmail(p.email)) throw new Error('not a valid email address');
      await upsertContact(p.email, names(p.full_name));
      await track(p.email, p.full_name, 'portal');
      await asAdmin((q) => q('update people set brevo_synced_at = now(), brevo_sync_error = null where id = $1', [p.id]));
      synced++;
    } catch (e: any) {
      await asAdmin((q) => q('update people set brevo_sync_error = $2 where id = $1', [p.id, String(e.message).slice(0, 200)]));
      failed++;
    }
  }

  const orgs = await asAdmin((q) => q(
    `select id, coalesce(contact_person, name) who, lower(contact_email) email from organisations
     where newsletter_consent and contact_email like '%@%' and status <> 'closed' and brevo_synced_at is null limit 200`));
  for (const o of orgs) {
    try {
      if (!isEmail(o.email)) throw new Error('not a valid email address');
      await upsertContact(o.email, names(o.who));
      await track(o.email, o.who, 'organisation');
      await asAdmin((q) => q('update organisations set brevo_synced_at = now(), brevo_sync_error = null where id = $1', [o.id]));
      synced++;
    } catch (e: any) {
      await asAdmin((q) => q('update organisations set brevo_sync_error = $2 where id = $1', [o.id, String(e.message).slice(0, 200)]));
      failed++;
    }
  }
  const guests = await asAdmin((q) => q(
    `select id, coalesce(name, '') who, lower(email) email from seminar_entries
     where newsletter_consent and email like '%@%' and brevo_synced_at is null limit 200`));
  for (const g of guests) {
    try {
      if (!isEmail(g.email)) throw new Error('not a valid email address');
      await upsertContact(g.email, names(g.who));
      await track(g.email, g.who, 'seminar');
      await asAdmin((q) => q('update seminar_entries set brevo_synced_at = now() where id = $1', [g.id]));
      synced++;
    } catch { failed++; }
  }
  return { synced, failed };
}

/** Checks the Brevo key without changing anything. Returns the account email on success. */
export async function checkKey(): Promise<{ ok: boolean; message: string }> {
  const key = process.env.BREVO_API_KEY;
  if (!key) return { ok: false, message: 'BREVO_API_KEY is not set in Vercel for this deployment.' };
  const r = await fetch(`${API}/account`, { headers: { 'api-key': key, accept: 'application/json' } });
  if (!r.ok) return { ok: false, message: `Brevo rejected the key (${r.status}).` };
  const j: any = await r.json().catch(() => ({}));
  return { ok: true, message: `Connected to Brevo as ${j.email ?? 'your account'}.` };
}

async function call(path: string, method: string, body?: unknown): Promise<any> {
  const key = process.env.BREVO_API_KEY;
  if (!key) throw new Error('BREVO_API_KEY is not set');
  const r = await fetch(`${API}${path}`, { method, headers: { 'api-key': key, 'content-type': 'application/json', accept: 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  if (!r.ok) throw new Error(`Brevo ${r.status}: ${text.slice(0, 160)}`);
  try { return text ? JSON.parse(text) : {}; } catch { return {}; }
}

/** One email to one person through Brevo's transactional service, from hello@elimuplus.com. Replies go to the same address. */
export async function sendTransactional(m: { to: string; name?: string; subject: string; html: string; text: string; headers?: Record<string, string>; tags?: string[] }) {
  await call('/smtp/email', 'POST', {
    sender: SENDER, replyTo: { email: SENDER.email, name: SENDER.name },
    to: [{ email: m.to, ...(m.name ? { name: m.name } : {}) }],
    subject: m.subject, htmlContent: m.html, textContent: m.text,
    ...(m.headers ? { headers: m.headers } : {}), ...(m.tags ? { tags: m.tags } : {}),
  });
}

/** Takes a person off the newsletter list in Brevo. If that fails, blocks the address instead so no campaign can reach them. */
export async function removeFromList(email: string) {
  try { await call(`/contacts/lists/${LIST_ID()}/contacts/remove`, 'POST', { emails: [email.toLowerCase()] }); }
  catch (e) { await call(`/contacts/${encodeURIComponent(email.toLowerCase())}`, 'PUT', { emailBlacklisted: true }); }
}

/** Dates (Nairobi, YYYY-MM-DD) on which a campaign is queued or was sent, so the weekly sequence can step aside on those days. */
export async function broadcastDays(): Promise<Set<string>> {
  const days = new Set<string>();
  for (const status of ['queued', 'sent']) {
    const j = await call(`/emailCampaigns?status=${status}&limit=20&sort=desc`, 'GET');
    for (const c of j.campaigns ?? []) {
      const when = c.scheduledAt || c.sentDate;
      if (when) days.add(new Date(when).toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' }));
    }
  }
  return days;
}

/** Makes sure Brevo tells the portal about unsubscribes, hard bounces and spam complaints. Safe to run twice. */
export async function ensureWebhook(url: string): Promise<'created' | 'exists'> {
  const j = await call('/webhooks?type=marketing', 'GET');
  if ((j.webhooks ?? []).some((w: any) => w.url === url)) return 'exists';
  await call('/webhooks', 'POST', { url, description: 'Elimu+ portal: unsubscribes and bounces', events: ['unsubscribed', 'hardBounce', 'spam'], type: 'marketing' });
  return 'created';
}
