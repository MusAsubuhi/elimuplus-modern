import { asUser } from '@/lib/db';
import { requireMe } from '@/lib/session';
import { partnerData } from '@/lib/partner';
import { earned, nextRung, orgLadders, staffStandards, traineeLadders, trainerLadders, type Ladder } from '@/lib/recognition';
import { Badge, Card, PageHeader, ProgressBar } from '@/components/ui';

function LadderCard({ l, tone }: { l: Ladder; tone: 'teal' | 'gold' | 'green' }) {
  const got = earned(l), next = nextRung(l);
  const top = l.rungs[l.rungs.length - 1].at;
  return (
    <Card title={l.title} subtitle={l.why}>
      <div className="mb-2 flex items-baseline justify-between text-sm"><b className="text-2xl text-ink">{l.have}</b><span className="text-xs text-slate-500">{l.unit}</span></div>
      <ProgressBar value={Math.round((Math.min(l.have, top) / top) * 100)} tone={tone} />
      <ul className="mt-3 flex flex-wrap gap-1.5 text-xs">
        {l.rungs.map((r) => <li key={r.at}><Badge tone={l.have >= r.at ? 'green' : 'grey'}>{l.have >= r.at ? '✓ ' : ''}{r.label}</Badge></li>)}
      </ul>
      <p className="mt-2 text-xs text-slate-600">{next ? `Next: ${next.label}, ${next.at - l.have} to go.` : got.length ? 'Every rung reached.' : ''}</p>
    </Card>
  );
}

export default async function Recognition() {
  const me = await requireMe('participant', 'facilitator', 'master', 'founder', 'org_admin');
  const isTrainer = me.roles.includes('facilitator') || me.roles.includes('master');
  const isFounder = me.roles.includes('founder');
  const isOrg = me.roles.includes('org_admin');
  const isParticipant = me.roles.includes('participant');
  const d = await asUser(me.id, async (q) => ({
    trainer: isTrainer || isFounder ? await trainerLadders(q, me.id).catch(() => null) : null,
    trainee: isParticipant || isTrainer || isFounder ? await traineeLadders(q, me.id).catch(() => []) : [],
    standards: isFounder ? await staffStandards(q, me.id) : [],
    org: isOrg ? await partnerData(q) : null,
  }));
  const orgIds = me.orgIds ?? [];
  const org = d.org ? orgLadders(
    d.org.cohorts.filter((c: any) => !orgIds.length || orgIds.includes(c.organisation_id)).map((c: any) => ({ status: c.status, n: Number(c.n), completed: Number(c.completed) })),
    d.org.follow.map((f: any) => ({ visit: Number(f.visit), status: String(f.status) }))) : [];

  return (
    <>
      <PageHeader image="/images/home-canvas-hands.jpg" title="Recognition" subtitle="Earned from work the portal has recorded. Nothing here is a ranking: you only ever see your own standing, and every step is something real that happened." />
      {d.trainer && d.trainer.ladders.some((l) => l.have > 0) || (d.trainer && isTrainer) ? (
        <section className="mb-8">
          <h2 className="mb-1 text-lg font-bold text-teal">Your craft as a trainer</h2>
          <p className="mb-3 text-sm text-slate-600">{d.trainer?.title}. These ladders mirror what the certification pathway asks for, so each rung is also progress towards your next tier.</p>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{d.trainer?.ladders.map((l) => <LadderCard key={l.key} l={l} tone="teal" />)}</div>
        </section>
      ) : null}
      {isFounder && (
        <section className="mb-8">
          <h2 className="mb-1 text-lg font-bold text-teal">Service standards</h2>
          <p className="mb-3 text-sm text-slate-600">For founders and staff there are no badges. These are promises to trainers, partners and participants, and each is either being kept or not.</p>
          <Card>
            <ul className="divide-y divide-teal-50 text-sm">
              {d.standards.map((s) => (
                <li key={s.label} className="flex flex-wrap items-start justify-between gap-2 py-2.5">
                  <div><div className="font-semibold">{s.label}</div><div className="text-xs text-slate-500">{s.detail}</div></div>
                  <Badge tone={s.ok ? 'green' : 'red'}>{s.ok ? 'Kept' : 'Needs attention'}</Badge>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}
      {isOrg && (
        <section className="mb-8">
          <h2 className="mb-1 text-lg font-bold text-teal">Your organisation’s impact</h2>
          <p className="mb-3 text-sm text-slate-600">Built from aggregate figures only, so no participant is identifiable here.</p>
          <div className="grid gap-4 md:grid-cols-2">{org.map((l) => <LadderCard key={l.key} l={l} tone="gold" />)}</div>
        </section>
      )}
      {d.trainee.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-1 text-lg font-bold text-teal">{isTrainer || isFounder ? 'As a participant' : 'Your journey so far'}</h2>
          <p className="mb-3 text-sm text-slate-600">Private to you. It compares you with yourself and nobody else, and only counts things you did.</p>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{d.trainee.map((l) => <LadderCard key={l.key} l={l} tone="green" />)}</div>
        </section>
      )}
      {!d.trainer && !d.trainee.length && !isFounder && !isOrg && <Card>Nothing to show yet. Recognition appears as your work is recorded.</Card>}
    </>
  );
}
