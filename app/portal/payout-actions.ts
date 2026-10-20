'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { asUser } from '@/lib/db';
import { requireMe } from '@/lib/session';
import { audit } from '@/lib/audit';
import { generateClaims, RATE_KINDS } from '@/lib/payouts';

const s = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
const done = (path: string, msg: string, kind: 'ok' | 'err' = 'ok'): never =>
  redirect(`${path}${path.includes('?') ? '&' : '?'}${kind}=${encodeURIComponent(msg)}`);
const clean = (e: any) => String(e?.message ?? '').replace(/^error: /i, '').slice(0, 200) || 'That did not work.';

/** A trainer says where they want to be paid. Only a number and the name it is registered in. */
export async function saveMethod(f: FormData) {
  const me = await requireMe('facilitator', 'founder');
  const method = ['mpesa', 'cash', 'bank_transfer'].includes(s(f, 'method')) ? s(f, 'method') : 'mpesa';
  const phone = s(f, 'phone').replace(/[^\d+]/g, '');
  if (method === 'mpesa' && phone.length < 9) done('/portal/earnings', 'Enter the M-Pesa number you want to be paid on.', 'err');
  try {
    await asUser(me.id, (q) => q(
      `insert into payout_methods(person_id,method,account_name,phone) values($1,$2,$3,$4)
       on conflict (person_id) do update set method=excluded.method, account_name=excluded.account_name, phone=excluded.phone`,
      [me.id, method, s(f, 'name') || null, method === 'mpesa' ? phone : null]));
  } catch (e) { done('/portal/earnings', clean(e), 'err'); }
  await audit(me.id, 'changed own payout details', 'payout_methods');
  revalidatePath('/portal/earnings');
  done('/portal/earnings', 'Payment details saved. A founder will confirm them with you before the next payment.');
}

export async function verifyMethod(f: FormData) {
  const me = await requireMe('founder');
  const person = s(f, 'person'), back = s(f, 'back') || '/portal/payouts';
  try { await asUser(me.id, (q) => q('update payout_methods set verified_on=current_date, verified_by=$2 where person_id=$1', [person, me.id])); }
  catch (e) { done(back, clean(e), 'err'); }
  await audit(me.id, 'verified payout details', 'payout_methods');
  revalidatePath('/portal/payouts');
  done(back, 'Payment details marked as confirmed.');
}

export async function saveRate(f: FormData) {
  const me = await requireMe('founder');
  const kind = s(f, 'kind'), amount = Math.round(Number(s(f, 'amount')));
  const tier = s(f, 'tier') === '' ? null : Number(s(f, 'tier'));
  const format = ['5-day', '12-day'].includes(s(f, 'format')) && kind.startsWith('delivery') ? s(f, 'format') : null;
  if (!(kind in RATE_KINDS) || !(amount > 0)) done('/portal/payouts?tab=rates', 'Choose what the rate is for and enter an amount.', 'err');
  await asUser(me.id, async (q) => {
    await q('delete from payout_rates where kind=$1 and coalesce(tier,-1)=coalesce($2::int,-1) and coalesce(format,\'\')=coalesce($3,\'\')', [kind, tier, format]);
    await q('insert into payout_rates(kind,tier,format,amount_kes,note) values($1,$2,$3,$4,$5)', [kind, tier, format, amount, s(f, 'note') || null]);
  }).catch((e) => done('/portal/payouts?tab=rates', clean(e), 'err'));
  await audit(me.id, 'changed the rate card', 'payout_rates');
  revalidatePath('/portal/payouts');
  done('/portal/payouts?tab=rates', 'Rate saved');
}
export async function deleteRate(f: FormData) {
  const me = await requireMe('founder');
  await asUser(me.id, (q) => q('delete from payout_rates where id=$1', [s(f, 'id')]));
  await audit(me.id, 'changed the rate card', 'payout_rates');
  revalidatePath('/portal/payouts');
  done('/portal/payouts?tab=rates', 'Rate removed');
}

/** Looks at a cohort's recorded work and creates or refreshes claims. Nothing is approved or paid by this. */
export async function generateForCohort(f: FormData) {
  const me = await requireMe('founder');
  const cohort = s(f, 'cohort');
  let r: Awaited<ReturnType<typeof generateClaims>>;
  try { r = await asUser(me.id, (q) => generateClaims(q, cohort, me.id)); } catch (e) { return done('/portal/payouts?tab=generate', clean(e), 'err'); }
  revalidatePath('/portal/payouts');
  const bits = [`${r.created} new`, `${r.updated} refreshed`, r.waiting ? `${r.waiting} still waiting for the work to be recorded` : ''].filter(Boolean).join(', ');
  const miss = r.missingRate.length ? ` No rate set for: ${r.missingRate.join('; ')}.` : '';
  done('/portal/payouts?tab=generate', `Claims: ${bits}.${miss}`, r.missingRate.length && !r.created && !r.updated ? 'err' : 'ok');
}

export async function addManualClaim(f: FormData) {
  const me = await requireMe('founder');
  const amount = Math.round(Number(s(f, 'amount')));
  if (!s(f, 'person') || !s(f, 'description') || !(amount > 0)) done('/portal/payouts?tab=generate', 'Choose a person, describe the work and enter an amount.', 'err');
  try { await asUser(me.id, (q) => q(`insert into payout_claims(person_id,cohort_id,kind,description,amount_kes,status,created_by) values($1,$2,'other',$3,$4,'ready',$5)`, [s(f, 'person'), s(f, 'cohort') || null, s(f, 'description'), amount, me.id])); }
  catch (e) { done('/portal/payouts?tab=generate', clean(e), 'err'); }
  revalidatePath('/portal/payouts');
  done('/portal/payouts?tab=generate', 'Claim added. It now waits for approval.');
}

export async function decideClaim(f: FormData) {
  const me = await requireMe('founder');
  const decision = ['approve', 'decline', 'query'].includes(s(f, 'decision')) ? s(f, 'decision') : 'query';
  let status = '';
  try { status = String((await asUser(me.id, (q) => q('select app.decide_payout_claim($1,$2,$3) r', [s(f, 'claim'), decision, s(f, 'note') || null])))[0].r); }
  catch (e) { done('/portal/payouts', clean(e), 'err'); }
  await audit(me.id, `payout claim ${decision}`, 'payout_claims');
  revalidatePath('/portal', 'layout');
  done('/portal/payouts', status === 'approved' ? 'Approved. It is ready to pay.' : status === 'ready' ? 'Your approval is recorded. This amount needs the other founder as well.' : `Claim ${status}.`);
}

export async function cancelClaim(f: FormData) {
  const me = await requireMe('founder');
  await asUser(me.id, (q) => q("update payout_claims set status='cancelled' where id=$1 and status in ('pending_work','ready','queried')", [s(f, 'claim')]));
  revalidatePath('/portal/payouts');
  done('/portal/payouts', 'Claim cancelled');
}

/** Records a payment that a founder has made, and settles the chosen approved claims. */
export async function recordPayout(f: FormData) {
  const me = await requireMe('founder');
  const person = s(f, 'person'), back = `/portal/payouts/pay/${person}`;
  const claims = f.getAll('claim').map(String);
  let id = '';
  try {
    id = String((await asUser(me.id, (q) => q('select app.record_payout($1,$2::uuid[],$3,$4,$5::date) r', [person, `{${claims.join(',')}}`, s(f, 'method'), s(f, 'reference').toUpperCase(), s(f, 'paid_on') || new Date().toISOString().slice(0, 10)])))[0].r);
  } catch (e) { done(back, clean(e), 'err'); }
  await audit(me.id, 'recorded a trainer payment', 'payouts');
  revalidatePath('/portal', 'layout');
  done(`/portal/payouts?tab=paid`, 'Payment recorded. The trainer can now see it on their earnings page.');
}
