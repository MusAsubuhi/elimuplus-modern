import 'server-only';
import type { Q } from './db';
import { facilitatorStats, maintenance, nextTierRequirements } from './pathway';
import { participantContext } from './data';

export const FOCUS: Record<string, string> = {
  general: 'General', facilitation: 'Facilitation and teaching', follow_up: 'Follow-up and records', business: 'My business',
  finance: 'Money and costing', communication: 'Communication', leadership: 'Leadership',
};
export const GOAL_STATUS: Record<string, string> = { not_started: 'Not started', in_progress: 'In progress', done: 'Done', dropped: 'Dropped' };
export const SOURCE_LABEL: Record<string, string> = { pathway: 'From my pathway', qa_visit: 'From a quality visit', followup: 'From follow-up', canvas: 'From my canvas', own: 'My own' };

export type Suggestion = { title: string; why: string; measure: string; source_kind: 'pathway' | 'canvas'; source_ref: string; focus: string };

/**
 * Starting points drawn from what the portal already knows about the person, so a plan begins with real gaps and not a blank page.
 * Trainers get the unmet, countable requirements of their next tier and of staying certified. Participants get canvas boxes that are open but empty.
 * These are only suggestions: nothing is added until the person chooses it.
 */
export async function suggestionsFor(q: Q, personId: string): Promise<Suggestion[]> {
  const out: Suggestion[] = [];
  const tier = Number((await q("select coalesce(max(tier),0) t from role_assignments where person_id=$1 and role='facilitator' and status='active'", [personId]))[0]?.t ?? 0);
  if (tier >= 1) {
    const s = await facilitatorStats(q, personId);
    const next = nextTierRequirements(tier, s);
    for (const r of next?.reqs ?? []) {
      if (r.manual || r.have >= r.need) continue;
      out.push({ title: `${r.label}: reach ${r.need}`, why: `Needed for Tier ${next!.to}. Now at ${r.have}.`, measure: `${r.need}${r.unit ? ' ' + r.unit : ''} recorded on my pathway page`, source_kind: 'pathway', source_ref: r.label, focus: /follow/i.test(r.label) ? 'follow_up' : 'facilitation' });
    }
    for (const r of maintenance(tier, s)) {
      if (r.have >= r.need) continue;
      out.push({ title: `${r.label}: reach ${r.need}`, why: `Needed to stay certified this year. Now at ${r.have}.`, measure: `${r.need} recorded this year`, source_kind: 'pathway', source_ref: r.label, focus: 'facilitation' });
    }
  }
  const ctx = await participantContext(q, personId);
  if (ctx) {
    const open = [...ctx.unlocked].filter((b) => !ctx.filled.has(b)).sort((a, b) => a - b);
    for (const b of open.slice(0, 3)) {
      const name = ctx.boxes.find((x) => x.number === b)?.name_en ?? `Box ${b}`;
      out.push({ title: `Fill in canvas box ${b}: ${name}`, why: 'This box is open in my training but still empty.', measure: 'Every question in the box has an answer', source_kind: 'canvas', source_ref: String(b), focus: 'business' });
    }
  }
  return out;
}
