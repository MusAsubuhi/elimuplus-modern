import 'server-only';
import { asAdmin } from './db';

const API = 'https://api.brevo.com/v3';
const LIST_ID = () => Number(process.env.BREVO_LIST_ID || 3);
const isEmail = (v: unknown): v is string => typeof v === 'string' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);

/** Adds or updates one contact on the Elimu+ Newsletter list. Throws with Brevo's message so it can be shown in the portal. */
export async function upsertContact(email: string, attributes: Record<string, string>) {
  const key = process.env.BREVO_API_KEY;
  if (!key) throw new Error('BREVO_API_KEY is not set');
  const r = await fetch(`${API}/contacts`, {
    method: 'POST',
    headers: { 'api-key': key, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ email: email.toLowerCase(), attributes, listIds: [LIST_ID()], updateEnabled: true }),
  });
  if (!r.ok && r.status !== 204) throw new Error(`Brevo ${r.status}: ${(await r.text()).slice(0, 160)}`);
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
