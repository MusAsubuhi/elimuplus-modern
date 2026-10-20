'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { asUser } from '@/lib/db';
import { requirePartner } from '@/lib/session';
import { audit } from '@/lib/audit';
import { sendEmail } from '@/lib/mail';
import { fileName, makePdf, readParams } from '@/lib/org-report-run';

const BACK = '/portal/partner/reports';
const done = (qs: string, msg: string, kind: 'ok' | 'err' = 'ok'): never => redirect(`${BACK}?${qs}${qs ? '&' : ''}${kind}=${encodeURIComponent(msg)}`);
const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]{2,}$/;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

/**
 * Emails the PDF to people the organisation chooses. The organisation confirms they are allowed to receive it, the message names the sender,
 * replies go to the sender, and the send is recorded whether it worked or not.
 */
export async function sendOrgReport(f: FormData) {
  const me = await requirePartner();
  const p = readParams((k) => String(f.get(k) ?? ''), (k) => f.getAll(k).map(String));
  const qs = new URLSearchParams([...p.cohorts.map((c) => ['c', c]), ...p.sections.map((s) => ['s', s]), ['t', p.title]]).toString();
  if (me.preview) done(qs, 'Preview mode is read-only, so nothing was sent.', 'err');
  const to = Array.from(new Set(String(f.get('to') ?? '').split(/[\s,;]+/).map((x) => x.trim().toLowerCase()).filter(Boolean)));
  if (!to.length) done(qs, 'Add at least one email address to send to.', 'err');
  if (to.length > 10) done(qs, 'Send to at most 10 people at a time.', 'err');
  const bad = to.find((x) => !EMAIL.test(x));
  if (bad) done(qs, `“${bad}” is not a valid email address.`, 'err');
  if (f.get('confirm') !== 'on') done(qs, 'Please confirm that everyone you are sending to is allowed to see these results.', 'err');
  const orgId = me.orgIds?.[0];
  if (!orgId) done(qs, 'Your account is not linked to an organisation.', 'err');

  const message = String(f.get('message') ?? '').trim().slice(0, 1000);
  const r = await makePdf(me, p);
  if (!r.chosen.length) done(qs, 'Choose at least one cohort.', 'err');
  const log = (status: string, error: string | null) => asUser(me.id, (q) => q(
    `insert into report_exports(organisation_id,created_by,title,cohort_ids,sections,format,action,recipients,message,status,error) values($1,$2,$3,$4,$5,'pdf','email',$6,$7,$8,$9)`,
    [orgId, me.id, r.title, r.chosen.map((c) => c.id), p.sections, to, message || null, status, error]));

  if (!process.env.RESEND_API_KEY) {
    await log('not_configured', 'Email sending is not switched on yet.');
    done(qs, 'Email sending is not switched on yet, so nothing was sent. Download the PDF and attach it yourself.', 'err');
  }
  const subject = `${r.title}`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:600px;color:#1a1f1f">
    <h2 style="color:#0D3B3B;margin:0 0 8px">${esc(r.title)}</h2>
    <p style="margin:0 0 12px">${esc(me.displayName)} of ${esc(r.orgName)} has shared the attached results report with you.</p>
    ${message ? `<p style="border-left:4px solid #D4A843;padding:6px 12px;background:#f6faf9;margin:0 0 12px">${esc(message).replace(/\n/g, '<br>')}</p>` : ''}
    <p style="font-size:13px;color:#555;margin:0 0 4px">The report covers ${r.chosen.length} cohort${r.chosen.length === 1 ? '' : 's'} and contains aggregate figures only; no participant is named.</p>
    <p style="font-size:12px;color:#777;margin:12px 0 0">${esc(r.confidentiality)}. Prepared with Elimu+. Reply to this email to reach ${esc(me.displayName)}.</p></div>`;
  const text = `${r.title}\n\n${me.displayName} of ${r.orgName} has shared the attached results report with you.\n${message ? `\n${message}\n` : ''}\n${r.confidentiality}.`;
  const replyTo = (await asUser(me.id, (q) => q('select email from people where id=$1', [me.id])))[0]?.email as string | undefined;
  try {
    await sendEmail(to, subject, html, text, { attachments: [{ filename: fileName(r.title, 'pdf'), content: Buffer.from(r.bytes).toString('base64') }], replyTo: replyTo && EMAIL.test(replyTo) ? replyTo : undefined });
    await log('sent', null);
  } catch (e: any) {
    console.error('[sendOrgReport]', e);
    await log('failed', String(e?.message ?? e).slice(0, 300));
    done(qs, 'The email could not be sent. The attempt is in your history; you can download the PDF and send it yourself.', 'err');
  }
  await audit(me.id, `emailed report to ${to.length} recipient${to.length === 1 ? '' : 's'}`, 'report_exports');
  revalidatePath(BACK);
  done(qs, `Sent to ${to.join(', ')}.`);
}
