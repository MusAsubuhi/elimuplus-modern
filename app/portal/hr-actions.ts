'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { asUser } from '@/lib/db';
import { requireMe } from '@/lib/session';
import { audit } from '@/lib/audit';
import { regenerate, totals } from '@/lib/payroll-run';

const s = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
const n = (f: FormData, k: string) => { const v = Number(s(f, k).replace(/,/g, '')); return Number.isFinite(v) ? v : NaN; };
const dateOk = (x: string) => /^\d{4}-\d{2}-\d{2}$/.test(x);
const orNull = (x: string) => (x === '' ? null : x);
const go = (path: string, msg: string, kind: 'ok' | 'err' = 'ok'): never => redirect(`${path}${path.includes('?') ? '&' : '?'}${kind}=${encodeURIComponent(msg)}`);
const DEPTS = ['Programme', 'Partnerships', 'Marketing', 'Finance and admin', 'Leadership', 'Other'];
const TYPES = ['permanent', 'contract', 'casual', 'intern'];

// ---------- people ----------
export async function saveEmployee(f: FormData) {
  const me = await requireMe('founder');
  const id = s(f, 'id');
  const name = s(f, 'full_name'), title = s(f, 'job_title'), start = s(f, 'start_date');
  const back = id ? `/portal/hr/${id}` : '/portal/hr?view=team';
  if (!name || !title || !dateOk(start)) go(back, 'Name, job title and start date are needed.', 'err');
  const basic = n(f, 'basic_kes'), allow = n(f, 'allowances_kes') || 0;
  if (!(basic >= 0) || !(allow >= 0)) go(back, 'Pay must be a number, zero or more.', 'err');
  const dept = DEPTS.includes(s(f, 'department')) ? s(f, 'department') : 'Programme';
  const type = TYPES.includes(s(f, 'employment_type')) ? s(f, 'employment_type') : 'contract';
  const vals = [name, title, dept, type, start, orNull(s(f, 'probation_end')), orNull(s(f, 'contract_end')), orNull(s(f, 'manager_id')), basic, allow,
    orNull(s(f, 'phone')), orNull(s(f, 'email')), orNull(s(f, 'kra_pin')), orNull(s(f, 'nssf_no')), orNull(s(f, 'sha_no')), orNull(s(f, 'pay_to')), orNull(s(f, 'emergency_name')), orNull(s(f, 'emergency_phone')), orNull(s(f, 'note'))];
  const newId = await asUser(me.id, async (q) => {
    if (id) {
      await q(`update employees set full_name=$1, job_title=$2, department=$3, employment_type=$4, start_date=$5, probation_end=$6, contract_end=$7, manager_id=$8, basic_kes=$9, allowances_kes=$10,
               phone=$11, email=$12, kra_pin=$13, nssf_no=$14, sha_no=$15, pay_to=$16, emergency_name=$17, emergency_phone=$18, note=$19 where id=$20`, [...vals, id]);
      return id;
    }
    return (await q(`insert into employees(full_name, job_title, department, employment_type, start_date, probation_end, contract_end, manager_id, basic_kes, allowances_kes, phone, email, kra_pin, nssf_no, sha_no, pay_to, emergency_name, emergency_phone, note, created_by)
                     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) returning id`, [...vals, me.id]))[0].id;
  });
  await audit(me.id, `${id ? 'updated' : 'added'} employee ${name}`, 'employees');
  revalidatePath('/portal/hr');
  go(`/portal/hr/${newId}`, id ? 'Saved.' : 'Employee added. Fill in the onboarding checklist below.');
}

export async function saveOnboarding(f: FormData) {
  const me = await requireMe('founder'); const id = s(f, 'id');
  const keys = ['contract', 'id_copy', 'kra_pin', 'nssf', 'sha', 'bank', 'induction', 'policies', 'equipment'];
  const o: Record<string, boolean> = {}; for (const k of keys) o[k] = f.get(k) === 'on';
  await asUser(me.id, (q) => q('update employees set onboarding=$1::jsonb where id=$2', [JSON.stringify(o), id]));
  go(`/portal/hr/${id}`, 'Checklist saved.');
}

export async function exitEmployee(f: FormData) {
  const me = await requireMe('founder'); const id = s(f, 'id'), end = s(f, 'end_date');
  if (!dateOk(end)) go(`/portal/hr/${id}`, 'Choose the last working day.', 'err');
  await asUser(me.id, (q) => q(`update employees set status='exited', end_date=$1, exit_reason=$2 where id=$3`, [end, orNull(s(f, 'exit_reason')), id]));
  await audit(me.id, `exited employee ${id}`, 'employees');
  revalidatePath('/portal/hr'); go(`/portal/hr/${id}`, 'Marked as exited. Last pay is prorated in the payroll month of the last day.');
}
export async function reinstateEmployee(f: FormData) {
  const me = await requireMe('founder'); const id = s(f, 'id');
  await asUser(me.id, (q) => q(`update employees set status='active', end_date=null, exit_reason=null where id=$1`, [id]));
  go(`/portal/hr/${id}`, 'Back on the active list.');
}

// ---------- leave ----------
export async function addLeave(f: FormData) {
  const me = await requireMe('founder'); const emp = s(f, 'employee_id'); const back = s(f, 'back') || '/portal/hr?view=leave';
  const a = s(f, 'start_date'), b = s(f, 'end_date'), days = n(f, 'days'), kind = s(f, 'kind');
  if (!emp || !dateOk(a) || !dateOk(b) || b < a || !(days > 0)) go(back, 'Choose the person, the dates and the number of working days.', 'err');
  await asUser(me.id, (q) => q(`insert into leave_requests(employee_id, kind, start_date, end_date, days, status, note, decided_by) values ($1,$2,$3,$4,$5,'approved',$6,$7)`, [emp, kind, a, b, days, orNull(s(f, 'note')), me.id]));
  go(back, 'Leave recorded.');
}
export async function cancelLeave(f: FormData) {
  const me = await requireMe('founder'); const back = s(f, 'back') || '/portal/hr?view=leave';
  await asUser(me.id, (q) => q(`update leave_requests set status='cancelled' where id=$1`, [s(f, 'id')]));
  go(back, 'Leave cancelled.');
}

// ---------- hiring ----------
export async function addOpening(f: FormData) {
  const me = await requireMe('founder'); const title = s(f, 'title');
  if (!title) go('/portal/hr?view=hiring', 'Give the role a title.', 'err');
  await asUser(me.id, (q) => q(`insert into job_openings(title, department, description, status, created_by) values ($1,$2,$3,'open',$4)`, [title, orNull(s(f, 'department')), orNull(s(f, 'description')), me.id]));
  go('/portal/hr?view=hiring', 'Role opened.');
}
export async function setOpeningStatus(f: FormData) {
  const me = await requireMe('founder'); const st = s(f, 'status');
  if (!['open', 'closed', 'draft'].includes(st)) go('/portal/hr?view=hiring', 'Unknown status.', 'err');
  await asUser(me.id, (q) => q(`update job_openings set status=$1, closed_on = case when $1='closed' then current_date else null end where id=$2`, [st, s(f, 'id')]));
  go('/portal/hr?view=hiring', `Role ${st}.`);
}
export async function addCandidate(f: FormData) {
  const me = await requireMe('founder'); const name = s(f, 'full_name');
  if (!name || !s(f, 'opening_id')) go('/portal/hr?view=hiring', 'Candidate name is needed.', 'err');
  await asUser(me.id, (q) => q(`insert into candidates(opening_id, full_name, phone, email, source, expected_pay_kes, note) values ($1,$2,$3,$4,$5,$6,$7)`,
    [s(f, 'opening_id'), name, orNull(s(f, 'phone')), orNull(s(f, 'email')), orNull(s(f, 'source')), Number.isFinite(n(f, 'expected_pay_kes')) ? n(f, 'expected_pay_kes') : null, orNull(s(f, 'note'))]));
  go('/portal/hr?view=hiring', 'Candidate added.');
}
export async function moveCandidate(f: FormData) {
  const me = await requireMe('founder'); const st = s(f, 'stage');
  if (!['applied', 'screened', 'interview', 'offer', 'hired', 'rejected', 'withdrew'].includes(st)) go('/portal/hr?view=hiring', 'Unknown stage.', 'err');
  await asUser(me.id, (q) => q('update candidates set stage=$1 where id=$2', [st, s(f, 'id')]));
  go('/portal/hr?view=hiring', 'Moved.');
}
export async function addInterview(f: FormData) {
  const me = await requireMe('founder'); const cid = s(f, 'candidate_id'); const d = s(f, 'interview_on');
  if (!cid || !dateOk(d)) go('/portal/hr?view=hiring', 'Choose the candidate and the date.', 'err');
  const sc = (k: string) => { const v = n(f, k); return v >= 1 && v <= 5 ? Math.round(v) : null; };
  const rec = ['strong_yes', 'yes', 'maybe', 'no'].includes(s(f, 'recommendation')) ? s(f, 'recommendation') : null;
  await asUser(me.id, async (q) => {
    await q(`insert into interviews(candidate_id, interview_on, mode, interviewer, score_skills, score_communication, score_values, score_problem, recommendation, notes) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [cid, d, ['in_person', 'phone', 'online'].includes(s(f, 'mode')) ? s(f, 'mode') : 'in_person', orNull(s(f, 'interviewer')), sc('score_skills'), sc('score_communication'), sc('score_values'), sc('score_problem'), rec, orNull(s(f, 'notes'))]);
    await q(`update candidates set stage='interview' where id=$1 and stage in ('applied','screened')`, [cid]);
  });
  go('/portal/hr?view=hiring', 'Interview recorded.');
}
/** Turn a hired candidate into an employee record to complete. */
export async function hireCandidate(f: FormData) {
  const me = await requireMe('founder'); const cid = s(f, 'id');
  const id = await asUser(me.id, async (q) => {
    const c = (await q(`select c.*, o.title, o.department from candidates c join job_openings o on o.id=c.opening_id where c.id=$1`, [cid]))[0];
    if (!c) return null;
    await q(`update candidates set stage='hired' where id=$1`, [cid]);
    const dept = DEPTS.includes(c.department) ? c.department : 'Other';
    return (await q(`insert into employees(full_name, job_title, department, employment_type, start_date, basic_kes, phone, email, created_by) values ($1,$2,$3,'contract',current_date,$4,$5,$6,$7) returning id`,
      [c.full_name, c.title, dept, c.expected_pay_kes ?? 0, c.phone, c.email, me.id]))[0].id;
  });
  if (!id) go('/portal/hr?view=hiring', 'Candidate not found.', 'err');
  go(`/portal/hr/${id}`, 'Hired. Set the start date, pay and contract end, then complete the onboarding checklist.');
}

// ---------- KPIs and reviews ----------
export async function addKpi(f: FormData) {
  const me = await requireMe('founder'); const emp = s(f, 'employee_id'); const back = `/portal/hr/${emp}`;
  const target = n(f, 'target');
  if (!s(f, 'title') || !s(f, 'period') || !Number.isFinite(target)) go(back, 'A KPI needs a title, a period and a numeric target.', 'err');
  await asUser(me.id, (q) => q(`insert into kpis(employee_id, period, title, unit, target, weight, note) values ($1,$2,$3,$4,$5,$6,$7)`,
    [emp, s(f, 'period'), s(f, 'title'), orNull(s(f, 'unit')), target, Math.min(10, Math.max(1, Math.round(n(f, 'weight')) || 1)), orNull(s(f, 'note'))]));
  go(back, 'KPI added.');
}
export async function saveKpiActual(f: FormData) {
  const me = await requireMe('founder'); const emp = s(f, 'employee_id'); const v = s(f, 'actual');
  await asUser(me.id, (q) => q('update kpis set actual=$1 where id=$2', [v === '' ? null : Number(v.replace(/,/g, '')), s(f, 'id')]));
  go(`/portal/hr/${emp}`, 'Result saved.');
}
export async function addReview(f: FormData) {
  const me = await requireMe('founder'); const emp = s(f, 'employee_id'); const back = `/portal/hr/${emp}`;
  if (!s(f, 'period')) go(back, 'Name the review period, for example 2026 Q4.', 'err');
  const rating = n(f, 'rating');
  await asUser(me.id, (q) => q(`insert into reviews(employee_id, period, rating, strengths, development, next_goals, reviewed_by) values ($1,$2,$3,$4,$5,$6,$7)`,
    [emp, s(f, 'period'), rating >= 1 && rating <= 5 ? Math.round(rating) : null, orNull(s(f, 'strengths')), orNull(s(f, 'development')), orNull(s(f, 'next_goals')), me.id]));
  go(back, 'Review saved.');
}

// ---------- payroll ----------
const P = '/portal/payroll';
export async function createRun(f: FormData) {
  const me = await requireMe('founder'); const ym = s(f, 'month');
  if (!/^\d{4}-\d{2}$/.test(ym)) go(P, 'Choose the month.', 'err');
  const [y, m] = ym.split('-').map(Number); const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  let id: string | null = null;
  try {
    id = await asUser(me.id, async (q) => {
      if ((await q(`select 1 from payroll_runs where period_start=$1 and status <> 'void'`, [`${ym}-01`])).length) return null;
      const rid = (await q(`insert into payroll_runs(period_start, period_end, created_by) values ($1,$2,$3) returning id`, [`${ym}-01`, `${ym}-${String(last).padStart(2, '0')}`, me.id]))[0].id;
      await regenerate(q, rid);
      return rid;
    });
  } catch (e: any) { go(P, e.message ?? 'Could not create the run.', 'err'); }
  if (!id) go(P, 'There is already a payroll run for that month.', 'err');
  await audit(me.id, `created payroll run ${ym}`, 'payroll_runs');
  go(`${P}/${id}`, 'Payroll prepared from the active employees. Check each line, add any bonus or advance, then approve.');
}
export async function recalcRun(f: FormData) {
  const me = await requireMe('founder'); const id = s(f, 'id');
  try { await asUser(me.id, (q) => regenerate(q, id)); } catch (e: any) { go(`${P}/${id}`, e.message, 'err'); }
  go(`${P}/${id}`, 'Recalculated from current pay and rates.');
}
export async function savePayslipAdjust(f: FormData) {
  const me = await requireMe('founder'); const run = s(f, 'run_id');
  const bonus = n(f, 'bonus') || 0, other = n(f, 'other') || 0;
  if (bonus < 0 || other < 0) go(`${P}/${run}`, 'Bonus and deductions cannot be negative.', 'err');
  try {
    await asUser(me.id, async (q) => {
      if ((await q('select status from payroll_runs where id=$1', [run]))[0]?.status !== 'draft') throw new Error('Only a draft run can be changed.');
      await q('update payslips set bonus=$1, other_deduction=$2, other_note=$3 where id=$4 and run_id=$5', [bonus, other, orNull(s(f, 'note')), s(f, 'id'), run]);
      await regenerate(q, run);
    });
  } catch (e: any) { go(`${P}/${run}`, e.message, 'err'); }
  go(`${P}/${run}`, 'Line updated and tax recalculated.');
}
export async function approveRun(f: FormData) {
  const me = await requireMe('founder'); const id = s(f, 'id');
  await asUser(me.id, async (q) => {
    await totals(q, id);
    await q(`update payroll_runs set status='approved', approved_by=$1, approved_at=now() where id=$2 and status='draft'`, [me.id, id]);
  });
  await audit(me.id, `approved payroll run ${id}`, 'payroll_runs');
  revalidatePath('/portal/books'); revalidatePath('/portal/command');
  go(`${P}/${id}`, 'Approved. It now counts in the profit and loss and in what Elimu+ owes.');
}
export async function markPaid(f: FormData) {
  const me = await requireMe('founder'); const id = s(f, 'id'); const which = s(f, 'which'); const d = s(f, 'on');
  if (!dateOk(d) || !['net', 'statutory'].includes(which)) go(`${P}/${id}`, 'Choose the date paid.', 'err');
  await asUser(me.id, async (q) => {
    await q(`update payroll_runs set ${which === 'net' ? 'net_paid_on' : 'statutory_paid_on'}=$1 where id=$2 and status in ('approved','paid')`, [d, id]);
    await q(`update payroll_runs set status='paid' where id=$1 and net_paid_on is not null and statutory_paid_on is not null and status='approved'`, [id]);
  });
  revalidatePath('/portal/books');
  go(`${P}/${id}`, which === 'net' ? 'Net pay recorded as paid.' : 'Statutory remittance recorded as paid.');
}
export async function voidRun(f: FormData) {
  const me = await requireMe('founder'); const id = s(f, 'id');
  await asUser(me.id, (q) => q(`update payroll_runs set status='void' where id=$1 and net_paid_on is null and statutory_paid_on is null`, [id]));
  await audit(me.id, `voided payroll run ${id}`, 'payroll_runs');
  revalidatePath('/portal/books');
  go(P, 'Run voided. It no longer counts in the books. A run with payments recorded cannot be voided.');
}
export async function addRate(f: FormData) {
  const me = await requireMe('founder'); const key = s(f, 'key'), v = n(f, 'value'), d = s(f, 'effective_from');
  if (!/^[a-z0-9_]+$/.test(key) || !Number.isFinite(v) || !dateOk(d)) go(`${P}?view=rates`, 'A rate needs a key, a number and an effective date.', 'err');
  await asUser(me.id, (q) => q(`insert into statutory_rates(key, value, effective_from, note, created_by) values ($1,$2,$3,$4,$5) on conflict (key, effective_from) do update set value=excluded.value, note=excluded.note`, [key, v, d, orNull(s(f, 'note')), me.id]));
  await audit(me.id, `set statutory rate ${key} from ${d}`, 'statutory_rates');
  go(`${P}?view=rates`, 'Rate saved. New runs from that date use it; recalculate a draft to apply it.');
}
