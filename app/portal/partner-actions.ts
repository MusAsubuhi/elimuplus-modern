'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { asAdmin, asUser } from '@/lib/db';
import { requireMe } from '@/lib/session';
import { normPhone } from '@/lib/accounts';
import { alertFounders, createInvoice } from '@/lib/billing';
import { rosterRoom, supplementCost } from '@/lib/roster';
import { audit } from '@/lib/audit';

const s = (f: FormData, k: string, n = 500) => String(f.get(k) ?? '').trim().slice(0, n);
const go = (path: string, msg: string, kind: 'ok' | 'err' = 'ok'): never => redirect(`${path}${path.includes('?') ? '&' : '?'}${kind}=${encodeURIComponent(msg)}`);

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

type RosterRow = { name: string; phone: string | null; gender: 'F' | 'M'; year: number; guardian: boolean; own: boolean };
const THIS_YEAR = () => new Date().getFullYear();

/** One person, checked. Name, age and gender are required; a phone number is optional (many young people do not have one) but must be valid if given. Under 18 needs a parent or guardian's agreement; an adult agrees for themselves, and no guardian is involved. */
function checkPerson(nameRaw: string, phoneRaw: string, genderRaw: string, ageRaw: string, consentRaw: boolean): { row?: RosterRow; error?: string } {
  const name = nameRaw.replace(/\s+/g, ' ').trim();
  if (name.length < 2) return { error: `${name || 'A line'}: name is missing` };
  const phone = phoneRaw.trim() ? normPhone(phoneRaw) : null;
  if (phoneRaw.trim() && !phone) return { error: `${name}: that phone number does not look right (for example 0712345678). Leave it blank if they have none` };
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

/** Lines of "Name, phone (may be blank), F/M, age, agreed (yes)" pasted from a spreadsheet or typed. Under 18: a guardian agreed. Adults agree for themselves: either "yes" on the line or the box above the list. */
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
  const cohort = s(f, 'cohort');
  // Always come back to the same training, never to a different one.
  const P = `/portal/partner/roster?cohort=${encodeURIComponent(cohort)}`;
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
    const before = room.active;
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
    // A training that is not confirmed yet is not charged extra; tell the founders so they can update its quotation before it is confirmed.
    if (!room.confirmed && room.quoted && before <= room.quoted && before + added > room.quoted) {
      const info = (await asUser(me.id, (q) => q('select c.name, o.name org_name from cohorts c join organisations o on o.id=c.organisation_id where c.id=$1', [cohort])))[0];
      await asAdmin((q) => alertFounders(q, `${info?.org_name ?? 'A partner'} is planning more people than quoted`, `${info?.name ?? 'This training'} is quoted for ${room.quoted} but ${before + added} are listed. It is not confirmed yet, so update its quotation to match before it is accepted.`, '/portal/deals', 'attention'));
    }
  } catch (e) { console.error('[roster]', e); go(P, 'We could not add those. Make sure the cohort is one of yours.', 'err'); }
  revalidatePath('/portal/partner/roster');
  go(P, `${added} added${held ? `, ${held} held as extra (beyond the number on your quotation, see below)` : ''}${dup ? `, ${dup} already on the list` : ''}${bad.length ? `, ${bad.length} skipped (${bad.slice(0, 2).join('; ')})` : ''}.`);
}

/** The partner agrees to the extra people: they join the list and a supplemental invoice is raised for the founders to review and send. */
export async function confirmExtras(f: FormData) {
  const me = await requireMe('org_admin');
  const cohort = s(f, 'cohort');
  const P = `/portal/partner/roster?cohort=${encodeURIComponent(cohort)}`;
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
      const qt = (await q("select id from quotes where cohort_id=$1 and scope='training' order by issued_on desc limit 1", [cohort]))[0];
      const due = new Date(); due.setDate(due.getDate() + 14);
      const inv = await createInvoice(q, { quoteId: qt?.id ?? null, orgId: c.organisation_id, cohortId: cohort, kind: 'other', amount: cost.total, dueOn: due.toISOString().slice(0, 10),
        description: `Supplemental invoice: ${extras.length} additional participant${extras.length === 1 ? '' : 's'} added to ${c.name} after the quotation (${extras.length} × KES ${cost.rate} × ${room.sessions} sessions)` });
      await q("update cohort_roster set status='expected', extra_invoice_id=$2 where cohort_id=$1 and status='pending_extra'", [cohort, inv.id]);
      await alertFounders(q, `Supplemental invoice ready to review: ${c.org_name}`, `${extras.length} extra participant${extras.length === 1 ? '' : 's'} confirmed for ${c.name}. Invoice ${inv.number}, KES ${cost.total.toLocaleString('en-KE')}. Review it on Proposals and receipts, then email it.`, '/portal/deals', 'attention');
      return `${extras.length} extra ${extras.length === 1 ? 'person has' : 'people have'} joined the list. We have prepared a supplemental invoice for ${inv.number}, KES ${cost.total.toLocaleString('en-KE')}; you will find it under Invoices and payments once we have checked and sent it.`;
    });
  } catch (e) { console.error('[roster]', e); go(P, 'We could not confirm the extra people. There may be none waiting.', 'err'); }
  revalidatePath('/portal/partner/roster');
  go(P, msg);
}

export async function removeRoster(f: FormData) {
  const me = await requireMe('org_admin');
  const gone = await asUser(me.id, (q) => q("delete from cohort_roster where id=$1 and status in ('expected','pending_extra') returning cohort_id", [s(f, 'id')]));
  revalidatePath('/portal/partner/roster');
  go(gone[0]?.cohort_id ? `/portal/partner/roster?cohort=${gone[0].cohort_id}` : '/portal/partner/roster', 'Removed.');
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

/* ---------- asking for a change to a training already booked ---------- */
const CHANGEABLE = ['requested', 'quoted', 'confirmed'];
const iso = (x: unknown) => (x ? String(x).slice(0, 10) : '');
const nairobiToday = () => new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
const addDays = (day: string, n: number) => new Date(Date.parse(day + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);

/** A partner asks for a change. Nothing changes until someone at Elimu+ approves it. */
export async function requestCohortChange(f: FormData) {
  const me = await requireMe('org_admin');
  const cohort = s(f, 'cohort');
  const P = `/portal/partner/trainings?cohort=${cohort}`;
  const reason = s(f, 'reason', 600);
  if (!reason) go(P, 'Tell us why the change is needed. It helps us decide quickly.', 'err');
  let msg = '';
  try {
    msg = await asUser(me.id, async (q) => {
      const c = (await q(`select c.*, o.name org_name from cohorts c join organisations o on o.id=c.organisation_id where c.id=$1 and c.organisation_id in (select app.my_org_admin_orgs())`, [cohort]))[0];
      if (!c) throw new Error('This training was not found.');
      if (!CHANGEABLE.includes(c.status)) throw new Error('This training has already started or finished, so changes can no longer be requested here. Please call us.');
      if ((await q("select 1 from cohort_change_requests where cohort_id=$1 and status='pending'", [cohort]))[0]) throw new Error('A change request for this training is already waiting for a decision. Withdraw it first if you want to send a different one.');
      const before = { name: c.name, start_date: iso(c.start_date), venue: c.venue || '', audience: c.audience || '', language: c.language, expected_participants: c.expected_participants };
      const want: Record<string, any> = {
        name: s(f, 'name', 120), start_date: s(f, 'start_date', 10), venue: s(f, 'venue', 200), audience: s(f, 'audience', 200),
        language: s(f, 'language', 2), expected_participants: s(f, 'expected_participants', 5) ? Math.round(Number(s(f, 'expected_participants', 5))) : null,
      };
      const changes: Record<string, any> = {};
      for (const k of Object.keys(want)) {
        const v = want[k];
        if (v === '' || v === null || Number.isNaN(v)) continue;
        if (String((before as any)[k] ?? '') !== String(v)) changes[k] = v;
      }
      if (!Object.keys(changes).length) throw new Error('Nothing is different from what we already have. Change at least one detail.');
      const today = nairobiToday();
      if (changes.start_date) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(changes.start_date)) throw new Error('Enter the new start date.');
        if (changes.start_date < today) throw new Error('The new start date cannot be in the past.');
      }
      if (changes.language && !['sw', 'en'].includes(changes.language)) throw new Error('Choose Kiswahili or English.');
      if ('expected_participants' in changes) {
        const n = changes.expected_participants;
        if (!(n >= 1 && n <= 500)) throw new Error('Enter a sensible number of participants.');
        const listed = Number((await q("select count(*)::int n from cohort_roster where cohort_id=$1 and status<>'withdrawn'", [cohort]))[0].n);
        if (n < listed) throw new Error(`You have already listed ${listed} people. Remove some from the list first, or ask for ${listed} or more.`);
      }
      // Close to the start (or after it) is flagged so whoever decides sees it straight away.
      const startNow = before.start_date;
      const late = !!startNow && startNow <= addDays(today, 7);
      await q(`insert into cohort_change_requests(cohort_id, organisation_id, requested_by, changes, before, reason, late) values ($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7)`,
        [cohort, c.organisation_id, me.id, JSON.stringify(changes), JSON.stringify(before), reason, late]);
      await alertFounders(q, `${late ? 'Late change requested' : 'Change requested'}: ${c.org_name}`,
        `${c.name}: ${Object.keys(changes).join(', ')}. ${late ? 'The training starts within a week, so please look at this today. ' : ''}Reason: ${reason}`, '/portal/changes', late ? 'urgent' : 'attention');
      return late ? 'Your request has been sent. Because the training starts within a week it has been marked urgent. Nothing changes until we approve it.' : 'Your request has been sent. Nothing changes until someone at Elimu+ approves it, and you will see the decision here.';
    });
  } catch (e: any) { go(P, e?.message && !/^(error|relation|new row)/i.test(e.message) && e.message.length < 220 ? e.message : 'Could not send the request. Please try again.', 'err'); }
  await audit(me.id, 'requested a change to a training', 'cohort_change_requests');
  revalidatePath('/portal/partner/trainings'); revalidatePath('/portal/changes');
  go(P, msg);
}

export async function withdrawCohortChange(f: FormData) {
  const me = await requireMe('org_admin');
  const id = s(f, 'request'), cohort = s(f, 'cohort');
  const mine = await asUser(me.id, (q) => q("select id from cohort_change_requests where id=$1 and status='pending' and requested_by is not null", [id]));
  if (mine.length) await asAdmin((q) => q("update cohort_change_requests set status='withdrawn', decided_at=now() where id=$1 and status='pending'", [id]));
  revalidatePath('/portal/partner/trainings'); revalidatePath('/portal/changes');
  go(`/portal/partner/trainings?cohort=${cohort}`, 'Request withdrawn.');
}
