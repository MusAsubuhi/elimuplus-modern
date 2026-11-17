import 'server-only';
import { asAdmin, asUser } from './db';
import { iso } from './format';
import { todayNairobi } from './book';
import type { Me } from './session';
import type { Audience } from './feedback-options';

/** Who is asked: founders, trainers and partners. Participants too. */
export function audienceOf(me: Me): Audience | null {
  if (me.roles.includes('founder')) return 'founder';
  if (me.roles.includes('facilitator') || me.roles.includes('master')) return 'trainer';
  if (me.roles.includes('org_admin')) return 'partner';
  if (me.roles.includes('participant')) return 'participant';
  return null;
}

const days = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

/** Counts one visit for today (once per day). Never throws: feedback must not be able to break a page. */
export async function recordVisit(me: Me): Promise<void> {
  if (!audienceOf(me) || me.demo) return;
  const today = todayNairobi();
  await asAdmin((q) => q(
    `insert into portal_usage (person_id, first_seen_on, last_seen_on, visit_days) values ($1,$2,$2,1)
     on conflict (person_id) do update set visit_days = portal_usage.visit_days + case when portal_usage.last_seen_on < $2 then 1 else 0 end,
       last_seen_on = greatest(portal_usage.last_seen_on, $2)`, [me.id, today])).catch(() => undefined);
}

export type Due = { round: number; tenure: number; visits: number } | null;

/** Due once someone has used the portal on at least 5 days over at least 2 weeks, then again every 60 days. */
export async function feedbackDue(me: Me): Promise<Due> {
  if (!audienceOf(me) || me.demo) return null;
  const today = todayNairobi();
  try {
    const u = (await asAdmin((q) => q('select first_seen_on, visit_days, snooze_until from portal_usage where person_id=$1', [me.id])))[0];
    if (!u) return null;
    const last = (await asUser(me.id, (q) => q('select created_at, round from system_feedback where person_id=$1 order by created_at desc limit 1', [me.id])))[0];
    const tenure = days(iso(u.first_seen_on), today), visits = Number(u.visit_days);
    if (visits < 5 || tenure < 14) return null;
    if (u.snooze_until && iso(u.snooze_until) > today) return null;
    if (last && days(iso(last.created_at), today) < 60) return null;
    return { round: last ? Number(last.round) + 1 : 1, tenure, visits };
  } catch { return null; }
}

export async function usageOf(me: Me): Promise<{ tenure: number; visits: number; round: number }> {
  const today = todayNairobi();
  const u = (await asAdmin((q) => q('select first_seen_on, visit_days from portal_usage where person_id=$1', [me.id])).catch(() => []))[0];
  const n = Number((await asUser(me.id, (q) => q('select count(*)::int n from system_feedback where person_id=$1', [me.id])).catch(() => [{ n: 0 }]))[0].n);
  return { tenure: u ? Math.max(0, days(iso(u.first_seen_on), today)) : 0, visits: u ? Number(u.visit_days) : 0, round: n + 1 };
}
