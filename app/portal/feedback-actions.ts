'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { asAdmin, asUser } from '@/lib/db';
import { requireMe } from '@/lib/session';
import { audienceOf, usageOf } from '@/lib/feedback';
import { FRUSTRATIONS, MISSING, VALUABLE } from '@/lib/feedback-options';
import { todayNairobi } from '@/lib/book';

const bounce = (msg: string, kind: 'ok' | 'err'): never => redirect(`/portal/feedback?${kind}=${encodeURIComponent(msg)}`);

/** Stores one anonymous-to-founders answer. Founders only ever see totals (app.feedback_summary). */
export async function submitFeedback(f: FormData) {
  const me = await requireMe();
  const audience = audienceOf(me);
  if (!audience) redirect('/portal');
  const ease = Number(f.get('ease')), recommend = Number(f.get('recommend'));
  if (!(ease >= 1 && ease <= 5) || !(recommend >= 0 && recommend <= 10) || !Number.isInteger(ease) || !Number.isInteger(recommend)) bounce('Please answer the first two questions.', 'err');
  const valuable = f.getAll('valuable').map(String).filter((v) => VALUABLE[audience].includes(v)).slice(0, 3);
  const pick = (k: string, list: string[]) => { const v = String(f.get(k) ?? ''); return list.includes(v) ? v : null; };
  const u = await usageOf(me);
  try {
    await asUser(me.id, (q) => q(
      `insert into system_feedback (person_id, audience, round, ease, recommend, valuable, frustration, missing, tenure_days, visits)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [me.id, audience, u.round, ease, recommend, valuable, pick('frustration', FRUSTRATIONS), pick('missing', MISSING), u.tenure, u.visits]));
    await asAdmin((q) => q('update portal_usage set snooze_until = null where person_id=$1', [me.id])).catch(() => undefined);
  } catch (e) { console.error('[feedback]', e); bounce('Could not save your answers. Please try again.', 'err'); }
  revalidatePath('/portal', 'layout');
  redirect(`/portal?ok=${encodeURIComponent('Thank you. Your answers help us improve the portal.')}`);
}

/** "Not now": ask again in a week. */
export async function snoozeFeedback() {
  const me = await requireMe();
  const d = new Date(`${todayNairobi()}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 7);
  await asAdmin((q) => q('update portal_usage set snooze_until=$2 where person_id=$1', [me.id, d.toISOString().slice(0, 10)])).catch(() => undefined);
  revalidatePath('/portal', 'layout');
}
