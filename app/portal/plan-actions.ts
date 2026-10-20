'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { asUser } from '@/lib/db';
import { requireMe } from '@/lib/session';
import { FOCUS } from '@/lib/improvement';

const s = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
const dateOrNull = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const done = (path: string, msg: string, kind: 'ok' | 'err' = 'ok'): never =>
  redirect(`${path}${path.includes('?') ? '&' : '?'}${kind}=${encodeURIComponent(msg)}`);
const clamp = (n: number) => Math.min(100, Math.max(0, Math.round(Number.isFinite(n) ? n : 0)));

/** Start a plan: your own, or (as a supervisor or founder) one for the person you support. Row rules decide who may. */
export async function createPlan(f: FormData) {
  const me = await requireMe();
  const person = s(f, 'person') || me.id;
  const back = person === me.id ? '/portal/plan' : `/portal/plan?person=${person}`;
  const title = s(f, 'title');
  if (!title) done(back, 'Give the plan a short title.', 'err');
  const focus = s(f, 'focus') in FOCUS ? s(f, 'focus') : 'general';
  let id = '';
  try {
    await asUser(me.id, async (q) => {
      const sup = (await q("select supervisor_id from supervision where person_id=$1 and status='active'", [person]))[0]?.supervisor_id ?? null;
      const reviewer = person === me.id ? sup : me.id;
      const origin = person === me.id ? 'self' : 'reviewer';
      id = (await q(
        `insert into improvement_plans(person_id,title,focus,summary,review_on,reviewer_id,origin,created_by) values($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
        [person, title, focus, s(f, 'summary') || null, dateOrNull(s(f, 'review_on')), reviewer, origin, me.id]))[0].id;
      // goals picked from the suggestions list; the person's own plan takes them as accepted, someone else's as suggestions to accept
      const accepted = person === me.id;
      for (const raw of f.getAll('pick').map(String)) {
        const g = JSON.parse(raw) as { title: string; why: string; measure: string; source_kind: string; source_ref: string };
        if (!g.title) continue;
        await q(`insert into improvement_goals(plan_id,title,why,measure,source_kind,source_ref,proposed_by,accepted) values($1,$2,$3,$4,$5,$6,$7,$8)`,
          [id, g.title, g.why ?? null, g.measure ?? null, ['pathway', 'canvas'].includes(g.source_kind) ? g.source_kind : 'own', g.source_ref ?? null, me.id, accepted]);
      }
    });
  } catch { done(back, 'You cannot start a plan for this person.', 'err'); }
  revalidatePath('/portal/plan');
  done(back, 'Plan started');
}

export async function addGoal(f: FormData) {
  const me = await requireMe();
  const plan = s(f, 'plan'), back = s(f, 'back') || '/portal/plan';
  const title = s(f, 'title');
  if (!title) done(back, 'A goal needs a title.', 'err');
  try {
    await asUser(me.id, async (q) => {
      const own = (await q('select 1 from improvement_plans where id=$1 and person_id=$2', [plan, me.id])).length > 0;
      await q(`insert into improvement_goals(plan_id,title,why,measure,due_on,source_kind,proposed_by,accepted) values($1,$2,$3,$4,$5,'own',$6,$7)`,
        [plan, title, s(f, 'why') || null, s(f, 'measure') || null, dateOrNull(s(f, 'due_on')), me.id, own]);
    });
  } catch { done(back, 'That goal could not be added.', 'err'); }
  revalidatePath('/portal/plan');
  done(back, s(f, 'suggest') ? 'Suggestion sent to them' : 'Goal added');
}

/** The owner reports progress on a goal; the note and the percentage are kept as a check-in. */
export async function updateGoal(f: FormData) {
  const me = await requireMe();
  const goal = s(f, 'goal'), plan = s(f, 'plan'), back = s(f, 'back') || '/portal/plan';
  const progress = clamp(Number(s(f, 'progress')));
  const status = progress >= 100 ? 'done' : progress > 0 ? 'in_progress' : 'not_started';
  const note = s(f, 'note') || `Progress now ${progress}%.`;
  const ok = await asUser(me.id, async (q) => {
    const row = await q('update improvement_goals set progress=$1, status=$2 where id=$3 and plan_id=$4 returning id', [progress, status, goal, plan]);
    if (!row.length) return false;
    await q(`insert into improvement_checkins(plan_id,goal_id,author_id,kind,body,progress) values($1,$2,$3,'update',$4,$5)`, [plan, goal, me.id, note, progress]);
    return true;
  }).catch(() => false);
  revalidatePath('/portal/plan');
  done(back, ok ? 'Progress saved' : 'Only the plan’s owner can report progress.', ok ? 'ok' : 'err');
}

export async function answerSuggestion(f: FormData) {
  const me = await requireMe();
  const goal = s(f, 'goal'), back = s(f, 'back') || '/portal/plan';
  const accept = s(f, 'decision') === 'accept';
  await asUser(me.id, (q) => accept
    ? q('update improvement_goals set accepted=true where id=$1 returning id', [goal])
    : q('delete from improvement_goals where id=$1 and accepted=false returning id', [goal])).catch(() => []);
  revalidatePath('/portal/plan');
  done(back, accept ? 'Goal added to my plan' : 'Suggestion removed');
}

export async function addNote(f: FormData) {
  const me = await requireMe();
  const plan = s(f, 'plan'), back = s(f, 'back') || '/portal/plan';
  const body = s(f, 'body');
  if (!body) done(back, 'Write a note first.', 'err');
  const kind = s(f, 'kind') === 'review' ? 'review' : 'reviewer_note';
  try { await asUser(me.id, (q) => q(`insert into improvement_checkins(plan_id,goal_id,author_id,kind,body) values($1,$2,$3,$4,$5)`, [plan, s(f, 'goal') || null, me.id, kind, body])); }
  catch { done(back, 'You cannot add a note to this plan.', 'err'); }
  revalidatePath('/portal/plan');
  done(back, 'Note added');
}

export async function setPlanStatus(f: FormData) {
  const me = await requireMe();
  const plan = s(f, 'plan'), back = s(f, 'back') || '/portal/plan';
  const status = ['active', 'completed', 'closed'].includes(s(f, 'status')) ? s(f, 'status') : 'active';
  await asUser(me.id, (q) => q('update improvement_plans set status=$1 where id=$2 returning id', [status, plan])).catch(() => []);
  revalidatePath('/portal/plan');
  done(back, status === 'completed' ? 'Plan marked complete' : status === 'closed' ? 'Plan closed' : 'Plan reopened');
}
