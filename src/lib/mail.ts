import 'server-only';
import { asAdmin } from './db';

const FROM = () => process.env.MAIL_FROM || 'Elimu+ Portal <alerts@elimuplus.com>';
const SITE = () => process.env.NEXT_PUBLIC_SITE_URL || 'https://elimuplus.com';
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

export async function sendEmail(to: string[], subject: string, html: string, text: string) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY is not set');
  const r = await fetch(process.env.RESEND_API_URL || 'https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM(), to, subject, html, text }),
  });
  if (!r.ok) throw new Error(`Resend ${r.status}: ${(await r.text()).slice(0, 200)}`);
}

export async function founderEmails(): Promise<string[]> {
  const rows = await asAdmin((q) => q(
    `select distinct lower(p.email) e from people p join role_assignments r on r.person_id=p.id
     where r.role='founder' and r.status='active' and p.email like '%@%'`));
  const extra = (process.env.ALERT_EXTRA_EMAILS || '').split(',').map((x) => x.trim().toLowerCase()).filter((x) => x.includes('@'));
  return Array.from(new Set([...rows.map((r) => r.e as string), ...extra]));
}

/**
 * Email every alert that has not been emailed yet to the founders, as one message.
 * Alerts are claimed first, so two requests can never send the same alert twice, and they go back in the queue if sending fails.
 * With no Resend key or no founder email on file, nothing is lost: the alerts stay queued and visible in the portal.
 */
export async function flushAlerts(): Promise<{ sent: number; queued: number; reason?: string }> {
  const to = await founderEmails();
  const queued = (await asAdmin((q) => q('select count(*)::int n from founder_alerts where emailed_at is null')))[0].n as number;
  if (!queued) return { sent: 0, queued: 0 };
  if (!process.env.RESEND_API_KEY) return { sent: 0, queued, reason: 'Email is not switched on yet (no RESEND_API_KEY).' };
  if (!to.length) return { sent: 0, queued, reason: 'No founder has an email address saved yet.' };

  const claimed = await asAdmin((q) => q(
    `update founder_alerts set emailed_at = now(), email_error = null
     where id in (select id from founder_alerts where emailed_at is null order by created_at limit 50 for update skip locked)
     returning *`));
  if (!claimed.length) return { sent: 0, queued: 0 };
  claimed.sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));
  const urgent = claimed.filter((a) => a.severity === 'urgent').length;
  const subject = (urgent ? `URGENT: ${urgent} urgent · ` : '') + `Elimu+ portal: ${claimed.length} new item${claimed.length === 1 ? '' : 's'} to look at`;
  const tone: Record<string, string> = { urgent: '#C8553D', attention: '#B8860B', info: '#0D3B3B' };
  const html = `<div style="font-family:Arial,sans-serif;max-width:600px">
    <h2 style="color:#0D3B3B;margin:0 0 4px">Elimu+ portal</h2><p style="color:#555;margin:0 0 16px">New activity since the last message. Nothing here has been marked seen.</p>
    ${claimed.map((a) => `<div style="border-left:4px solid ${tone[a.severity] || '#0D3B3B'};padding:6px 12px;margin:0 0 12px;background:#f6faf9">
      <b>${esc(a.title)}</b>${a.severity !== 'info' ? ` <span style="color:${tone[a.severity]};font-size:12px;text-transform:uppercase">${a.severity}</span>` : ''}
      ${a.body ? `<div style="color:#333;margin-top:2px;font-size:14px">${esc(String(a.body).slice(0, 500))}</div>` : ''}
      ${a.link ? `<div style="margin-top:4px"><a href="${SITE()}${a.link}" style="color:#0D3B3B">Open in the portal</a></div>` : ''}</div>`).join('')}
    <p style="font-size:12px;color:#777">Sign in at <a href="${SITE()}/portal/login">${SITE()}/portal/login</a> and open Alerts to mark items as seen.</p></div>`;
  const text = claimed.map((a) => `- ${a.title}${a.body ? ': ' + String(a.body).slice(0, 300) : ''}${a.link ? ` (${SITE()}${a.link})` : ''}`).join('\n');
  try {
    await sendEmail(to, subject, html, text);
    return { sent: claimed.length, queued: 0 };
  } catch (e: any) {
    console.error('[flushAlerts]', e);
    const ids = claimed.map((a) => a.id);
    await asAdmin((q) => q('update founder_alerts set emailed_at = null, email_error = $2 where id = any($1::uuid[])', [ids, String(e.message).slice(0, 300)]));
    return { sent: 0, queued: claimed.length, reason: String(e.message) };
  }
}

/** Fire after anything that may have raised an alert. Never lets an email problem break the user's action. */
export async function notify() {
  try { await flushAlerts(); } catch (e) { console.error('[notify]', e); }
}
