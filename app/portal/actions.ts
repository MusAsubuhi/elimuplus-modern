'use server';
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
  const checks = Object.fromEntries(['canvas_order', 'cost_types_order', 'canvas_completion_checked', 'followup_dates_confirmed'].map((k) => [k, f.get(k) === 'on']));
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

export async function markAttendance(f: FormData) {
  const me = await requireMe('facilitator', 'founder');
  const cohort = s(f, 'cohort'), session = s(f, 'session');
  const present = new Set(f.getAll('present').map(String));
  await asUser(me.id, async (q) => {
    const en = await q('select id from enrolments where cohort_id=$1', [cohort]);
    for (const e of en) {
      await q(`insert into attendance(session_id,enrolment_id,present) values($1,$2,$3)
               on conflict (session_id,enrolment_id) do update set present=excluded.present`, [session, e.id, present.has(e.id)]);
    }
  });
  revalidatePath(`/portal/cohorts/${cohort}`);
  back(`/portal/cohorts/${cohort}`, 'Attendance saved');
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
  const purpose = ['training', 'followup_30', 'followup_60', 'followup_90', 'other'].includes(s(f, 'purpose')) ? s(f, 'purpose') : 'training';
  const cohort = s(f, 'cohort') || null;
  if (!(amount > 0) || !s(f, 'reason')) back('/portal/requests', 'Add an amount and a reason.', 'err');
  if (purpose !== 'other' && !cohort) back('/portal/requests', 'Choose the cohort this is for. Use "Something else" only for costs that belong to no cohort.', 'err');
  try {
    await asUser(me.id, async (q) => {
      if (cohort) {
        const c = (await q("select status from cohorts where id=$1", [cohort]))[0];
        if (!c) throw new Error('cohort not visible');
        if (c.status === 'closed' || c.status === 'requested' || c.status === 'quoted') throw new Error('cohort not active');
      }
      await q('insert into expense_requests(requester_id,cohort_id,category_id,amount_kes,reason,purpose) values($1,$2,$3,$4,$5,$6)',
        [me.id, cohort, s(f, 'category') || null, amount, s(f, 'reason'), purpose]);
    });
  } catch (e: any) {
    console.error("[portal action]", e);
    back('/portal/requests', e?.message === 'cohort not active' ? 'That cohort is not running. Requests attach to a confirmed, running or follow-up cohort.' : 'Could not submit that request.', 'err');
  }
  await notify();
  revalidatePath('/portal/requests');
  back('/portal/requests', 'Request submitted. A founder will review it.');
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
      const req = (await q('select amount_kes from expense_requests where id=$1', [id]))[0];
      const thr = Number((await q("select value from settings where key='expense_threshold_kes'"))[0]?.value ?? 20000);
      const approvals = await q("select count(distinct approver_id)::int n from expense_approvals where request_id=$1 and decision='approve'", [id]);
      const need = req.amount_kes > thr ? 2 : 1;
      if (decision === 'decline') await q("update expense_requests set status='declined', decided_on=current_date where id=$1", [id]);
      else if (decision === 'query') await q("update expense_requests set status='queried' where id=$1", [id]);
      else if (approvals[0].n >= need) await q("update expense_requests set status='approved', decided_on=current_date where id=$1", [id]);
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

/* ---------- partner ---------- */
export async function requestCohort(f: FormData) {
  const me = await requireMe('org_admin');
  try {
    await asUser(me.id, (q) => q(
      `insert into cohorts(organisation_id,name,format,language,audience,start_date,venue,expected_participants,status)
       values($1,$2,$3,$4,$5,$6,$7,$8,'requested')`,
      [s(f, 'org'), s(f, 'name') || 'New cohort request', s(f, 'format') === '12-day' ? '12-day' : '5-day', s(f, 'language') === 'en' ? 'en' : 'sw',
       s(f, 'audience'), s(f, 'start') || null, s(f, 'venue'), Number(s(f, 'size')) || null]));
  } catch (e) { console.error("[portal action]", e); back('/portal/partner/request', 'Could not send the request.', 'err'); }
  await notify();
  revalidatePath('/portal', 'layout');
  back('/portal/partner/request', 'Request sent. We will confirm details and a quote with you.');
}

export async function nominate(f: FormData) {
  const me = await requireMe();
  const birth = Number(s(f, 'birth')) || null;
  const minor = birth ? new Date().getFullYear() - birth < 18 : false;
  const role = s(f, 'role') || 'participant';
  const ret = s(f, 'back') || '/portal/partner';
  if (!s(f, 'name') || !s(f, 'contact')) back(ret, 'Name and phone or email are required.', 'err');
  try {
    await asUser(me.id, (q) => q(
      `insert into invitations(full_name,contact,role,organisation_id,cohort_id,birth_year,guardian_consent,nominated_by,note)
       values($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [s(f, 'name'), s(f, 'contact'), role, s(f, 'org') || null, s(f, 'cohort') || null, birth, f.get('guardian') === 'on', me.id,
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
  if (!(amount > 0)) back('/portal/finance', 'Enter an amount.', 'err');
  await asUser(me.id, async (q) => {
    await q('insert into payments(invoice_id,amount_kes,method,reference,received_on,recorded_by) values($1,$2,$3,$4,current_date,$5)',
      [inv, amount, s(f, 'method') || 'mpesa', s(f, 'reference'), me.id]);
    const r = (await q(`select i.amount_kes::int a, coalesce((select sum(amount_kes) from payments where invoice_id=i.id),0)::int p from invoices i where i.id=$1`, [inv]))[0];
    await q('update invoices set status=$2 where id=$1', [inv, r.p >= r.a ? 'paid' : 'part_paid']);
  });
  revalidatePath('/portal', 'layout');
  back('/portal/finance', 'Payment recorded');
}
