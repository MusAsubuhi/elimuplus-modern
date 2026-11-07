'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { asUser } from '@/lib/db';
import { requireFeature } from '@/lib/access';
import { requireMe } from '@/lib/session';
import { audit } from '@/lib/audit';
import { loadCalendar, newFeedToken } from '@/lib/calendar';
import { pairKey } from '@/lib/calendar-core';

const s = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
const go = (to: string, msg: string, kind: 'ok' | 'err' = 'ok'): never => redirect(`${to}${to.includes('?') ? '&' : '?'}${kind}=${encodeURIComponent(msg)}&n=${Date.now()}`);
const back = (f: FormData) => { const r = s(f, 'return'); return r.startsWith('/portal/calendar') ? r : '/portal/calendar'; };

/**
 * A founder confirms that two overlapping trainings are covered by different trainers.
 * The overlap is worked out again here, so a stale page cannot confirm something that has since become a real clash.
 */
export async function confirmClash(f: FormData) {
  const me = await requireMe('founder');
  const to = back(f);
  const [a, b] = pairKey(s(f, 'a'), s(f, 'b'));
  if (!/^[0-9a-f-]{36}$/.test(a) || !/^[0-9a-f-]{36}$/.test(b) || a === b) go(to, 'That pair of trainings was not recognised.', 'err');
  const note = s(f, 'note').slice(0, 500) || null;
  const found = await asUser(me.id, async (q) => {
    const { clashes } = await loadCalendar(q, { founder: true });
    const c = (clashes.get(a) ?? []).find((x) => x.otherId === b);
    if (!c) return 'gone' as const;
    if (!c.canConfirm) return 'blocked' as const;
    await q(`insert into calendar_clash_confirmations(cohort_a, cohort_b, confirmed_by, note) values ($1,$2,$3,$4)
             on conflict (cohort_a, cohort_b) do update set confirmed_by=excluded.confirmed_by, confirmed_at=now(), note=excluded.note`, [a, b, me.id, note]);
    return 'ok' as const;
  });
  if (found === 'gone') go(to, 'These trainings no longer overlap, so there is nothing to confirm.', 'err');
  if (found === 'blocked') go(to, 'Not confirmed: a trainer is on both trainings, or one of them has no trainer yet. Fix the trainers first.', 'err');
  await audit(me.id, 'confirmed an overlap of two trainings', 'calendar_clash_confirmations');
  revalidatePath('/portal/calendar');
  go(to, 'Confirmed. Each training has its own trainer.');
}

/** Takes a confirmation back, so the overlap shows as needing a check again. */
export async function withdrawClash(f: FormData) {
  const me = await requireMe('founder');
  const to = back(f);
  const [a, b] = pairKey(s(f, 'a'), s(f, 'b'));
  await asUser(me.id, (q) => q('delete from calendar_clash_confirmations where cohort_a=$1 and cohort_b=$2', [a, b]));
  await audit(me.id, 'withdrew the confirmation of an overlap', 'calendar_clash_confirmations');
  revalidatePath('/portal/calendar');
  go(to, 'Confirmation withdrawn. The overlap needs checking again.');
}

/** Makes (or replaces) this person's private phone calendar address. The old address stops working at once. */
export async function makeFeed(f: FormData) {
  const me = await requireFeature('calendar');
  const to = back(f);
  const token = newFeedToken();
  await asUser(me.id, (q) => q(
    `insert into calendar_feeds(person_id, token) values ($1,$2)
     on conflict (person_id) do update set token=excluded.token, created_at=now(), last_read_at=null`, [me.id, token]));
  await audit(me.id, 'made a phone calendar address', 'calendar_feeds');
  revalidatePath('/portal/calendar');
  go(to, 'Your phone calendar address is ready below.');
}

/** Switches the phone calendar address off. */
export async function removeFeed(f: FormData) {
  const me = await requireFeature('calendar');
  const to = back(f);
  await asUser(me.id, (q) => q('delete from calendar_feeds where person_id=$1', [me.id]));
  await audit(me.id, 'switched off the phone calendar address', 'calendar_feeds');
  revalidatePath('/portal/calendar');
  go(to, 'Your phone calendar address is switched off.');
}
