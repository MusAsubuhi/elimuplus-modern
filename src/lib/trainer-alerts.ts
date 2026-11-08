import 'server-only';
import { asAdmin } from './db';
import { sendEmail } from './mail';
import { trainingEnds } from './billing';
import { d, iso } from './format';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const ROLE_WORD: Record<string, string> = { lead: 'lead trainer', co: 'co-facilitator', observer: 'observer (trainee)' };
const hhmm = (t: any) => (t ? String(t).slice(0, 5) : '');

export type NoticeResult = { emailed: boolean; reason?: 'no_email' | 'email_off' | 'failed' };

/**
 * Tell a trainer they are on a training: a notice in their portal and an email to the address on their record.
 * The notice is always saved first, so a mail problem never loses it and never breaks the assignment.
 */
export async function noticeAssigned(personId: string, cohortId: string, role: string, byName: string): Promise<NoticeResult> {
  const row = (await asAdmin((q) => q(
    `select c.id, c.name, c.format, c.start_date, c.end_date, c.venue, c.daily_start, c.daily_end, c.time_note, o.name org,
            p.email, coalesce(nullif(p.display_name,''), p.full_name) person_name
       from cohorts c join organisations o on o.id=c.organisation_id, people p where c.id=$1 and p.id=$2`, [cohortId, personId])))[0];
  if (!row) return { emailed: false, reason: 'failed' };
  const word = ROLE_WORD[role] ?? role;
  const start = row.start_date ? d(iso(row.start_date)) : null, endIso = row.start_date ? trainingEnds(row) : null, end = endIso ? d(endIso) : null;
  const when = start ? (end && end !== start ? `${start} to ${end}` : start) : 'dates to be confirmed';
  const time = row.daily_start && row.daily_end ? `${hhmm(row.daily_start)} to ${hhmm(row.daily_end)} each day (East Africa Time)${row.time_note ? `, ${row.time_note}` : ''}` : 'time not agreed yet';
  const link = `/portal/cohorts/${cohortId}`;
  const title = `You are ${role === 'lead' ? 'the lead trainer' : `${word.startsWith('a') || word.startsWith('o') ? 'an' : 'a'} ${word}`} on ${row.name}`;
  const lines = [`${row.org}`, `When: ${when}`, `Time: ${time}`, `Where: ${row.venue || 'venue to be confirmed'}`, `Assigned by ${byName}.`];
  const alert = (await asAdmin((q) => q(
    `insert into trainer_alerts(person_id, cohort_id, kind, title, body, link) values ($1,$2,'assigned',$3,$4,$5) returning id`,
    [personId, cohortId, title, lines.join('\n'), link])))[0];

  const email = String(row.email ?? '');
  if (!email.includes('@') || email.endsWith('.invalid')) return { emailed: false, reason: 'no_email' };
  if (!process.env.RESEND_API_KEY) return { emailed: false, reason: 'email_off' };
  const base = (process.env.PORTAL_URL || 'https://portal.elimuplus.com').replace(/\/$/, '');
  const html = `<div style="font-family:Arial,sans-serif;max-width:560px">
    <h2 style="color:#0D3B3B;margin:0 0 4px">Elimu+ training assignment</h2>
    <p style="color:#333">Hello ${esc(row.person_name)}, ${esc(byName)} has put you on a training as <b>${esc(word)}</b>.</p>
    <div style="border-left:4px solid #0D3B3B;padding:8px 14px;background:#f6faf9;margin:12px 0">
      <b>${esc(row.name)}</b><br>${esc(row.org)}<br>When: ${esc(when)}<br>Time: ${esc(time)}<br>Where: ${esc(row.venue || 'venue to be confirmed')}</div>
    <p><a href="${base}${link}" style="color:#0D3B3B;font-weight:bold">Open the training in the portal</a></p>
    <p style="font-size:12px;color:#777">The training also appears in your portal calendar. To see it in your phone calendar, open Training calendar and make your private address.</p></div>`;
  const text = `${title}\n\n${lines.join('\n')}\n\nOpen it: ${base}${link}`;
  try {
    await sendEmail([email], `Elimu+: ${title}`, html, text);
    await asAdmin((q) => q('update trainer_alerts set emailed_at=now() where id=$1', [alert.id]));
    return { emailed: true };
  } catch (e: any) {
    console.error('[trainer notice email]', e);
    await asAdmin((q) => q('update trainer_alerts set email_error=$2 where id=$1', [alert.id, String(e.message).slice(0, 300)]));
    return { emailed: false, reason: 'failed' };
  }
}
