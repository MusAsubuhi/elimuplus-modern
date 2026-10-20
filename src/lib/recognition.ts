import 'server-only';
import type { Q } from './db';
import { facilitatorStats, TIER_TITLES } from './pathway';
import { participantContext } from './data';

/**
 * Recognition, not points. Every rung is earned from work the portal has actually recorded, so nobody can collect their way up.
 * There is no ranking of people against each other anywhere: a trainer, a trainee or a staff member only ever sees their own standing.
 * The tone follows the role: trainers have a craft ladder, trainees get encouragement, staff get service standards, organisations an impact ladder.
 */
export interface Rung { at: number; label: string }
export interface Ladder { key: string; title: string; why: string; unit: string; have: number; rungs: Rung[] }
export interface Standard { label: string; target: string; ok: boolean; detail: string }

export const earned = (l: Ladder) => l.rungs.filter((r) => l.have >= r.at);
export const nextRung = (l: Ladder) => l.rungs.find((r) => l.have < r.at) ?? null;

const n = async (q: Q, sql: string, args: unknown[] = []) => Number((await q(sql, args))[0]?.n ?? 0);

/** Craft ladders for a trainer. Serious in tone: they mirror what the certification pathway already asks for. */
export async function trainerLadders(q: Q, personId: string): Promise<{ title: string; ladders: Ladder[] }> {
  const s = await facilitatorStats(q, personId);
  const reports = await n(q, 'select count(*)::int n from day_reports where author_id=$1', [personId]);
  const visits = await n(q, "select count(*)::int n from followup_schedule where assigned_to=$1 and status in ('done','unreachable')", [personId]);
  const goals = await n(q, "select count(*)::int n from improvement_goals g join improvement_plans p on p.id=g.plan_id where p.person_id=$1 and g.status='done' and g.accepted", [personId]);
  return {
    title: s.cert ? `${TIER_TITLES[s.cert.tier]}` : 'Facilitator',
    ladders: [
      { key: 'led', title: 'Cohorts led', why: 'Delivering independently is the core of the work.', unit: 'cohorts', have: s.deliveries, rungs: [{ at: 1, label: 'First cohort led' }, { at: 3, label: 'Three cohorts' }, { at: 5, label: 'Five cohorts' }, { at: 10, label: 'Ten cohorts' }] },
      { key: 'finish', title: 'Finished what you started', why: 'A cohort counts here only when every 30, 60 and 90-day record is in.', unit: 'cohorts', have: s.completeFollowups, rungs: [{ at: 1, label: 'First complete record' }, { at: 3, label: 'Three complete records' }, { at: 5, label: 'Five complete records' }] },
      { key: 'visits', title: 'Follow-up visits kept', why: 'Each visit is a promise kept to a participant.', unit: 'visits', have: visits, rungs: [{ at: 10, label: '10 visits' }, { at: 30, label: '30 visits' }, { at: 60, label: '60 visits' }, { at: 100, label: '100 visits' }] },
      { key: 'reports', title: 'Day reports filed', why: 'Reports are how the next trainer learns from you.', unit: 'reports', have: reports, rungs: [{ at: 5, label: '5 reports' }, { at: 20, label: '20 reports' }, { at: 50, label: '50 reports' }] },
      { key: 'mentor', title: 'Supporting other trainers', why: 'Quality observations of colleagues, a requirement for senior tiers.', unit: 'observations', have: s.qaConducted, rungs: [{ at: 1, label: 'First observation' }, { at: 3, label: 'Three observations' }, { at: 10, label: 'Ten observations' }] },
      { key: 'growth', title: 'Growth goals completed', why: 'Goals from your own improvement plan that you finished.', unit: 'goals', have: goals, rungs: [{ at: 1, label: 'First goal done' }, { at: 5, label: 'Five goals done' }, { at: 10, label: 'Ten goals done' }] },
    ],
  };
}

/** A participant's own journey: encouraging, private, and never compared with anyone else. */
export async function traineeLadders(q: Q, personId: string): Promise<Ladder[]> {
  const ctx = await participantContext(q, personId);
  if (!ctx) return [];
  const attended = await n(q, 'select count(*)::int n from attendance a join enrolments e on e.id=a.enrolment_id where e.person_id=$1 and a.present', [personId]);
  const total = await n(q, 'select count(*)::int n from sessions where cohort_id=$1', [ctx.en.cohort_id]);
  const lc = await q('select stage, score, out_of from learning_checks where enrolment_id=$1', [ctx.en.id]);
  const pre = lc.find((r) => r.stage === 'pre'), post = lc.find((r) => r.stage === 'post');
  const gain = pre && post ? Math.round((post.score / post.out_of - pre.score / pre.out_of) * 100) : 0;
  const visited = ctx.schedule.filter((s) => s.status === 'done').length;
  const cert = await n(q, 'select count(*)::int n from participant_certificates where person_id=$1', [personId]);
  return [
    { key: 'canvas', title: 'Your business on one page', why: 'Each box you fill makes your idea clearer.', unit: 'of 12 boxes', have: ctx.filled.size, rungs: [{ at: 1, label: 'You started' }, { at: 4, label: 'A third done' }, { at: 8, label: 'Two thirds done' }, { at: 12, label: 'Canvas complete' }] },
    { key: 'turnup', title: 'Showing up', why: 'Being in the room is half of learning.', unit: total ? `of ${total} days` : 'days', have: attended, rungs: total ? [{ at: 1, label: 'First day' }, { at: Math.ceil(total / 2), label: 'Halfway' }, { at: total, label: 'Every day' }] : [{ at: 1, label: 'First day' }] },
    { key: 'learn', title: 'What you learned', why: 'Your own before-and-after check, compared with yourself only.', unit: 'points gained', have: Math.max(0, gain), rungs: [{ at: 1, label: 'You grew' }, { at: 20, label: 'Up 20 points' }, { at: 40, label: 'Up 40 points' }] },
    { key: 'follow', title: 'Keeping going after training', why: 'Visits at 30, 60 and 90 days show how your business is doing.', unit: 'of 3 visits', have: visited, rungs: [{ at: 1, label: '30-day visit' }, { at: 2, label: '60-day visit' }, { at: 3, label: '90-day visit' }] },
    { key: 'cert', title: 'Certificate', why: 'Issued by Elimu+ when you complete the programme.', unit: '', have: cert, rungs: [{ at: 1, label: 'Certificate earned' }] },
  ];
}

/** Service standards for founders and staff. Not badges: a standard is either being met or it is not, and the page says what is behind it. */
export async function staffStandards(q: Q, personId: string): Promise<Standard[]> {
  const exp = await n(q, "select count(*)::int n from expense_requests where status='submitted' and created_at < now() - interval '3 days'");
  const pay = await n(q, "select count(*)::int n from payout_claims where status in ('ready','queried') and created_at < now() - interval '3 days'").catch(() => 0);
  const alerts = await n(q, 'select count(*)::int n from founder_alerts a where not exists (select 1 from alert_reads r where r.alert_id=a.id and r.person_id=$1)', [personId]).catch(() => 0);
  const stale = await n(q, "select count(*)::int n from reports where status='draft' and created_at < now() - interval '14 days'").catch(() => 0);
  return [
    { label: 'Expense requests answered within 3 days', target: 'None waiting longer', ok: exp === 0, detail: exp ? `${exp} waiting longer than 3 days` : 'Nothing waiting' },
    { label: 'Trainer payments decided within 3 days', target: 'None waiting longer', ok: pay === 0, detail: pay ? `${pay} claims waiting longer than 3 days. Trainers are paid as they go, so delay is felt quickly.` : 'Nothing waiting' },
    { label: 'Alerts read', target: 'No unread alerts', ok: alerts === 0, detail: alerts ? `${alerts} unread` : 'All read' },
    { label: 'Report drafts finished within 14 days', target: 'None left in draft', ok: stale === 0, detail: stale ? `${stale} drafts older than 14 days` : 'None stale' },
  ];
}

/** An organisation's impact ladder, from aggregate figures only. */
export function orgLadders(cohorts: { status: string; n: number; completed: number }[], follow: { visit: number; status: string }[]): Ladder[] {
  const reached = cohorts.reduce((a, c) => a + Number(c.n || 0), 0);
  const finished = cohorts.filter((c) => ['followup', 'closed'].includes(c.status)).length;
  const done = (v: number) => follow.filter((f) => f.visit === v && f.status === 'done').length;
  return [
    { key: 'cohorts', title: 'Cohorts completed', why: 'Training delivered from start to finish.', unit: 'cohorts', have: finished, rungs: [{ at: 1, label: 'First cohort completed' }, { at: 3, label: 'Three cohorts' }, { at: 5, label: 'Five cohorts' }] },
    { key: 'reach', title: 'People reached', why: 'Participants enrolled in your cohorts.', unit: 'people', have: reached, rungs: [{ at: 25, label: '25 people' }, { at: 50, label: '50 people' }, { at: 100, label: '100 people' }, { at: 250, label: '250 people' }] },
    { key: 'follow30', title: '30-day check-ins completed', why: 'Evidence that participants put the training to work.', unit: 'check-ins', have: done(30), rungs: [{ at: 1, label: 'First check-in' }, { at: 10, label: '10 check-ins' }, { at: 30, label: '30 check-ins' }] },
    { key: 'follow90', title: '90-day results in', why: 'The longest view of what changed.', unit: 'results', have: done(90), rungs: [{ at: 1, label: 'First 90-day result' }, { at: 10, label: '10 results' }, { at: 30, label: '30 results' }] },
  ];
}
