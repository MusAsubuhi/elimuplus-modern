'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { asAdmin, asUser } from '@/lib/db';
import { requireMe } from '@/lib/session';
import { audit } from '@/lib/audit';
import { notify, flushAlerts } from '@/lib/mail';
import { CONCERN_FROM_TEXT, reportLevelOf, templateFor } from '@/lib/levels';

const back = (path: string, msg: string, kind: 'ok' | 'err' = 'ok'): never =>
  redirect(`${path}${path.includes('?') ? '&' : '?'}${kind}=${encodeURIComponent(msg)}`);
const s = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
const num = (v: string) => (v !== '' && Number.isFinite(Number(v)) ? Math.round(Number(v)) : null);

/* ---------- day reports ---------- */
export async function submitDayReport(f: FormData) {
  const me = await requireMe('facilitator', 'founder');
  const level = me.roles.includes('founder') && me.tier === 0 ? 3 : reportLevelOf(me.tier);
  const tpl = templateFor(level);
  const answers: Record<string, any> = {};
  const core: Record<string, string> = {};
  for (const fld of tpl.fields) {
    const v = s(f, fld.key);
    if (fld.required && v === '') back('/portal/reports', `Please answer: ${fld.label}`, 'err');
    if (fld.core) core[fld.key] = v;
    else if (v !== '') answers[fld.key] = fld.type === 'number' || fld.type === 'scale' ? num(v) : v;
  }
  const concern = CONCERN_FROM_TEXT(core.concern ?? '');
  if (concern !== 'none' && !core.concern_note) back('/portal/reports', 'Please say what happened, so a person can follow it up.', 'err');
  const phase = ['training', 'followup_30', 'followup_60', 'followup_90', 'other'].includes(s(f, 'phase')) ? s(f, 'phase') : 'training';
  try {
    await asUser(me.id, async (q) => {
      const sup = (await q("select supervisor_id from supervision where person_id=$1 and status='active'", [me.id]))[0]?.supervisor_id ?? null;
      await q(
        `insert into day_reports(author_id, cohort_id, level, kind, phase, report_date, day_number, headcount, concern, concern_note, answers, routed_to, source)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'portal')`,
        [me.id, s(f, 'cohort') || null, level, tpl.kind === 'qa' ? 'qa' : 'day', phase, s(f, 'date') || new Date().toISOString().slice(0, 10),
         num(core.day_number ?? ''), num(core.headcount ?? ''), concern, core.concern_note || null, JSON.stringify(answers), sup]);
    });
  } catch (e) { console.error('[portal action]', e); back('/portal/reports', 'Could not save the report. Check the cohort and date and try again.', 'err'); }
  await notify();
  revalidatePath('/portal/reports');
  back('/portal/reports', 'Report sent. Thank you.');
}

export async function markReportSeen(f: FormData) {
  const me = await requireMe('founder', 'master', 'facilitator');
  const status = s(f, 'status') === 'actioned' ? 'actioned' : 'seen';
  try {
    await asUser(me.id, (q) => q(
      "update day_reports set status=$2, seen_by=$3, seen_at=now(), review_note=nullif($4,'') where id=$1", [s(f, 'report'), status, me.id, s(f, 'note')]));
  } catch (e) { console.error('[portal action]', e); back('/portal/reports', 'You cannot review that report.', 'err'); }
  revalidatePath('/portal/reports');
  back('/portal/reports', status === 'actioned' ? 'Marked as actioned' : 'Marked as seen');
}

/* ---------- supervision ---------- */
export async function assignSupervisor(f: FormData) {
  const me = await requireMe('founder');
  const person = s(f, 'person'), sup = s(f, 'supervisor');
  if (!person || !sup || person === sup) back('/portal/team', 'Choose a trainee or associate and a different supervisor.', 'err');
  try {
    await asUser(me.id, async (q) => {
      await q("update supervision set status='ended' where person_id=$1 and status='active'", [person]);
      await q('insert into supervision(person_id, supervisor_id) values ($1,$2)', [person, sup]);
    });
  } catch (e) { console.error('[portal action]', e); back('/portal/team', 'Could not assign that supervisor.', 'err'); }
  await audit(me.id, 'assigned a supervisor', 'supervision');
  revalidatePath('/portal/team');
  back('/portal/team', 'Supervisor assigned');
}

export async function assignToCohort(f: FormData) {
  const me = await requireMe('founder');
  const cohort = s(f, 'cohort'), person = s(f, 'person');
  const role = ['lead', 'co', 'observer'].includes(s(f, 'role')) ? s(f, 'role') : 'observer';
  const to = s(f, 'back') || '/portal/crm';
  if (!cohort || !person) back(to, 'Choose a person.', 'err');
  try {
    await asUser(me.id, (q) => q(
      'insert into cohort_facilitators(cohort_id, person_id, role) values ($1,$2,$3) on conflict (cohort_id, person_id) do update set role = excluded.role', [cohort, person, role]));
  } catch (e) { console.error('[portal action]', e); back(to, 'Could not add that person to the cohort.', 'err'); }
  revalidatePath('/portal', 'layout');
  back(to, 'Added to the cohort');
}

/* ---------- CRM ---------- */
export async function logActivity(f: FormData) {
  const me = await requireMe('founder', 'master');
  const to = s(f, 'back') || '/portal/crm';
  const org = s(f, 'organisation') || null, inv = s(f, 'invitation') || null;
  if (!org && !inv) back(to, 'Nothing selected.', 'err');
  if (!s(f, 'summary')) back(to, 'Write what was said or found, even one line.', 'err');
  try {
    await asUser(me.id, (q) => q(
      `insert into crm_activities(organisation_id, invitation_id, kind, outcome, summary, occurred_on, next_action, next_action_due, logged_by)
       values ($1,$2,$3,$4,$5,$6,nullif($7,''),$8,$9)`,
      [org, inv, s(f, 'kind') || 'call', s(f, 'outcome') || 'completed', s(f, 'summary'), s(f, 'date') || new Date().toISOString().slice(0, 10),
       s(f, 'next_action'), s(f, 'next_due') || null, me.id]));
    if (s(f, 'close_open') === 'on') {
      await asUser(me.id, (q) => q('update crm_activities set done = true where done = false and organisation_id is not distinct from $1 and invitation_id is not distinct from $2 and next_action_due is not null', [org, inv]));
    }
  } catch (e) { console.error('[portal action]', e); back(to, 'Could not save that entry.', 'err'); }
  revalidatePath('/portal', 'layout');
  back(to, 'Logged');
}

export async function completeAction(f: FormData) {
  const me = await requireMe('founder', 'master');
  await asUser(me.id, (q) => q('update crm_activities set done = true where id = $1', [s(f, 'activity')])).catch((e) => console.error('[portal action]', e));
  revalidatePath('/portal', 'layout');
  back(s(f, 'back') || '/portal/crm', 'Marked done');
}

export async function saveReadiness(f: FormData) {
  const me = await requireMe('founder', 'master');
  const org = s(f, 'organisation');
  const to = `/portal/crm/${org}`;
  const venueName = s(f, 'venue_name'), cap = num(s(f, 'venue_capacity'));
  try {
    await asUser(me.id, async (q) => {
      if (me.roles.includes('founder')) await q('update organisations set venue_name = nullif($2,\'\'), venue_capacity = $3 where id = $1', [org, venueName, cap]);
      for (const key of f.getAll('item').map(String)) {
        const st = s(f, `st_${key}`);
        if (!['unchecked', 'ok', 'issue', 'na'].includes(st)) continue;
        const note = s(f, `nt_${key}`);
        if (st === 'issue' && !note) throw new Error('issue-needs-note');
        await q(
          `insert into readiness_checks(organisation_id, item_key, status, note, checked_by, checked_on)
           values ($1,$2,$3,nullif($4,''),$5,current_date)
           on conflict (organisation_id, item_key) do update set status = excluded.status, note = excluded.note,
             checked_by = excluded.checked_by, checked_on = excluded.checked_on`, [org, key, st, note, me.id]);
      }
    });
  } catch (e: any) {
    if (e?.message === 'issue-needs-note') back(to, 'Say what the problem is for every item marked "issue".', 'err');
    console.error('[portal action]', e); back(to, 'Could not save the checks.', 'err');
  }
  await notify();
  revalidatePath('/portal', 'layout');
  back(to, 'Venue checks saved');
}

export async function setCohortStatus(f: FormData) {
  const me = await requireMe('founder');
  const to = s(f, 'back') || '/portal/crm';
  const status = s(f, 'status');
  if (!['requested', 'quoted', 'confirmed', 'delivering', 'followup', 'closed'].includes(status)) back(to, 'Unknown status.', 'err');
  try {
    await asUser(me.id, (q) => q('update cohorts set status = $2, readiness_override_note = coalesce(nullif($3,\'\'), readiness_override_note) where id = $1', [s(f, 'cohort'), status, s(f, 'override')]));
  } catch (e: any) {
    const m = String(e?.message ?? '');
    if (m.startsWith('Not ready')) back(to, 'Not ready yet: the organisation must be called, visited and pass every required venue check. A founder can still confirm by typing a reason in the override box.', 'err');
    console.error('[portal action]', e); back(to, 'Could not change the status.', 'err');
  }
  await audit(me.id, `set cohort status to ${status}${s(f, 'override') ? ' (readiness override)' : ''}`, 'cohorts');
  revalidatePath('/portal', 'layout');
  back(to, `Cohort is now ${status}`);
}

/* ---------- founder alerts ---------- */
export async function markAlertsRead(f: FormData) {
  const me = await requireMe('founder');
  const one = s(f, 'alert');
  await asUser(me.id, (q) => one
    ? q('insert into alert_reads(alert_id, person_id) values ($1,$2) on conflict do nothing', [one, me.id])
    : q('insert into alert_reads(alert_id, person_id) select id, $1 from founder_alerts on conflict do nothing', [me.id])).catch((e) => console.error('[portal action]', e));
  revalidatePath('/portal', 'layout');
  back('/portal/alerts', one ? 'Marked as seen' : 'All marked as seen');
}

export async function setMyEmail(f: FormData) {
  const me = await requireMe('founder');
  const email = s(f, 'email').toLowerCase();
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) back('/portal/alerts', 'That does not look like an email address.', 'err');
  await asAdmin((q) => q('update people set email = nullif($2,\'\') where id = $1', [me.id, email]));
  await audit(me.id, 'changed own alert email', 'people');
  revalidatePath('/portal/alerts');
  back('/portal/alerts', email ? 'Alerts will be emailed to ' + email : 'Alert email removed');
}

export async function sendAlertsNow() {
  await requireMe('founder');
  const r = await flushAlerts();
  back('/portal/alerts', r.sent ? `Sent ${r.sent} alert${r.sent === 1 ? '' : 's'} by email` : r.reason ?? 'Nothing waiting to be sent', r.sent || !r.queued ? 'ok' : 'err');
}
