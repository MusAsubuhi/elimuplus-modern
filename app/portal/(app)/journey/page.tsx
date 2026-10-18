import Link from 'next/link';
import { asUser } from '@/lib/db';
import { requireFeature, featureLevel } from '@/lib/access';
import { participantContext } from '@/lib/data';
import { facilitatorStats, TIER_TITLES } from '@/lib/pathway';
import { Badge, Card, PageHeader, ProgressBar, submitCls } from '@/components/ui';
import { d } from '@/lib/format';
import { startJourney } from '../../team-actions';

export default async function Journey() {
  const me = await requireFeature('journey');
  const canStart = (await featureLevel(me, 'journey')) === 'edit';
  const isFounder = me.roles.includes('founder');
  const { ctx, stats, hasFacRole } = await asUser(me.id, async (q) => ({
    ctx: await participantContext(q, me.id),
    stats: await facilitatorStats(q, me.id),
    hasFacRole: (await q("select 1 from role_assignments where person_id=$1 and role='facilitator' and status='active'", [me.id])).length > 0,
  }));
  const filled = ctx?.filled.size ?? 0;
  return (
    <>
      <PageHeader image="/images/home-canvas-hands.jpg" title="My journey" subtitle={isFounder ? 'Founders go through what participants and trainers go through: build your own SEE Canvas, and climb the facilitator pathway. Your co-founder certifies you; you certify them.' : 'Everyone who trains takes the journey first: build your own SEE Canvas as a participant, and follow the facilitator pathway. A founder issues each certificate.'} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="1. As a participant" subtitle="Your own SEE Canvas, in a private team cohort that is kept out of partner and cohort figures.">
          {ctx ? (
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between"><span className="font-semibold">Canvas boxes filled</span><b>{filled}/12</b></div>
              <ProgressBar value={Math.round((filled / 12) * 100)} tone="gold" />
              <p className="text-xs text-slate-600">Cohort: {ctx.en.cohort_name} · all twelve boxes are open, so you can work at your own pace.</p>
              <div className="flex gap-2"><Link href="/portal/me" className={submitCls}>Open my journey</Link><Link href="/portal/canvas" className="rounded-lg border border-teal px-4 py-2 text-sm font-bold text-teal">Open my canvas</Link></div>
            </div>
          ) : (
            <form action={startJourney} className="space-y-3 text-sm">
              <input type="hidden" name="kind" value="participant" />
              <p>Starts your enrolment and opens your canvas. Answer as a real business: yours, or one you are exploring.</p>
              {canStart ? <button className={submitCls}>Start my participant journey</button> : <p className="text-xs text-slate-500">You have view access only, so a founder needs to start this for you.</p>}
            </form>
          )}
        </Card>
        <Card title="2. As a facilitator" subtitle="Start at Tier 1 like everyone else. Tiers come only through a certificate issued by a founder.">
          {hasFacRole ? (
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-2"><Badge tone="teal">Tier {stats.cert?.tier ?? 1}</Badge><span className="font-semibold">{TIER_TITLES[stats.cert?.tier ?? 1]}</span></div>
              <p className="text-xs text-slate-600">{stats.cert ? `Certificate ${stats.cert.number}, issued ${d(stats.cert.issued_on)}.` : 'No certificate yet. A founder issues it once they have reviewed your pathway.'}</p>
              <p className="text-xs text-slate-600">{stats.deliveries} independent deliveries · {stats.completeFollowups} cohorts with complete 30/60/90 records</p>
              <Link href="/portal/pathway" className={submitCls}>See what I need next</Link>
            </div>
          ) : (
            <form action={startJourney} className="space-y-3 text-sm">
              <input type="hidden" name="kind" value="facilitator" />
              <p>Adds the Tier 1 facilitator role to your account, so you can be assigned to cohorts, take attendance and request expenses like any trainer.</p>
              {canStart ? <button className={submitCls}>Start my facilitator pathway</button> : <p className="text-xs text-slate-500">You have view access only.</p>}
            </form>
          )}
        </Card>
      </div>
      <Card title="How the rules treat you" className="mt-4">
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
          <li>You cannot issue your own certificate or give yourself a higher tier. The database refuses it, not just this page.</li>
          <li>{isFounder ? 'Your expense requests are approved by your co-founder, never by you.' : 'Your expense requests and reports are reviewed by someone else, never by you.'}</li>
          <li>The team cohort is kept out of partner reports and cohort figures, so your practice never skews real results.</li>
        </ul>
      </Card>
    </>
  );
}
