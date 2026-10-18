'use server';
import { redirect } from 'next/navigation';
import { asAdmin } from '@/lib/db';
import { normPhone } from '@/lib/accounts';
import { FEEDBACK_SCALES, FEEDBACK_TEXT, pushSeminarConsent } from '@/lib/seminar';

const s = (f: FormData, k: string, n = 500) => String(f.get(k) ?? '').trim().slice(0, n);
const mail = (v: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);

async function seminarByCode(code: string) {
  const r = await asAdmin((q) => q("select id, status from seminars where code = $1", [code]));
  return r[0] as { id: string; status: string } | undefined;
}
const to = (path: string, k: 'ok' | 'err', msg: string): never => redirect(`${path}?${k}=${encodeURIComponent(msg)}`);

export async function submitSignIn(f: FormData) {
  const code = s(f, 'code', 40), path = `/seminar/${code}`;
  if (s(f, '_gotcha')) to(path, 'ok', 'Thank you');
  const sem = await seminarByCode(code);
  if (!sem) to(path, 'err', 'This link is not valid.');
  if (sem!.status !== 'open') to(path, 'err', 'Sign-in for this seminar has closed.');
  const name = s(f, 'name', 120);
  const phone = normPhone(s(f, 'phone', 30));
  const email = s(f, 'email', 160).toLowerCase();
  if (!name) to(path, 'err', 'Please write your name.');
  if (!phone) to(path, 'err', 'Please write the phone number you use on WhatsApp or M-Pesa.');
  if (email && !mail(email)) to(path, 'err', 'That email address does not look right. You can leave it blank.');
  const consent = !!email && s(f, 'newsletter') === 'yes';
  let id = '';
  try {
    const dup = await asAdmin((q) => q("select id from seminar_entries where seminar_id=$1 and kind='signin' and phone=$2", [sem!.id, phone]));
    if (dup.length) to(path, 'ok', `${name}, you are already signed in. Welcome.`);
    const r = await asAdmin((q) => q(
      `insert into seminar_entries(seminar_id, kind, name, phone, email, group_label, newsletter_consent, answers)
       values ($1,'signin',$2,$3,$4,$5,$6,$7) returning id`,
      [sem!.id, name, phone, email || null, s(f, 'group', 120) || null, consent, JSON.stringify({ how_heard: s(f, 'how_heard', 200) })]));
    id = r[0].id;
  } catch (e: any) {
    if (e?.digest?.startsWith?.('NEXT_REDIRECT')) throw e;
    console.error('[seminar signin]', e); to(path, 'err', 'Could not save your sign-in. Please tell the host.');
  }
  if (consent) await pushSeminarConsent(id, email, name);
  to(path, 'ok', `Thank you, ${name.split(/\s+/)[0]}. You are signed in.`);
}

export async function submitFeedback(f: FormData) {
  const code = s(f, 'code', 40), path = `/seminar/${code}/feedback`;
  if (s(f, '_gotcha')) to(path, 'ok', 'Thank you');
  const sem = await seminarByCode(code);
  if (!sem) to(path, 'err', 'This link is not valid.');
  const answers: Record<string, any> = {};
  for (const sc of FEEDBACK_SCALES) {
    const v = Number(s(f, sc.key, 3));
    if (!(v >= 1 && v <= 5)) to(path, 'err', `Please choose 1 to 5 for: ${sc.label}`);
    answers[sc.key] = v;
  }
  for (const t of FEEDBACK_TEXT) { const v = s(f, t.key, 1500); if (v) answers[t.key] = v; }
  const again = s(f, 'again', 20);
  if (!['yes', 'maybe', 'no'].includes(again)) to(path, 'err', 'Please say whether you would come to another seminar.');
  answers.again = again;
  const phone = normPhone(s(f, 'phone', 30));
  try {
    await asAdmin((q) => q(
      `insert into seminar_entries(seminar_id, kind, name, phone, answers) values ($1,'feedback',$2,$3,$4)`,
      [sem!.id, s(f, 'name', 120) || null, phone || null, JSON.stringify(answers)]));
  } catch (e) { console.error('[seminar feedback]', e); to(path, 'err', 'Could not save your feedback. Please try again.'); }
  to(path, 'ok', 'Thank you. Your feedback helps us make the next seminar better.');
}
