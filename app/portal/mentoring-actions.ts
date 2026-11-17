'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { asAdmin, asUser } from '@/lib/db';
import { requireMe } from '@/lib/session';
import { requireFeature } from '@/lib/access';
import { audit } from '@/lib/audit';
import { normPhone, provisionLogin, tempPin } from '@/lib/accounts';
import { IMPROVE } from '@/lib/mentoring';
import type { PinState } from './team-actions';

const s = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
const uuid = (v: string) => /^[0-9a-f-]{36}$/.test(v);
const date = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const bounce = (to: string, msg: string, kind: 'ok' | 'err'): never => redirect(`${to}${to.includes('?') ? '&' : '?'}${kind}=${encodeURIComponent(msg)}`);
/** The database refuses unsafe circles and memberships with a plain sentence; show that sentence. */
const reason = (e: any) => {
  const m = String(e?.message ?? '');
  if (/row-level|permission/i.test(m)) return 'You do not have permission to do that.';
  const known = /(mentor must be|under 18|partner representative|at most five|enrolled in this|cannot also be|recorded as held|Feedback opens|Only members)/.exec(m);
  return known ? m.replace(/^.*?(The mentor|A circle|Someone|Add the|Only|A mentor|A session|Feedback)/, '$1') : 'That could not be saved. Check the details and try again.';
};
const portal = () => (process.env.NEXT_PUBLIC_PORTAL_URL || 'https://portal.elimuplus.com').replace(/\/$/, '');

/* ---------- founders: applications and vetting ---------- */

/** Turn a website mentor application into a mentor record in vetting. No sign-in is created. */
export async function startVetting(f: FormData) {
  const me = await requireFeature('mentoring', 'edit');
  const id = s(f, 'id');
  if (!uuid(id)) return;
  let mentorId = '';
  try {
    mentorId = await asUser(me.id, async (q) => {
      const e = (await q("select * from web_enquiries where id=$1 and kind='mentor' and status='new'", [id]))[0];
      if (!e) throw new Error('already handled');
      const p = (e.payload ?? {}) as Record<string, string>;
      const hours = Number(String(p.hours ?? '').replace(/\D/g, '')) || null;
      const m = (await q(
        `insert into mentors(enquiry_id, full_name, phone, email, county, occupation, serves, languages, hours_per_month, background, motivation, referee_name, referee_phone)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) returning id`,
        [id, e.name || p.full_name || 'Applicant', normPhone(e.phone ?? '') || e.phone || null, e.email, p.location || null, p.occupation || null,
         /youth/i.test(p.serves ?? '') && !/care|parent|adult/i.test(p.serves ?? '') ? 'youth' : /care|parent|adult/i.test(p.serves ?? '') && !/youth/i.test(p.serves ?? '') ? 'caregivers' : 'both',
         (p.languages ?? '').split(/[,/;]+/).map((x) => x.trim()).filter(Boolean).slice(0, 6), hours && hours <= 80 ? hours : null,
         (p.background || '').slice(0, 1500) || null, (p.motivation || '').slice(0, 1500) || null, p.referee_name || null, normPhone(p.referee_phone ?? '') || p.referee_phone || null]))[0];
      await q("update web_enquiries set status='accepted', handled_by=$2, handled_at=now() where id=$1", [id, me.id]);
      return m.id as string;
    });
  } catch (e) { bounce('/portal/enquiries', 'That application was already handled.', 'err'); }
  await audit(me.id, 'started vetting a mentor applicant', 'mentors');
  revalidatePath('/portal', 'layout');
  bounce(`/portal/mentoring/mentor/${mentorId}`, 'Vetting started. No sign-in exists yet; that comes only after every step below is recorded.', 'ok');
}

/** Record how far vetting has got: conversation, referee call, safeguarding briefing, signed agreement, and a private note. */
export async function saveVetting(f: FormData) {
  const me = await requireFeature('mentoring', 'edit');
  const id = s(f, 'id');
  if (!uuid(id)) return;
  await asUser(me.id, (q) => q(
    `update mentors set interview_on=$2, referee_on=$3, briefing_on=$4, agreement_on=$5, vetting_note=$6, phone=coalesce(nullif($7,''), phone), updated_at=now() where id=$1 and status in ('vetting','paused')`,
    [id, date(s(f, 'interview_on')), date(s(f, 'referee_on')), date(s(f, 'briefing_on')), date(s(f, 'agreement_on')), s(f, 'note').slice(0, 1500) || null, normPhone(s(f, 'phone'))]));
  revalidatePath(`/portal/mentoring/mentor/${id}`);
  bounce(`/portal/mentoring/mentor/${id}`, 'Saved.', 'ok');
}

/** Pass the applicant: create the person, the mentor role and the one-time PIN. Refused until every vetting step is recorded. */
export async function activateMentor(_prev: PinState, f: FormData): Promise<PinState> {
  const me = await requireFeature('mentoring', 'edit');
  const id = s(f, 'id');
  if (!uuid(id)) return { error: 'Mentor not found.' };
  const m = (await asUser(me.id, (q) => q('select * from mentors where id=$1', [id])))[0];
  if (!m) return { error: 'Mentor not found.' };
  if (m.status === 'active') return { error: 'This mentor is already active.' };
  if (!(m.interview_on && m.referee_on && m.briefing_on && m.agreement_on)) return { error: 'Record the conversation, the referee call, the safeguarding briefing and the signed agreement first.' };
  const phone = normPhone(m.phone ?? '');
  if (!phone) return { error: 'Add a valid Kenyan phone number above. It becomes their sign-in.' };
  let personId = '', existing = false;
  try {
    const found = (await asAdmin((q) => q('select id, auth_user_id from people where phone=$1 limit 1', [phone])))[0];
    if (found) { personId = found.id; existing = !!found.auth_user_id; }
    await asUser(me.id, async (q) => {
      if (!personId) {
        const sw = (m.languages ?? []).some((l: string) => /swahili|kiswahili/i.test(l)) && !(m.languages ?? []).some((l: string) => /english/i.test(l));
        personId = (await q(`insert into people(full_name, display_name, phone, email, preferred_language, occupation, county) values ($1,$2,$3,$4,$5,$6,$7) returning id`,
          [m.full_name, String(m.full_name).split(/\s+/)[0], phone, m.email, sw ? 'sw' : 'en', m.occupation, m.county]))[0].id;
      }
      if (!(await q("select 1 from role_assignments where person_id=$1 and role='mentor' and status='active'", [personId])).length)
        await q("insert into role_assignments(person_id, role) values ($1,'mentor')", [personId]);
      await q("update mentors set person_id=$2, phone=$3, status='active', decided_by=$4, activated_at=now(), updated_at=now() where id=$1", [id, personId, phone, me.id]);
    });
  } catch (e: any) { return { error: /unique/i.test(String(e?.message)) ? 'That person is already linked to another mentor record.' : 'Could not activate this mentor. ' + reason(e) }; }
  const first = String(m.full_name).split(/\s+/)[0];
  let pin: string | undefined;
  if (!existing) {
    pin = tempPin();
    try { await provisionLogin(personId, phone, pin); }
    catch (e: any) { return { error: `${m.full_name} is now an active mentor, but the sign-in could not be created (${e.message}). Use Reset PIN on the Team page.` }; }
  }
  await audit(me.id, `passed mentor: ${m.full_name}`, 'mentors');
  revalidatePath('/portal', 'layout');
  const message = existing
    ? `Hello ${first}, thank you for completing the Elimu+ mentor steps with us. The mentor role is now on your Elimu+ portal account. Sign in with your usual PIN at ${portal()}/portal/login and open My circles.`
    : `Hello ${first}, thank you for completing the Elimu+ mentor steps with us. Your account on the Elimu+ portal is ready.\n\nSign in here: ${portal()}/portal/login\nPhone: ${phone}\nTemporary PIN: ${pin}\n\nYou will choose your own PIN the first time you sign in. We will place you in a circle once a cohort is ready. Reply to this message if you need any help.`;
  return { ok: true, name: m.full_name, phone, pin: pin ?? '(existing PIN unchanged)', message };
}

export async function decideMentor(f: FormData) {
  const me = await requireFeature('mentoring', 'edit');
  const id = s(f, 'id'), to = s(f, 'to');
  if (!uuid(id) || !['declined', 'paused', 'ended', 'vetting'].includes(to)) return;
  try {
    await asUser(me.id, async (q) => {
      // Circles first, while the mentor is still active: the database refuses to touch a circle whose mentor is not.
      if (to === 'paused' || to === 'ended') await q("update mentoring_circles set status='planned' where mentor_id=$1 and status='active'", [id]);
      await q('update mentors set status=$2, vetting_note=coalesce(nullif($3,\'\'), vetting_note), decided_by=$4, updated_at=now() where id=$1', [id, to, s(f, 'note').slice(0, 1500), me.id]);
    });
  } catch (e) { bounce(`/portal/mentoring/mentor/${id}`, reason(e), 'err'); }
  await audit(me.id, `mentor ${to}`, 'mentors');
  revalidatePath('/portal/mentoring');
  bounce(`/portal/mentoring/mentor/${id}`, to === 'declined' ? 'Marked as not going ahead. Nothing was sent to them.' : to === 'vetting' ? 'Moved back to vetting.' : 'Updated.', 'ok');
}

/* ---------- founders: circles ---------- */

export async function createCircle(f: FormData) {
  const me = await requireFeature('mentoring', 'edit');
  const cohort = s(f, 'cohort'), mentor = s(f, 'mentor'), name = s(f, 'name');
  if (!uuid(cohort) || !uuid(mentor) || !name) bounce('/portal/mentoring', 'Choose a cohort, a mentor and give the circle a name.', 'err');
  let id = '';
  try {
    id = (await asUser(me.id, (q) => q(
      `insert into mentoring_circles(cohort_id, mentor_id, name, focus, start_date, place, partner_rep_name, partner_rep_phone, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
      [cohort, mentor, name.slice(0, 80), ['business', 'employability', 'mixed'].includes(s(f, 'focus')) ? s(f, 'focus') : 'business', date(s(f, 'start_date')), s(f, 'place').slice(0, 120) || null,
       s(f, 'rep_name').slice(0, 100) || null, normPhone(s(f, 'rep_phone')) || s(f, 'rep_phone').slice(0, 30) || null, me.id])))[0].id;
  } catch (e: any) { bounce('/portal/mentoring', /unique/i.test(String(e?.message)) ? 'That cohort already has a circle with this name.' : reason(e), 'err'); }
  await audit(me.id, 'created a mentoring circle', 'mentoring_circles');
  revalidatePath('/portal/mentoring');
  bounce(`/portal/circles/${id}`, 'Circle created. Add its members next (up to five people from the cohort).', 'ok');
}

export async function updateCircle(f: FormData) {
  const me = await requireFeature('mentoring', 'edit');
  const id = s(f, 'id');
  if (!uuid(id)) return;
  const status = ['planned', 'active', 'closed'].includes(s(f, 'status')) ? s(f, 'status') : null;
  try {
    await asUser(me.id, (q) => q(
      `update mentoring_circles set status=coalesce($2,status), partner_rep_name=coalesce(nullif($3,''),partner_rep_name), partner_rep_phone=coalesce(nullif($4,''),partner_rep_phone),
         place=coalesce(nullif($5,''),place), end_date = case when $2='closed' then current_date else end_date end where id=$1`,
      [id, status, s(f, 'rep_name').slice(0, 100), s(f, 'rep_phone').slice(0, 30), s(f, 'place').slice(0, 120)]));
  } catch (e) { bounce(`/portal/circles/${id}`, reason(e), 'err'); }
  revalidatePath(`/portal/circles/${id}`);
  bounce(`/portal/circles/${id}`, 'Circle updated.', 'ok');
}

export async function addMember(f: FormData) {
  const me = await requireFeature('mentoring', 'edit');
  const id = s(f, 'id'), person = s(f, 'person');
  if (!uuid(id) || !uuid(person)) bounce(`/portal/circles/${id}`, 'Choose a person.', 'err');
  try {
    await asUser(me.id, (q) => q(
      `insert into circle_members(circle_id, person_id) values ($1,$2)
       on conflict (circle_id, person_id) do update set status='active', left_on=null`, [id, person]));
  } catch (e) { bounce(`/portal/circles/${id}`, reason(e), 'err'); }
  revalidatePath(`/portal/circles/${id}`);
  bounce(`/portal/circles/${id}`, 'Added to the circle.', 'ok');
}

export async function removeMember(f: FormData) {
  const me = await requireFeature('mentoring', 'edit');
  const id = s(f, 'id'), person = s(f, 'person');
  if (!uuid(id) || !uuid(person)) return;
  await asUser(me.id, (q) => q("update circle_members set status='left', left_on=current_date where circle_id=$1 and person_id=$2", [id, person]));
  revalidatePath(`/portal/circles/${id}`);
  bounce(`/portal/circles/${id}`, 'Removed from the circle. Their past sessions and answers stay.', 'ok');
}

/* ---------- mentor (and founders): sessions ---------- */

export async function addMeeting(f: FormData) {
  const me = await requireMe('mentor', 'founder');
  const id = s(f, 'id'), on = date(s(f, 'held_on'));
  if (!uuid(id) || !on) bounce(`/portal/circles/${id}`, 'Choose the date of the session.', 'err');
  try {
    await asUser(me.id, (q) => q(
      `insert into circle_meetings(circle_id, held_on, minutes, place, topic, status, logged_by) values ($1,$2,$3,$4,$5,'planned',$6)`,
      [id, on, Math.min(480, Math.max(15, Number(s(f, 'minutes')) || 60)), s(f, 'place').slice(0, 120) || null, s(f, 'topic').slice(0, 160) || null, me.id]));
  } catch (e) { bounce(`/portal/circles/${id}`, reason(e), 'err'); }
  revalidatePath(`/portal/circles/${id}`);
  bounce(`/portal/circles/${id}`, 'Session added.', 'ok');
}

/** After a session: who came, private notes, anything that worries the mentor, and what each person commits to before next time. */
export async function recordMeeting(f: FormData) {
  const me = await requireMe('mentor', 'founder');
  const mid = s(f, 'meeting');
  if (!uuid(mid)) return;
  const mt = (await asUser(me.id, (q) => q('select m.*, c.has_minors, c.name circle_name from circle_meetings m join mentoring_circles c on c.id=m.circle_id where m.id=$1', [mid])))[0];
  if (!mt) return;
  const back = `/portal/circles/${mt.circle_id}`;
  const concern = f.get('concern') === 'on';
  const notes = s(f, 'notes').slice(0, 2000);
  try {
    await asUser(me.id, async (q) => {
      await q("update circle_meetings set status='held', minutes=$2, topic=coalesce(nullif($3,''),topic), logged_by=$4 where id=$1", [mid, Math.min(480, Math.max(15, Number(s(f, 'minutes')) || mt.minutes)), s(f, 'topic').slice(0, 160), me.id]);
      const members = await q("select person_id from circle_members where circle_id=$1 and status='active'", [mt.circle_id]);
      for (const m of members) {
        await q('insert into circle_attendance(meeting_id, person_id, attended) values ($1,$2,$3) on conflict (meeting_id, person_id) do update set attended=excluded.attended', [mid, m.person_id, f.get(`came_${m.person_id}`) === 'on']);
        const text = s(f, `commit_${m.person_id}`).slice(0, 300);
        if (text.length >= 3) await q('insert into circle_commitments(meeting_id, circle_id, person_id, text, due_on) values ($1,$2,$3,$4,$5)', [mid, mt.circle_id, m.person_id, text, date(s(f, 'due_on'))]);
      }
      await q('insert into circle_meeting_notes(meeting_id, notes, concern) values ($1,$2,$3) on conflict (meeting_id) do update set notes=excluded.notes, concern=excluded.concern, updated_at=now()', [mid, notes || null, concern]);
    });
  } catch (e) { bounce(back, reason(e), 'err'); }
  if (concern) await asAdmin((q) => q(
    `insert into founder_alerts(kind, severity, title, body, link, source_table, source_id) values ('mentoring_concern',$1,$2,$3,$4,'circle_meetings',$5)`,
    [mt.has_minors ? 'urgent' : 'attention', `A mentor raised a concern in ${mt.circle_name}`, 'The mentor ticked "something worries me" after a session. Open the circle to read their private note, then speak with the mentor.', back, mid])).catch(() => undefined);
  revalidatePath(back);
  bounce(back, 'Session recorded. Everyone in the circle can now answer the short form.', 'ok');
}

export async function cancelMeeting(f: FormData) {
  const me = await requireMe('mentor', 'founder');
  const mid = s(f, 'meeting');
  if (!uuid(mid)) return;
  const row = (await asUser(me.id, (q) => q("update circle_meetings set status='cancelled' where id=$1 and status='planned' returning circle_id", [mid])))[0];
  revalidatePath(`/portal/circles/${row?.circle_id}`);
  bounce(`/portal/circles/${row?.circle_id ?? ''}`, 'Session cancelled.', 'ok');
}

/* ---------- everyone in a circle ---------- */

export async function tickCommitment(f: FormData) {
  const me = await requireMe();
  const id = s(f, 'id');
  if (!uuid(id)) return;
  const row = (await asUser(me.id, (q) => q('update circle_commitments set done = not done where id=$1 returning circle_id', [id])))[0];
  revalidatePath(`/portal/circles/${row?.circle_id}`);
  redirect(`/portal/circles/${row?.circle_id ?? ''}`);
}

/** The short form after a session. Mentee answers are choices only and are read as totals of three or more; a mentor adds two short reflections. */
export async function submitSessionFeedback(f: FormData) {
  const me = await requireMe();
  const mid = s(f, 'meeting');
  if (!uuid(mid)) return;
  const mt = (await asUser(me.id, (q) => q('select circle_id from circle_meetings where id=$1', [mid])))[0];
  if (!mt) redirect('/portal/circles');
  const back = `/portal/circles/${mt.circle_id}`;
  const use = Number(s(f, 'usefulness')), clear = Number(s(f, 'clear'));
  if (!(use >= 1 && use <= 5) || !(clear >= 1 && clear <= 5)) bounce(back, 'Please answer the first two questions.', 'err');
  const pace = ['too_slow', 'right', 'too_fast'].includes(s(f, 'pace')) ? s(f, 'pace') : null;
  const improve = f.getAll('improve').map(String).filter((v) => IMPROVE.includes(v)).slice(0, 3);
  try {
    await asUser(me.id, (q) => q(
      `insert into mentoring_feedback(meeting_id, circle_id, person_id, role, usefulness, next_step_clear, pace, improve, went_well, to_improve)
       values ($1,$2,$3,'mentee',$4,$5,$6,$7,$8,$9)`,
      [mid, mt.circle_id, me.id, use, clear, pace, improve, s(f, 'went_well').slice(0, 500) || null, s(f, 'to_improve').slice(0, 500) || null]));
  } catch (e: any) {
    if (/unique|duplicate/i.test(String(e?.message))) bounce(back, 'You have already answered for this session.', 'err');
    bounce(back, reason(e), 'err');
  }
  revalidatePath(back);
  bounce(back, 'Thank you. Your answer helps the next session go better.', 'ok');
}
