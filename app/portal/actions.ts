'use server';
import { audit } from '@/lib/audit';
import { trainingDates, programmeDays } from '@/lib/billing';
import { syncDaySummary } from '@/lib/sessions';
import { alertFounders, issueReceipt, nextQuoteNumber, orgCode, quoteLines } from '@/lib/billing';
import { MIN_SESSIONS } from '@/lib/pricing';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { asAdmin, asUser, dbMode } from '@/lib/db';
import { requireMe } from '@/lib/session';
import { loginEmail } from '@/lib/accounts';
import { notify } from '@/lib/mail';

const back = (path: string, msg: string, kind: 'ok' | 'err' = 'ok'): never =>
  redirect(`${path}${path.includes('?') ? '&' : '?'}${kind}=${encodeURIComponent(msg)}`);
const s = (f: FormData, k: string) => String(f.get(k) ?? '').trim();

export async function demoLogin(f: FormData) {
  if ((await dbMode()) !== 'demo') redirect('/portal/login');
  const id = s(f, 'person');
  const ok = await asAdmin((q) => q('select 1 from people where id=$1', [id]));
  if (!ok.length) redirect('/portal/login');
  (await cookies()).set('elimu_demo', id, { path: '/', httpOnly: true, sameSite: 'lax', maxAge: 60 * 60 * 8 });
  redirect('/portal');
}

export async function passwordLogin(f: FormData) {
  const { createServerClient } = await import('@supabase/ssr');
  const jar = await cookies();
  const sb = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { getAll: () => jar.getAll(), setAll: (cs) => cs.forEach((c) => jar.set(c.name, c.value, c.options)) },
  });
  // Phone + PIN accounts use a synthetic email so people without email can sign in.
  const email = s(f, 'email') || loginEmail(s(f, 'phone'));
  const { error } = await sb.auth.signInWithPassword({ email, password: s(f, 'pin') });
  if (error) back('/portal/login', 'Sign-in failed. Check your number and PIN.', 'err');
  redirect('/portal');
}

export async function logout() {
  const jar = await cookies();
  jar.delete('elimu_demo');
  for (const c of jar.getAll()) if (c.name.startsWith('sb-')) jar.delete(c.name);
  redirect('/portal/login');
}

export async function setLang(f: FormData) {
  (await cookies()).set('elimu_lang', s(f, 'lang') === 'sw' ? 'sw' : 'en', { path: '/', maxAge: 60 * 60 * 24 * 365 });
  revalidatePath('/portal', 'layout');
  redirect(s(f, 'back') || '/portal');
}

/* ---------- canvas ---------- */
export async function saveCanvas(f: FormData) {
  const me = await requireMe();
  const canvasId = s(f, 'canvas');
  const box = Number(s(f, 'box'));
  const lang = s(f, 'lang') === 'en' ? 'en' : 'sw';
  const assisted = s(f, 'assisted') === '1';
  const returnTo = s(f, 'back') || '/portal/canvas';
  let saved = 0;
  await asUser(me.id, async (q) => {
    const keys = [...f.keys()].filter((k) => k.startsWith('q_'));
    for (const k of keys) {
      const key = k.slice(2);
      const answer = s(f, k);
      if (!answer) continue;
      const prev = await q(
        'select answer, version from canvas_answers where canvas_id=$1 and box_number=$2 and question_key=$3 order by version desc limit 1',
        [canvasId, box, key]);
      if (prev[0]?.answer === answer) continue;
      await q(
        `insert into canvas_answers(canvas_id,box_number,question_key,answer,language,assisted,entered_by,version)
         values($1,$2,$3,$4,$5,$6,$7,$8)`,
        [canvasId, box, key, answer, lang, assisted, me.id, (prev[0]?.version ?? 0) + 1]);
      saved++;
    }
    if (saved) await q("update canvases set updated_at=now() where id=$1", [canvasId]);
  });
  revalidatePath('/portal', 'layout');
  back(returnTo, saved ? 'saved' : 'nochange');
}

export async function submitCanvas(f: FormData) {
  const me = await requireMe();
  await asUser(me.id, (q) => q("update canvases set status='submitted', updated_at=now() where id=$1", [s(f, 'canvas')]));
  revalidatePath('/portal', 'layout');
  back('/portal/canvas', 'submitted');
}

export async function toggleUnlock(f: FormData) {
  const me = await requireMe('facilitator', 'founder');
  const cohort = s(f, 'cohort'), box = Number(s(f, 'box'));
  await asUser(me.id, async (q) => {
    const has = await q('select 1 from canvas_unlocks where cohort_id=$1 and box_number=$2', [cohort, box]);
    if (has.length) await q('delete from canvas_unlocks where cohort_id=$1 and box_number=$2', [cohort, box]);
    else await q('insert into canvas_unlocks(cohort_id,box_number) values($1,$2)', [cohort, box]);
  });
  revalidatePath(`/portal/cohorts/${cohort}`);
  back(`/portal/cohorts/${cohort}`, 'Canvas boxes updated');
}

/* ---------- session log ---------- */
export async function saveSessionLog(f: FormData) {
  const me = await requireMe('facilitator', 'founder');
  const cohort = s(f, 'cohort');
  const session = s(f, 'session');
  // Only the checks shown for this day are overwritten; anything saved earlier for other keys is kept.
  const known = ['canvas_order', 'cost_types_order', 'followup_dates_confirmed', 'certificates_ready'];
  const shown = new Set(f.getAll('shown').map(String).filter((k) => known.includes(k)));
  const [prev] = await asUser(me.id, (q) => q('select checks from session_logs where session_id=$1', [session])).catch(() => []);
  const checks = { ...((prev?.checks as Record<string, boolean>) ?? {}), ...Object.fromEntries([...shown].map((k) => [k, f.get(k) === 'on'])) };
  try {
    await asUser(me.id, (q) => q(
      `insert into session_logs(session_id,author_id,flow_rating,checks,hardest_concepts,went_well,to_improve,notable_quotes)
       values($1,$2,$3,$4::jsonb,$5,$6,$7,$8)
       on conflict (session_id) do update set flow_rating=excluded.flow_rating, checks=excluded.checks,
         hardest_concepts=excluded.hardest_concepts, went_well=excluded.went_well, to_improve=excluded.to_improve, notable_quotes=excluded.notable_quotes`,
      [session, me.id, Number(s(f, 'flow')) || null, JSON.stringify(checks), s(f, 'hardest'), s(f, 'well'), s(f, 'improve'), s(f, 'quotes')]));
  } catch (e) { console.error("[portal action]", e); back(`/portal/cohorts/${cohort}`, 'Could not save: you may not be assigned to this cohort.', 'err'); }
  await notify();
  revalidatePath(`/portal/cohorts/${cohort}`);
  back(`/portal/cohorts/${cohort}`, 'Session note saved');
}

/** A founder sets when a cohort starts and ends. Days that exist are re-dated one after another from the new start, skipping Saturdays and Sundays. */
export async function setCohortDates(f: FormData) {
  const me = await requireMe('founder');
  const cohort = s(f, 'cohort'), start = s(f, 'start'), end = s(f, 'end');
  const P = `/portal/cohorts/${cohort}`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) back(P, 'Enter both dates.', 'err');
  if (end < start) back(P, 'The end date cannot be before the start date.', 'err');
  await asUser(me.id, async (q) => {
    await q('update cohorts set start_date=$2::date, end_date=$3::date where id=$1', [cohort, start, end]);
    const fmt = (await q('select format from cohorts where id=$1', [cohort]))[0]?.format;
    const dates = trainingDates(start, programmeDays(fmt)); // weekends skipped
    for (let i = 0; i < dates.length; i++) await q('update sessions set session_date=$3::date where cohort_id=$1 and day_number=$2', [cohort, i + 1, dates[i]]);
  });
  await audit(me.id, `set cohort dates ${start} to ${end}`, 'cohorts');
  revalidatePath(P); revalidatePath('/portal/cohorts'); revalidatePath('/portal/partner'); revalidatePath('/portal/partner/timeline');
  back(P, 'Dates updated');
}

/** Saves who was present on a day and records that a trainer has confirmed it. Works for ticks made here and for what the Google Form sent in. */
export async function markAttendance(f: FormData) {
  const me = await requireMe('facilitator', 'founder');
  const cohort = s(f, 'cohort'), session = s(f, 'session');
  const present = new Set(f.getAll('present').map(String));
  await asUser(me.id, async (q) => {
    const en = await q("select id from enrolments where cohort_id=$1 and status <> 'dropped'", [cohort]);
    for (const e of en) {
      await q(`insert into attendance(session_id,enrolment_id,present) values($1,$2,$3)
               on conflict (session_id,enrolment_id) do update set present=excluded.present`, [session, e.id, present.has(e.id)]);
    }
    await q('update sessions set attendance_confirmed_at=now(), attendance_confirmed_by=$2 where id=$1 and cohort_id=$3', [session, me.id, cohort]);
    await syncDaySummary(q, cohort, session, me.id);
  });
  const ret = s(f, 'back') === 'attendance' ? '/portal/attendance' : `/portal/cohorts/${cohort}`;
  revalidatePath(`/portal/cohorts/${cohort}`); revalidatePath('/portal/attendance'); revalidatePath('/portal/needs'); revalidatePath('/portal/partner/timeline');
  back(ret, 'Attendance confirmed');
}

export async function recordVisit(f: FormData) {
  const me = await requireMe('facilitator', 'founder');
  const sched = s(f, 'schedule');
  const reached = s(f, 'reached') === 'yes';
  await asUser(me.id, async (q) => {
    if (!reached) {
      const r = await q('select attempts from followup_schedule where id=$1', [sched]);
      const a = (r[0]?.attempts ?? 0) + 1;
      await q("update followup_schedule set attempts=$2, status=$3 where id=$1", [sched, a, a >= 3 ? 'unreachable' : 'scheduled']);
      return;
    }
    await q(`insert into followup_visits(schedule_id,visited_on,still_operating,sold_within_14_days,income_direction,knows_breakeven,tracks_key_metric,confidence,notes,officer_id)
             values($1,current_date,$2,$3,$4,$5,$6,$7,$8,$9)
             on conflict (schedule_id) do update set visited_on=excluded.visited_on, still_operating=excluded.still_operating,
               sold_within_14_days=excluded.sold_within_14_days, income_direction=excluded.income_direction,
               knows_breakeven=excluded.knows_breakeven, tracks_key_metric=excluded.tracks_key_metric, confidence=excluded.confidence, notes=excluded.notes`,
      [sched, f.get('operating') === 'on', f.get('sold14') === 'on', s(f, 'income') || null, f.get('breakeven') === 'on', f.get('metric') === 'on', Number(s(f, 'confidence')) || null, s(f, 'notes'), me.id]);
    await q("update followup_schedule set status='done', attempts=attempts+1 where id=$1", [sched]);
  });
  await notify();
  revalidatePath('/portal', 'layout');
  back(s(f, 'back') || '/portal/cohorts', 'Visit recorded');
}

/* ---------- expenses ---------- */
export async function submitExpense(f: FormData) {
  const me = await requireMe('facilitator', 'founder');
  const amount = Number(s(f, 'amount'));
  const how = ['ahead', 'own_pocket', 'bank', 'cash', 'mpesa'].includes(s(f, 'how')) ? s(f, 'how') : 'ahead';
  const after = how !== 'ahead';
  const paidFrom = after ? how : 'to_be_paid';
  const purpose = ['training', 'followup_30', 'followup_60', 'followup_90', 'other'].includes(s(f, 'purpose')) ? s(f, 'purpose') : 'training';
  const cohort = s(f, 'cohort') || null;
  const spentOn = s(f, 'spent_on') || null;
  if (!(amount > 0) || !s(f, 'reason')) back('/portal/requests', 'Add an amount and a reason.', 'err');
  if (after && (!spentOn || spentOn > new Date().toISOString().slice(0, 10))) back('/portal/requests', 'Add the date the money was spent (not in the future).', 'err');
  if (purpose !== 'other' && !cohort) back('/portal/requests', 'Choose the cohort this is for. Use "No cohort" with "Something else" for costs that belong to no cohort.', 'err');
  let late = false;
  try {
    await asUser(me.id, async (q) => {
      if (cohort) {
        const c = (await q("select status from cohorts where id=$1", [cohort]))[0];
        if (!c) throw new Error('cohort not visible');
        if (c.status === 'requested' || c.status === 'quoted') throw new Error('cohort not active');
        if (c.status === 'closed') { if (!after) throw new Error('cohort not active'); late = true; }
      }
      await q('insert into expense_requests(requester_id,cohort_id,category_id,amount_kes,reason,purpose,paid_from,spent_on,reference,late,supplier_id) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
        [me.id, cohort, s(f, 'category') || null, amount, s(f, 'reason'), purpose, paidFrom, after ? spentOn : null, s(f, 'reference') || null, late, s(f, 'supplier') || null]);
    });
  } catch (e: any) {
    console.error("[portal action]", e);
    back('/portal/requests', e?.message === 'cohort not active' ? 'That cohort is not running. Requests for money attach to a confirmed, running or follow-up cohort. Money already spent can also go on a closed cohort.' : 'Could not save that record.', 'err');
  }
  await notify();
  revalidatePath('/portal/requests');
  back('/portal/requests', after ? 'Recorded. Now add the receipt below, then the other founder or a founder will confirm it.' : 'Request submitted. A founder will review it.');
}

export async function decideExpense(f: FormData) {
  const me = await requireMe('founder');
  const id = s(f, 'request');
  const decision = s(f, 'decision') as 'approve' | 'decline' | 'query';
  const note = s(f, 'note');
  try {
    await asUser(me.id, async (q) => {
      await q(`insert into expense_approvals(request_id,approver_id,decision,note) values($1,$2,$3,$4)
               on conflict (request_id,approver_id) do update set decision=excluded.decision, note=excluded.note`, [id, me.id, decision, note]);
      const req = (await q('select amount_kes, paid_from, spent_on from expense_requests where id=$1', [id]))[0];
      const thr = Number((await q("select value from settings where key='expense_threshold_kes'"))[0]?.value ?? 20000);
      const approvals = await q("select count(distinct approver_id)::int n from expense_approvals where request_id=$1 and decision='approve'", [id]);
      const need = req.amount_kes > thr ? 2 : 1;
      if (decision === 'decline') await q("update expense_requests set status='declined', decided_on=current_date where id=$1", [id]);
      else if (decision === 'query') await q("update expense_requests set status='queried' where id=$1", [id]);
      else if (approvals[0].n >= need) {
        // money already paid from the Elimu+ bank, M-Pesa or cash is settled the moment it is confirmed; only 'needs paying' and 'own money' wait for a payout
        if (['bank', 'cash', 'mpesa'].includes(req.paid_from)) await q("update expense_requests set status='paid', decided_on=current_date, paid_on=coalesce(spent_on,current_date), paid_amount_kes=amount_kes where id=$1", [id]);
        else await q("update expense_requests set status='approved', decided_on=current_date where id=$1", [id]);
      }
    });
  } catch (e) { console.error("[portal action]", e); back('/portal/approvals', 'You cannot decide on your own request.', 'err'); }
  revalidatePath('/portal', 'layout');
  back('/portal/approvals', 'Decision recorded');
}

export async function markExpensePaid(f: FormData) {
  const me = await requireMe('founder');
  const id = s(f, 'request');
  await asUser(me.id, (q) => q(
    "update expense_requests set status='paid', paid_on=current_date, paid_amount_kes=$2, receipt_note=$3 where id=$1 and status='approved'",
    [id, Number(s(f, 'paid')) || null, s(f, 'receipt')]));
  revalidatePath('/portal', 'layout');
  back('/portal/approvals', 'Marked as paid');
}

/** A founder ticks a paid record off once it matches the bank, M-Pesa or cash book and the receipt has been seen. */
export async function reconcileExpense(f: FormData) {
  const me = await requireMe('founder');
  const id = s(f, 'request');
  await asUser(me.id, (q) => q("update expense_requests set status='reconciled', reconciled_on=current_date, reconciled_by=$2 where id=$1 and status='paid'", [id, me.id]));
  revalidatePath('/portal', 'layout');
  back('/portal/expenses', 'Marked as reconciled');
}

/* ---------- partner ---------- */
/** Most trainings one request can hold. Enough for a full back-to-back series without letting a form run away. */
const MAX_TRAININGS_PER_REQUEST = 12;

/** An organisation asks for one training or a whole series of back-to-back trainings in a single request. Each training becomes its own cohort and its own quotation. */
export async function requestCohort(f: FormData) {
  const me = await requireMe('org_admin');
  const P = '/portal/partner/request';
  const org = s(f, 'org');
  const mine = (await asUser(me.id, (q) => q('select id, name, code from organisations where id=$1 and id in (select app.my_org_admin_orgs())', [org])))[0];
  if (!mine) back(P, 'That organisation is not yours.', 'err');
  // The form sends numbered rows (name_0, size_0 ...). An older single-row form without numbers still works.
  const count = Math.min(MAX_TRAININGS_PER_REQUEST, Math.max(1, Number(s(f, 'count')) || 1));
  const key = (k: string, i: number) => (f.has(`${k}_${i}`) ? `${k}_${i}` : k);
  const rows: { name: string; format: '5-day' | '12-day'; language: 'sw' | 'en'; audience: string; start: string | null; venue: string; size: number }[] = [];
  for (let i = 0; i < count; i++) {
    const size = Math.round(Number(s(f, key('size', i))));
    const blank = !s(f, key('name', i)) && !s(f, key('start', i)) && !(size > 0);
    if (blank && count > 1) continue; // an untouched extra row is ignored
    if (!(size > 0)) back(P, count > 1 ? `Training ${i + 1}: enter how many participants will attend.` : 'Enter how many participants will attend.', 'err');
    rows.push({
      name: s(f, key('name', i)) || `New cohort request ${i + 1}`,
      format: s(f, key('format', i)) === '12-day' ? '12-day' : '5-day',
      language: s(f, key('language', i)) === 'en' ? 'en' : 'sw',
      audience: s(f, key('audience', i)),
      start: s(f, key('start', i)) || null,
      venue: s(f, key('venue', i)),
      size,
    });
  }
  if (!rows.length) back(P, 'Add at least one training.', 'err');
  try {
    const made: { name: string; size: number; format: string; delayMin: number }[] = [];
    for (const r of rows) {
      const sessions = r.format === '12-day' ? 12 : MIN_SESSIONS;
      const cohort = (await asUser(me.id, (q) => q(
        `insert into cohorts(organisation_id,name,format,language,audience,start_date,venue,expected_participants,status)
         values($1,$2,$3,$4,$5,$6,$7,$8,'requested') returning id`,
        [org, r.name, r.format, r.language, r.audience, r.start, r.venue, r.size])))[0];
      // Spread the automatic release so a series does not all go out in the same minute.
      const delayMin = 40 + Math.floor(Math.random() * 110) + made.length * 5;
      await asAdmin(async (q) => {
        const num = await nextQuoteNumber(q, orgCode(mine.name, mine.code));
        const qt = (await q(
          `insert into quotes(organisation_id, cohort_id, number, participants, sessions, valid_until, status, self_service, requested_by, release_at)
           values ($1,$2,$3,$4,$5,current_date + 30,'draft',true,$6, now() + ($7 || ' minutes')::interval) returning id`,
          [org, cohort.id, num, r.size, sessions, me.id, String(delayMin)]))[0];
        for (const l of quoteLines(r.size, sessions)) await q('insert into quote_lines(quote_id, kind, description, qty, unit_kes) values ($1,$2,$3,$4,$5)', [qt.id, l.kind, l.description, l.qty, l.unit_kes]);
        // Partners may only create a cohort as 'requested' (database rule); it becomes 'quoted' once the quotation exists.
        await q("update cohorts set status='quoted' where id=$1 and status='requested'", [cohort.id]);
      });
      made.push({ name: r.name, size: r.size, format: r.format, delayMin });
    }
    const list = made.map((m) => `${m.name} (${m.size}, ${m.format})`).join('; ');
    await asAdmin((q) => alertFounders(q, `${mine.name} requested ${made.length === 1 ? 'a quotation' : `${made.length} quotations`}`,
      `${list}. ${made.length === 1 ? 'It' : 'They'} will be released to them automatically over the next couple of hours. Open Proposals and receipts to review or change ${made.length === 1 ? 'it' : 'them'}.`, '/portal/deals', 'info'));
  } catch (e) { console.error("[portal action]", e); back(P, 'Could not send the request. If some trainings were saved, they appear under Requests and bookings; send only the ones that are missing.', 'err'); }
  await notify();
  revalidatePath('/portal', 'layout');
  back(P, rows.length === 1
    ? 'Thank you. This is a new training of its own, and we are preparing its proposal and quotation. To add people to it, use Add participants next to it below.'
    : `Thank you. These are ${rows.length} new trainings, each on its own, and we are preparing a proposal and quotation for each. To add people to any of them, use Add participants next to it below.`);
}

export async function nominate(f: FormData) {
  const me = await requireMe();
  const birth = Number(s(f, 'birth')) || null;
  const minor = birth ? new Date().getFullYear() - birth < 18 : false;
  const role = s(f, 'role') || 'participant';
  const ret = s(f, 'back') || '/portal/partner';
  if (!s(f, 'name')) back(ret, 'Name is required. Phone or email is optional.', 'err');
  if (birth && !minor && f.get('own') !== 'on') back(ret, 'An adult must agree to be added. Tick that they have agreed for themselves.', 'err');
  try {
    await asUser(me.id, (q) => q(
      `insert into invitations(full_name,contact,role,organisation_id,cohort_id,birth_year,guardian_consent,own_consent,nominated_by,note)
       values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [s(f, 'name'), s(f, 'contact') || null, role, s(f, 'org') || null, s(f, 'cohort') || null, birth, minor && f.get('guardian') === 'on', !minor && f.get('own') === 'on', me.id,
       minor ? 'Under 18: guardian consent needed before approval' : s(f, 'note')]));
  } catch (e) { console.error("[portal action]", e); back(ret, 'You are not allowed to nominate that role.', 'err'); }
  await notify();
  revalidatePath('/portal', 'layout');
  back(ret, 'Nomination sent for approval');
}

export async function decideInvitation(f: FormData) {
  const me = await requireMe('founder');
  const id = s(f, 'invitation');
  const ok = s(f, 'decision') === 'approve';
  const inv = (await asUser(me.id, (q) => q('select * from invitations where id=$1', [id])))[0];
  if (ok && inv?.birth_year && new Date().getFullYear() - inv.birth_year < 18 && !inv.guardian_consent)
    back('/portal/people', 'Guardian consent is required before approving someone under 18.', 'err');
  if (ok && inv?.birth_year && new Date().getFullYear() - inv.birth_year >= 18 && inv.own_consent === false)
    back('/portal/people', 'This adult has not agreed to be added. Adults agree for themselves; ask them first.', 'err');
  await asUser(me.id, (q) => q('update invitations set status=$2, approved_by=$3 where id=$1', [id, ok ? 'approved' : 'declined', me.id]));
  revalidatePath('/portal/people');
  back('/portal/people', ok ? 'Approved. An invitation can now be sent.' : 'Declined');
}

export async function recordGuardianConsent(f: FormData) {
  const me = await requireMe('founder');
  await asUser(me.id, (q) => q("update invitations set guardian_consent=true, note=coalesce(note,'') || ' | guardian consent recorded' where id=$1", [s(f, 'invitation')]));
  revalidatePath('/portal/people');
  back('/portal/people', 'Guardian consent recorded');
}

/* ---------- reports ---------- */
export async function advanceReport(f: FormData) {
  const me = await requireMe('master', 'founder');
  const id = s(f, 'report');
  const to = s(f, 'to');
  try {
    await asUser(me.id, async (q) => {
      if (to === 'reviewed') await q("update reports set status='reviewed', reviewed_by=$2 where id=$1", [id, me.id]);
      else if (to === 'released') await q("update reports set status='released', released_by=$2, released_on=current_date where id=$1", [id, me.id]);
      else if (to === 'draft') await q("update reports set status='draft', reviewed_by=null where id=$1", [id]);
    });
  } catch (e) { console.error("[portal action]", e); back(s(f, 'back') || '/portal/qa', 'You cannot do that step.', 'err'); }
  revalidatePath('/portal', 'layout');
  back(s(f, 'back') || '/portal/qa', `Report moved to ${to}`);
}

export async function recordPayment(f: FormData) {
  const me = await requireMe('founder');
  const inv = s(f, 'invoice');
  const amount = Number(s(f, 'amount'));
  const dest = s(f, 'back') === '/portal/deals' ? '/portal/deals' : '/portal/finance';
  if (!(amount > 0)) back(dest, 'Enter an amount.', 'err');
  const today = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
  const on = s(f, 'received_on') || today;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(on)) back(dest, 'Enter the date the money came in.', 'err');
  if (on > today) back(dest, 'The date received cannot be in the future.', 'err');
  if (on < '2025-12-01') back(dest, 'Elimu+ started in December 2025, so the date received cannot be earlier than that.', 'err');
  await asUser(me.id, async (q) => {
    const pay = (await q('insert into payments(invoice_id,amount_kes,method,reference,received_on,recorded_by) values($1,$2,$3,$4,$5::date,$6) returning id',
      [inv, amount, ['mpesa', 'bank', 'cash', 'card'].includes(s(f, 'method')) ? s(f, 'method') : 'mpesa', s(f, 'reference'), on, me.id]))[0];
    await issueReceipt(q, pay.id, on);
    const r = (await q(`select i.amount_kes::int a, coalesce((select sum(amount_kes) from payments where invoice_id=i.id),0)::int p from invoices i where i.id=$1`, [inv]))[0];
    await q('update invoices set status=$2 where id=$1', [inv, r.p >= r.a ? 'paid' : 'part_paid']);
  });
  revalidatePath('/portal', 'layout');
  back(dest, dest === '/portal/deals' ? 'Payment recorded and receipt issued. You will find the receipt in the Receipts list below; press Email to send it to the partner.' : 'Payment recorded and receipt issued. Send it from Proposals and receipts.');
}

/* ---------- leaving or completing the programme ---------- */
export async function recordExit(f: FormData) {
  const me = await requireMe('facilitator', 'founder');
  const eid = s(f, 'enrolment'), cohort = s(f, 'cohort');
  const status = s(f, 'status') === 'dropped' ? 'dropped' : s(f, 'status') === 'completed' ? 'completed' : 'enrolled';
  const path = `/portal/cohorts/${cohort}/participants/${eid}`;
  if (status === 'dropped' && !s(f, 'reason')) back(path, 'Say why the participant left, so partners see a reason and not just a number.', 'err');
  await asUser(me.id, (q) => q(
    `update enrolments set status = $2, exit_reason = $3, exit_note = $4, exited_on = case when $2 = 'dropped' then coalesce($5::date, current_date) else null end where id = $1`,
    [eid, status, status === 'dropped' ? s(f, 'reason') : null, s(f, 'note').slice(0, 1000) || null, s(f, 'date') || null]));
  revalidatePath(path);
  revalidatePath(`/portal/cohorts/${cohort}`);
  back(path, 'Saved.');
}


/** A founder takes someone off a cohort's participant list, for example a partner's administrator or a trainer who was added as a participant by mistake.
 *  Only the participation is removed: the person, their login and every other role they hold stay exactly as they are. */
export async function removeParticipant(f: FormData) {
  const me = await requireMe('founder');
  const eid = s(f, 'enrolment'), cohort = s(f, 'cohort');
  const P = `/portal/cohorts/${cohort}`;
  if (s(f, 'confirm') !== 'yes') back(`${P}/participants/${eid}`, 'Tick the box to confirm the removal.', 'err');
  let name = '';
  try {
    name = await asAdmin(async (q) => {
      const e = (await q('select e.id, p.id person_id, p.display_name from enrolments e join people p on p.id=e.person_id where e.id=$1 and e.cohort_id=$2', [eid, cohort]))[0];
      if (!e) throw new Error('gone');
      // Records that are evidence about a person (money, welfare, stories, certificates, listings) are never deleted here.
      for (const [tbl, what] of [['participant_stories', 'a story'], ['support_ledger', 'support entries'], ['welfare_flags', 'a welfare flag'], ['participant_certificates', 'a certificate'], ['directory_listings', 'a directory listing']])
        if ((await q(`select 1 from ${tbl} where enrolment_id=$1 limit 1`, [eid]))[0]) throw new Error(`keep:${what}`);
      // Everything else belongs to the place in the cohort and goes with it.
      for (const tbl of ['attendance', 'followup_schedule', 'canvases', 'baselines', 'learning_checks', 'exit_feedback']) await q(`delete from ${tbl} where enrolment_id=$1`, [eid]);
      await q('delete from cohort_roster where enrolment_id=$1', [eid]);
      await q('delete from enrolments where id=$1', [eid]);
      // the register summaries were counted with this person in them, so count again without
      for (const se of await q('select id from sessions where cohort_id=$1', [cohort])) await syncDaySummary(q, cohort, se.id, me.id);
      return e.display_name as string;
    });
  } catch (e: any) {
    back(`${P}/participants/${eid}`, String(e?.message).startsWith('keep:') ? `This participant has ${String(e.message).slice(5)} on record, which is not deleted here. Handle that first, then remove them.` : 'Could not remove that participant. They may already be gone.', 'err');
  }
  await audit(me.id, `removed ${name} from a cohort's participants (person and other roles kept)`, 'enrolments');
  revalidatePath(P); revalidatePath('/portal/cohorts'); revalidatePath('/portal/partner/roster'); revalidatePath('/portal/partner');
  back(P, `${name} was removed from this cohort's participants. Their account and any other roles are unchanged.`);
}
