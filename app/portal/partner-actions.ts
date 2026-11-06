'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { asAdmin, asUser } from '@/lib/db';
import { requireMe } from '@/lib/session';
import { normPhone } from '@/lib/accounts';
import { alertFounders, createInvoice } from '@/lib/billing';
import { rosterRoom, supplementCost } from '@/lib/roster';
import { FOLLOWUP_PER_PARTICIPANT } from '@/lib/pricing';
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

type RosterRow = { name: string; phone: string; gender: 'F' | 'M'; year: number; guardian: boolean; own: boolean };
const THIS_YEAR = () => new Date().getFullYear();

/** One person, checked. Name, phone, age and gender are all required. Under 18 needs a parent or guardian's agreement; an adult agrees for themselves, and no guardian is involved. */
function checkPerson(nameRaw: string, phoneRaw: string, genderRaw: string, ageRaw: string, consentRaw: boolean): { row?: RosterRow; error?: string } {
  const name = nameRaw.replace(/\s+/g, ' ').trim();
  if (name.length < 2) return { error: `${name || 'A line'}: name is missing` };
  const phone = normPhone(phoneRaw);
  if (!phone) return { error: `${name}: a valid phone number is needed (for example 0712345678)` };
  const g = /^f/i.test(genderRaw.trim()) ? 'F' : /^m/i.test(genderRaw.trim()) ? 'M' : null;
  if (!g) return { error: `${name}: gender is needed (F or M)` };
  const n = Number(String(ageRaw).trim());
  // Someone may type an age (17) or a year of birth (2009); both are accepted and stored as a birth year.
  const year = n >= 1900 ? n : n > 0 ? THIS_YEAR() - n : 0;
  const age = THIS_YEAR() - year;
  if (!year || age < 5 || age > 100) return { error: `${name}: age is needed (a number such as 19)` };
  if (age < 18 && !consentRaw) return { error: `${name}: under 18, so a parent or guardian must have agreed` };
  if (age >= 18 && !consentRaw) return { error: `${name}: an adult must agree to take part for themselves (tick the agreement)` };
  return { row: { name, phone, gender: g, year, guardian: age < 18, own: age >= 18 } };
}

/** Lines of "Name, phone, F/M, age, agreed (yes)" pasted from a spreadsheet or typed. Under 18: a guardian agreed. Adults agree for themselves: either "yes" on the line or the box above the list. */
function parseRoster(text: string, adultsAgreed = false) {
  const rows: RosterRow[] = [];
  const bad: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    const c = t.split(/[,\t;]/).map((x) => x.trim());
    if (/^(name|full name|jina)\b/i.test(c[0])) continue;
    const r = checkPerson(c[0] ?? '', c[1] ?? '', c[2] ?? '', c[3] ?? '', /^(y|yes|true|1)/i.test(c[4] ?? '') || adultsAgreed);
    if (r.row) rows.push(r.row); else bad.push(r.error!);
  }
  return { rows, bad };
}

/** The simple form: one block of fields per person, numbered name_0, phone_0 and so on. */
function parseRosterFields(f: FormData) {
  const rows: RosterRow[] = [];
  const bad: string[] = [];
  const n = Math.min(60, Number(f.get('count')) || 0);
  for (let i = 0; i < n; i++) {
    const name = s(f, `name_${i}`), phone = s(f, `phone_${i}`), age = s(f, `age_${i}`), gender = s(f, `gender_${i}`);
    if (!name && !phone && !age) continue; // an empty row is simply ignored
    const r = checkPerson(name, phone, gender, age, f.get(`consent_${i}`) === 'on');
    if (r.row) rows.push(r.row); else bad.push(r.error!);
  }
  return { rows, bad };
}

export async function addRoster(f: FormData) {
  const me = await requireMe('org_admin');
  const P = '/portal/partner/roster';
  const cohort = s(f, 'cohort');
  if (!cohort) go(P, 'Choose the cohort first.', 'err');
  const fromForm = parseRosterFields(f);
  const fromPaste = parseRoster(String(f.get('list') ?? '').slice(0, 60000), f.get('adults_agreed') === 'on');
  const rows = [...fromForm.rows, ...fromPaste.rows];
  const bad = [...fromForm.bad, ...fromPaste.bad];
  if (!rows.length) go(P, bad.length ? `Nothing could be added. ${bad.slice(0, 3).join('; ')}` : 'Enter at least one person.', 'err');
  let added = 0, dup = 0, held = 0;
  try {
    const { co, room } = await asUser(me.id, async (q) => ({
      co: (await q('select organisation_id from cohorts where id=$1', [cohort]))[0],
      room: await rosterRoom(q, cohort),
    }));
    if (!co) throw new Error('cohort');
    let left = room.room;
    for (const r of rows) {
      const within = left > 0;
      const args = [cohort, co.organisation_id, r.name, r.phone, r.gender, r.year, r.guardian, me.id, r.own];
      // People beyond the quoted number are kept apart as extras; only the server may create those, so a partner cannot get round the limit.
      const x = within
        ? await asUser(me.id, (q) => q(`insert into cohort_roster(cohort_id, organisation_id, full_name, phone, gender, birth_year, guardian_consent, added_by, own_consent)
             values ($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict do nothing returning id`, args))
        : await asAdmin((q) => q(`insert into cohort_roster(cohort_id, organisation_id, full_name, phone, gender, birth_year, guardian_consent, added_by, status, own_consent)
             values ($1,$2,$3,$4,$5,$6,$7,$8,'pending_extra',$9) on conflict do nothing returning id`, args));
      if (!x.length) dup++; else if (within) { added++; left--; } else held++;
    }
  } catch (e) { console.error('[roster]', e); go(P, 'We could not add those. Make sure the cohort is one of yours.', 'err'); }
  revalidatePath(P);
  go(P, `${added} added${held ? `, ${held} held as extra (beyond the number on your quotation, see below)` : ''}${dup ? `, ${dup} already on the list` : ''}${bad.length ? `, ${bad.length} skipped (${bad.slice(0, 2).join('; ')})` : ''}.`);
}

/** The partner agrees to the extra people: they join the list and a supplemental invoice is raised for the founders to review and send. */
export async function confirmExtras(f: FormData) {
  const me = await requireMe('org_admin');
  const P = '/portal/partner/roster';
  const cohort = s(f, 'cohort');
  let msg = '';
  try {
    const mine = await asUser(me.id, (q) => q('select c.id, c.name, c.organisation_id, o.name org_name from cohorts c join organisations o on o.id=c.organisation_id where c.id=$1', [cohort]));
    if (!mine.length) throw new Error('cohort');
    const c = mine[0];
    msg = await asAdmin(async (q) => {
      const room = await rosterRoom(q, cohort);
      const extras = await q("select id from cohort_roster where cohort_id=$1 and status='pending_extra' order by created_at", [cohort]);
      if (!extras.length || !room.quoted) throw new Error('none');
      const cost = supplementCost(room.cap ?? room.quoted, extras.length, room.sessions);
      const qt = (await q('select id from quotes where cohort_id=$1 order by issued_on desc limit 1', [cohort]))[0];
      const due = new Date(); due.setDate(due.getDate() + 14);
      const inv = await createInvoice(q, { quoteId: qt?.id ?? null, orgId: c.organisation_id, cohortId: cohort, kind: 'other', amount: cost.total, dueOn: due.toISOString().slice(0, 10),
        description: `Supplemental invoice: ${extras.length} additional participant${extras.length === 1 ? '' : 's'} added to ${c.name} after the quotation (${extras.length} × KES ${cost.rate} × ${room.sessions} sessions, plus follow-up at KES ${FOLLOWUP_PER_PARTICIPANT} each)` });
      await q("update cohort_roster set status='expected', extra_invoice_id=$2 where cohort_id=$1 and status='pending_extra'", [cohort, inv.id]);
      await alertFounders(q, `Supplemental invoice ready to review: ${c.org_name}`, `${extras.length} extra participant${extras.length === 1 ? '' : 's'} confirmed for ${c.name}. Invoice ${inv.number}, KES ${cost.total.toLocaleString('en-KE')}. Review it on Proposals and receipts, then email it.`, '/portal/deals', 'attention');
      return `${extras.length} extra ${extras.length === 1 ? 'person has' : 'people have'} joined the list. We have prepared a supplemental invoice for ${inv.number}, KES ${cost.total.toLocaleString('en-KE')}; you will find it under Invoices and payments once we have checked and sent it.`;
    });
  } catch (e) { console.error('[roster]', e); go(P, 'We could not confirm the extra people. There may be none waiting.', 'err'); }
  revalidatePath(P);
  go(P, msg);
}

export async function removeRoster(f: FormData) {
  const me = await requireMe('org_admin');
  await asUser(me.id, (q) => q("delete from cohort_roster where id=$1 and status in ('expected','pending_extra')", [s(f, 'id')]));
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
      let p = r.phone ? (await q('select id from people where phone=$1 or phone=$2 limit 1', [r.phone, '+254' + String(r.phone).slice(1)]))[0] : null;
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

/** The partner records support it gave a participant (stock, tools, cash, fees). It is kept apart from fees and costs, and founders see it on Finance. */
export async function recordSupport(f: FormData) {
  const me = await requireMe('org_admin');
  const cohort = s(f, 'cohort');
  const P = `/portal/partner/support?cohort=${cohort}`;
  const amount = Math.round(Number(s(f, 'amount')));
  const item = s(f, 'item', 200);
  const date = s(f, 'entry_date') || new Date().toISOString().slice(0, 10);
  if (!(amount > 0)) go(P, 'Enter how much was given, in shillings.', 'err');
  if (!item) go(P, 'Say what the support was for, for example stock, tools or school fees.', 'err');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > new Date().toISOString().slice(0, 10)) go(P, 'Choose the date it was given. It cannot be in the future.', 'err');
  try {
    await asUser(me.id, async (q) => {
      const r = (await q(`select r.enrolment_id, r.organisation_id, o.name org_name from cohort_roster r join organisations o on o.id=r.organisation_id where r.id=$1 and r.cohort_id=$2 and r.enrolment_id is not null`, [s(f, 'person'), cohort]))[0];
      if (!r) throw new Error('participant');
      await q(`insert into support_ledger(enrolment_id, entry_date, amount_kes, item, funder, note, source, given_by_org, recorded_by) values ($1,$2,$3,$4,$5,$6,'partner',$7,$8)`,
        [r.enrolment_id, date, amount, item, s(f, 'funder', 120) || r.org_name, s(f, 'note', 300) || null, r.organisation_id, me.id]);
    });
    await audit(me.id, `recorded support of KES ${amount}`, 'support_ledger');
  } catch (e) { console.error('[support]', e); go(P, 'We could not save that. Choose a participant from one of your own cohorts.', 'err'); }
  revalidatePath('/portal/partner/support');
  go(P, 'Recorded. Thank you.');
}

export async function removeSupport(f: FormData) {
  const me = await requireMe('org_admin');
  const P = `/portal/partner/support?cohort=${s(f, 'cohort')}`;
  const n = await asUser(me.id, (q) => q(`delete from support_ledger where id=$1 and source='partner' returning id`, [s(f, 'id')]));
  if (n.length) await audit(me.id, 'removed a support entry', 'support_ledger');
  revalidatePath('/portal/partner/support');
  go(P, n.length ? 'Removed.' : 'That entry could not be removed.', n.length ? 'ok' : 'err');
}

/** Founders can enter or correct support on any participant, for example what the programme itself gave, or a partner who sends the figures to us instead. */
export async function recordSupportFounder(f: FormData) {
  const me = await requireMe('founder');
  const P = '/portal/finance';
  const amount = Math.round(Number(s(f, 'amount')));
  const item = s(f, 'item', 200);
  const date = s(f, 'entry_date') || new Date().toISOString().slice(0, 10);
  if (!(amount > 0) || !item) go(P, 'Enter the participant, what the support was and the amount.', 'err');
  const given = s(f, 'given_by') === 'partner';
  try {
    await asUser(me.id, async (q) => {
      const org = (await q('select c.organisation_id from enrolments e join cohorts c on c.id=e.cohort_id where e.id=$1', [s(f, 'enrolment')]))[0];
      if (!org) throw new Error('enrolment');
      await q(`insert into support_ledger(enrolment_id, entry_date, amount_kes, item, funder, note, source, given_by_org, recorded_by) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [s(f, 'enrolment'), date, amount, item, s(f, 'funder', 120) || null, s(f, 'note', 300) || null, given ? 'partner' : 'founders', given ? org.organisation_id : null, me.id]);
    });
    await audit(me.id, `recorded support of KES ${amount}`, 'support_ledger');
  } catch (e) { console.error('[support]', e); go(P, 'We could not save that support entry.', 'err'); }
  revalidatePath('/portal/finance');
  go(P, 'Support recorded.');
}

export async function removeSupportFounder(f: FormData) {
  const me = await requireMe('founder');
  await asUser(me.id, (q) => q('delete from support_ledger where id=$1', [s(f, 'id')]));
  await audit(me.id, 'removed a support entry', 'support_ledger');
  revalidatePath('/portal/finance');
  go('/portal/finance', 'Support entry removed.');
}
