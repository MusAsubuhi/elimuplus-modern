'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { asAdmin, asUser } from '@/lib/db';
import { requireMe } from '@/lib/session';
import { normPhone } from '@/lib/accounts';
import { alertFounders } from '@/lib/billing';
import { audit } from '@/lib/audit';

const s = (f: FormData, k: string, n = 500) => String(f.get(k) ?? '').trim().slice(0, n);
const go = (path: string, msg: string, kind: 'ok' | 'err' = 'ok'): never => redirect(`${path}?${kind}=${encodeURIComponent(msg)}`);

/** "We have paid": a partner tells us, we match it against the bank or M-Pesa statement and issue the receipt. */
export async function notifyPayment(f: FormData) {
  const me = await requireMe('org_admin');
  const P = '/portal/partner/billing';
  const amount = Math.round(Number(s(f, 'amount')));
  const ref = s(f, 'reference', 60);
  if (!(amount > 0)) go(P, 'Enter the amount you paid.', 'err');
  if (!ref) go(P, 'Enter the M-Pesa code or the bank reference, so we can match it.', 'err');
  let info = '';
  try {
    info = await asUser(me.id, async (q) => {
      const inv = (await q('select i.id, i.number, i.organisation_id, o.name from invoices i join organisations o on o.id=i.organisation_id where i.id=$1', [s(f, 'invoice')]))[0];
      if (!inv) throw new Error('invoice');
      await q(`insert into payment_notices(invoice_id, organisation_id, amount_kes, method, reference, paid_on, note, created_by)
               values ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [inv.id, inv.organisation_id, amount, ['mpesa', 'bank', 'cash'].includes(s(f, 'method')) ? s(f, 'method') : 'mpesa', ref, s(f, 'paid_on') || new Date().toISOString().slice(0, 10), s(f, 'note') || null, me.id]);
      return `${inv.name} paid KES ${amount.toLocaleString('en-KE')} for ${inv.number} (ref ${ref})`;
    });
  } catch (e) { console.error('[notice]', e); go(P, 'We could not record that. Check the invoice and try again.', 'err'); }
  await asAdmin((q) => alertFounders(q, 'A partner says they have paid', info, '/portal/deals', 'attention')).catch(() => {});
  revalidatePath(P);
  go(P, 'Thank you. We will match it against our statement and send your receipt.');
}

/** Lines of "Name, phone, F/M, birth year, consent" pasted from a spreadsheet or typed. */
function parseRoster(text: string) {
  const rows: { name: string; phone: string | null; gender: string | null; year: number | null; consent: boolean }[] = [];
  const bad: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    const c = t.split(/[,\t;]/).map((x) => x.trim());
    if (/^(name|full name|jina)\b/i.test(c[0])) continue;
    const name = c[0].replace(/\s+/g, ' ');
    if (!name || name.length < 2) { bad.push(t); continue; }
    const phone = c[1] ? normPhone(c[1]) : '';
    if (c[1] && !phone) { bad.push(`${name}: phone not valid`); continue; }
    const g = /^f/i.test(c[2] ?? '') ? 'F' : /^m/i.test(c[2] ?? '') ? 'M' : null;
    const y = Number(c[3]);
    rows.push({ name, phone: phone || null, gender: g, year: y > 1950 && y <= new Date().getFullYear() ? y : null, consent: /^(y|yes|true|1)/i.test(c[4] ?? '') });
  }
  return { rows, bad };
}

export async function addRoster(f: FormData) {
  const me = await requireMe('org_admin');
  const P = '/portal/partner/roster';
  const cohort = s(f, 'cohort');
  if (!cohort) go(P, 'Choose the cohort first.', 'err');
  const { rows, bad } = parseRoster(String(f.get('list') ?? '').slice(0, 60000));
  if (!rows.length) go(P, bad.length ? `Nothing could be added. ${bad.slice(0, 3).join('; ')}` : 'Paste at least one name.', 'err');
  let added = 0, dup = 0;
  try {
    await asUser(me.id, async (q) => {
      const co = (await q('select organisation_id from cohorts where id=$1', [cohort]))[0];
      if (!co) throw new Error('cohort');
      for (const r of rows) {
        const x = await q(
          `insert into cohort_roster(cohort_id, organisation_id, full_name, phone, gender, birth_year, guardian_consent, added_by)
           values ($1,$2,$3,$4,$5,$6,$7,$8) on conflict do nothing returning id`,
          [cohort, co.organisation_id, r.name, r.phone, r.gender, r.year, r.consent, me.id]);
        if (x.length) added++; else dup++;
      }
    });
  } catch (e) { console.error('[roster]', e); go(P, 'We could not add those. Make sure the cohort is one of yours.', 'err'); }
  revalidatePath(P);
  go(P, `${added} added${dup ? `, ${dup} already on the list` : ''}${bad.length ? `, ${bad.length} skipped (${bad.slice(0, 2).join('; ')})` : ''}.`);
}

export async function removeRoster(f: FormData) {
  const me = await requireMe('org_admin');
  await asUser(me.id, (q) => q("delete from cohort_roster where id=$1 and status='expected'", [s(f, 'id')]));
  revalidatePath('/portal/partner/roster');
  go('/portal/partner/roster', 'Removed.');
}

/** Founder or trainer: turn the partner's list into enrolled participants on the training day. */
export async function enrolRoster(f: FormData) {
  const me = await requireMe('facilitator', 'founder');
  const cohort = s(f, 'cohort');
  const P = `/portal/cohorts/${cohort}`;
  const ok = (await asUser(me.id, (q) => q('select 1 from cohorts where id=$1', [cohort]))).length > 0;
  if (!ok) go('/portal/cohorts', 'That cohort is not yours.', 'err');
  let n = 0, skipped = 0;
  await asAdmin(async (q) => {
    const co = (await q('select organisation_id from cohorts where id=$1', [cohort]))[0];
    const rows = await q("select * from cohort_roster where cohort_id=$1 and status='expected' order by created_at", [cohort]);
    for (const r of rows) {
      let p = r.phone ? (await q('select id from people where phone=$1 limit 1', [r.phone]))[0] : null;
      if (!p) {
        p = (await q(`insert into people(full_name, display_name, phone, preferred_language, birth_year) values ($1,$2,$3,'sw',$4) returning id`,
          [r.full_name, r.full_name.split(/\s+/)[0], r.phone, r.birth_year]))[0];
        await q(`insert into role_assignments(person_id, role, organisation_id) values ($1,'participant',$2)`, [p.id, co.organisation_id]);
      }
      const en = (await q(`insert into enrolments(cohort_id, person_id) values ($1,$2) on conflict (cohort_id, person_id) do update set cohort_id=excluded.cohort_id returning id`, [cohort, p.id]))[0];
      await q('insert into canvases(enrolment_id) values ($1) on conflict (enrolment_id) do nothing', [en.id]);
      await q("update cohort_roster set status='enrolled', enrolment_id=$2 where id=$1", [r.id, en.id]);
      n++;
    }
    skipped = 0;
  });
  await audit(me.id, `enrolled ${n} people from the partner list`, 'cohort_roster');
  revalidatePath(P);
  go(P, n ? `${n} participants enrolled from the partner's list. Add anyone who arrived but was not listed under the Google Form or by hand.` : 'There was nobody waiting on the partner list.');
}

/** After each training day: tell the partner what was covered, who came and who did not. */
export async function publishDaySummary(f: FormData) {
  const me = await requireMe('facilitator', 'founder');
  const cohort = s(f, 'cohort'), session = s(f, 'session');
  const P = `/portal/cohorts/${cohort}`;
  try {
    await asUser(me.id, async (q) => {
      const se = (await q('select id, day_number, session_date from sessions where id=$1 and cohort_id=$2', [session, cohort]))[0];
      if (!se) throw new Error('session');
      const att = await q(`select p.display_name name, a.present from attendance a join enrolments e on e.id=a.enrolment_id join people p on p.id=e.person_id where a.session_id=$1 order by p.display_name`, [session]);
      if (!att.length) throw new Error('attendance');
      const present = att.filter((a: any) => a.present).length;
      const row = (await q(
        `insert into day_summaries(cohort_id, session_id, day_number, held_on, covered, note_for_partner, present_count, absent_count, author_id, published_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,now())
         on conflict (session_id) do update set covered=excluded.covered, note_for_partner=excluded.note_for_partner, present_count=excluded.present_count,
           absent_count=excluded.absent_count, author_id=excluded.author_id, published_at=now() returning id`,
        [cohort, session, se.day_number, se.session_date, s(f, 'covered', 1500) || null, s(f, 'note', 1500) || null, present, att.length - present, me.id]))[0];
      await q('delete from day_summary_names where summary_id=$1', [row.id]);
      for (const a of att) await q('insert into day_summary_names(summary_id, cohort_id, name, present) values ($1,$2,$3,$4)', [row.id, cohort, a.name, a.present]);
    });
  } catch (e: any) { console.error('[summary]', e); go(P, e?.message === 'attendance' ? 'Save the attendance for this day first, then publish the summary.' : 'Could not publish the summary.', 'err'); }
  revalidatePath(P);
  revalidatePath('/portal/partner/timeline');
  go(P, 'Summary published. The partner can now see it under Our deliverables.');
}
