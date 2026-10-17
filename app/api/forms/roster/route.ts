import { NextResponse } from 'next/server';
import { asAdmin } from '@/lib/db';
import { validSecret } from '@/lib/forms-auth';
import { normPhone } from '@/lib/accounts';
import { notify } from '@/lib/mail';

export const dynamic = 'force-dynamic';

type Q = (sql: string, params?: any[]) => Promise<any[]>;
const clean = (v: unknown, n = 160) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, n);
const phoneRows = (q: Q, phone: string) => q('select id, email, occupation from people where phone = $1 or phone = $2 limit 1', [phone, '+254' + phone.slice(1)]);

async function cohortFrom(q: Q, label: unknown) {
  const m = /\[([0-9a-f]{8})\]\s*$/i.exec(String(label ?? ''));
  if (!m) return null;
  return (await q('select id, name, organisation_id from cohorts where id::text like $1 limit 1', [m[1].toLowerCase() + '%']))[0] ?? null;
}

/** Finds the person by phone or creates them, then enrols them in the cohort with a canvas. Never overwrites what is already on record. */
async function enrolPerson(q: Q, cohort: { id: string; organisation_id: string }, name: string, phone: string, email: string, hasBusiness: boolean | null, note: string) {
  let created = false;
  let p = (await phoneRows(q, phone))[0];
  if (!p) {
    p = (await q(
      `insert into people(full_name, display_name, phone, email, preferred_language, occupation) values ($1,$2,$3,$4,'sw',$5) returning id, email, occupation`,
      [name, name.split(/\s+/)[0], phone, email || null, note || null]))[0];
    await q(`insert into role_assignments(person_id, role, organisation_id) values ($1,'participant',$2)`, [p.id, cohort.organisation_id]);
    created = true;
  } else {
    if (email && !p.email) await q('update people set email = $2 where id = $1', [p.id, email]);
    if (note && !p.occupation) await q('update people set occupation = $2 where id = $1', [p.id, note]);
  }
  const had = (await q('select id from enrolments where cohort_id = $1 and person_id = $2', [cohort.id, p.id])).length > 0;
  const en = (await q(
    `insert into enrolments(cohort_id, person_id, has_business_at_entry, track) values ($1,$2,$3,$4)
     on conflict (cohort_id, person_id) do update set cohort_id = excluded.cohort_id returning id`,
    [cohort.id, p.id, hasBusiness !== false, hasBusiness === false ? 'starter' : 'standard']))[0];
  await q('insert into canvases(enrolment_id) values ($1) on conflict (enrolment_id) do nothing', [en.id]);
  return { personId: p.id as string, enrolmentId: en.id as string, created, alreadyEnrolled: had };
}

/**
 * Receives cohort registrations and daily attendance from the Elimu+ Google Forms script.
 *  kind "register":   { response_id, cohort, participant_name, participant_phone, email, business_status, business_note }
 *  kind "attendance": { response_id, cohort, day, session_date, officer_name, present: [{name, phone}], newcomers: "Name, phone" per line }
 * The endpoint answers 200 with { ok: false, rejected } for data it cannot use, so the script reports it instead of retrying forever.
 */
export async function POST(req: Request) {
  if (!validSecret(req.headers.get('x-forms-secret'))) return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  let b: any;
  try { b = await req.json(); } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }); }
  const kind = String(b.kind ?? '');
  if (kind !== 'register' && kind !== 'attendance') return NextResponse.json({ error: 'unknown kind' }, { status: 400 });

  const out = await asAdmin(async (q) => {
    const cohort = await cohortFrom(q, b.cohort);
    if (!cohort) return { ok: false, rejected: 'This cohort is not in the portal yet. Add it under Cohorts, then submit again or enter these people there.' };

    if (kind === 'register') {
      const name = clean(b.participant_name, 120);
      const phone = normPhone(String(b.participant_phone ?? ''));
      if (!name) return { ok: false, rejected: 'Participant name missing.' };
      if (!phone) return { ok: false, rejected: `${name}: the phone number is not a valid Kenyan number, so they could not be added.` };
      const st = String(b.business_status ?? '');
      const hasBusiness = /already/i.test(st) ? true : /want to start|not started/i.test(st) ? false : null;
      const r = await enrolPerson(q, cohort, name, phone, clean(b.email, 120).toLowerCase(), hasBusiness, clean(b.business_note, 300));
      return { ok: true, ...r };
    }

    // attendance
    const day = Math.round(Number(b.day));
    if (!(day >= 1 && day <= 30)) return { ok: false, rejected: 'Day number missing.' };
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(b.session_date ?? '')) ? b.session_date : null;
    const session = (await q(
      `insert into sessions(cohort_id, day_number, session_date) values ($1,$2,coalesce($3::date, current_date))
       on conflict (cohort_id, day_number) do update set session_date = coalesce($3::date, sessions.session_date) returning id`,
      [cohort.id, day, date]))[0];

    // everyone enrolled starts as absent unless a row already exists; ticked people are present (a second form for the same day only adds)
    await q(
      `insert into attendance(session_id, enrolment_id, present) select $1, e.id, false from enrolments e where e.cohort_id = $2 and e.status <> 'dropped'
       on conflict (session_id, enrolment_id) do nothing`, [session.id, cohort.id]);
    let marked = 0;
    const unmatched: string[] = [];
    for (const pr of Array.isArray(b.present) ? b.present : []) {
      const phone = normPhone(String(pr?.phone ?? ''));
      const en = phone ? (await q(
        `select e.id from enrolments e join people p on p.id = e.person_id where e.cohort_id = $1 and (p.phone = $2 or p.phone = $3)`,
        [cohort.id, phone, '+254' + phone.slice(1)]))[0] : null;
      if (!en) { unmatched.push(clean(pr?.name, 80)); continue; }
      await q(
        `insert into attendance(session_id, enrolment_id, present) values ($1,$2,true)
         on conflict (session_id, enrolment_id) do update set present = true`, [session.id, en.id]);
      marked++;
    }

    // people who came but were not on the list: add them to the cohort and mark them present
    const added: string[] = [];
    const noPhone: string[] = [];
    for (const line of String(b.newcomers ?? '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 40)) {
      const phone = normPhone((/(\+?\d[\d\s-]{7,}\d)/.exec(line) || [''])[0]);
      const name = clean(line.replace(/(\+?\d[\d\s-]{7,}\d)/, '').replace(/[,;|:()-]+\s*$/g, '').replace(/^[,;|:()-]+/, ''), 120);
      if (!name) continue;
      if (!phone) { noPhone.push(name); continue; }
      const r = await enrolPerson(q, cohort, name, phone, '', null, '');
      await q(
        `insert into attendance(session_id, enrolment_id, present) values ($1,$2,true)
         on conflict (session_id, enrolment_id) do update set present = true`, [session.id, r.enrolmentId]);
      if (!r.alreadyEnrolled) added.push(name);
    }
    if (added.length || noPhone.length) {
      await q(`select app.raise_alert('roster', 'info', $1, $2, $3, null, null)`,
        [`Day ${day}: ${added.length + noPhone.length} new ${added.length + noPhone.length === 1 ? 'person' : 'people'} attended who were not on the ${cohort.name} list`,
         [added.length ? 'Added to the cohort: ' + added.join(', ') + '.' : '', noPhone.length ? 'No valid phone number, so not added: ' + noPhone.join(', ') + '.' : ''].filter(Boolean).join(' '),
         `/portal/cohorts/${cohort.id}`]);
    }
    const present = (await q('select count(*)::int n from attendance where session_id = $1 and present', [session.id]))[0].n;
    const total = (await q('select count(*)::int n from attendance where session_id = $1', [session.id]))[0].n;
    return { ok: true, sessionId: session.id, marked, present, total, added, noPhone, unmatched };
  });
  if ((out as any).added?.length || (out as any).noPhone?.length) await notify();
  return NextResponse.json(out);
}
