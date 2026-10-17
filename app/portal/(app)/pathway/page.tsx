import Link from 'next/link';
import { asUser } from '@/lib/db';
import { requireMe } from '@/lib/session';
import { facilitatorStats, maintenance, nextTierRequirements, TIER_TITLES, type Req } from '@/lib/pathway';
import { Badge, Card, PageHeader, ProgressBar, Stat } from '@/components/ui';
import { d, pct } from '@/lib/format';
import { BarCard } from '@/components/charts';

function ReqList({ reqs }: { reqs: Req[] }) {
  return (
    <ul className="space-y-3">
      {reqs.map((r) => {
        const met = !r.manual && r.have >= r.need;
        return (
          <li key={r.label}>
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold">{r.label}</span>
              {r.manual ? <Badge tone="grey">founder records</Badge> : <span className={met ? 'font-bold text-emerald-700' : 'text-slate-600'}>{met ? '✓ ' : ''}{r.have}/{r.need}{r.unit ? ` ${r.unit}` : ''}</span>}
            </div>
            {!r.manual && <ProgressBar value={pct(r.have, r.need)} tone={met ? 'green' : 'gold'} />}
            {r.note && <p className="mt-0.5 text-xs text-slate-500">{r.note}</p>}
          </li>
        );
      })}
    </ul>
  );
}

export default async function Pathway({ searchParams }: { searchParams: Promise<{ person?: string }> }) {
  const me = await requireMe('facilitator', 'founder');
  const { person } = await searchParams;
  // founders can review another trainer's pathway before issuing a certificate
  const target = me.roles.includes('founder') && person && person !== me.id ? person : me.id;
  const own = target === me.id;
  const { s, who, roleTier, trainee } = await asUser(me.id, async (q) => ({
    trainee: (await q(
      `select (select count(*)::int from day_reports where author_id=$1) reports,
              (select count(distinct cohort_id)::int from day_reports where author_id=$1 and cohort_id is not null) cohorts,
              (select count(*)::int from role_assignments where person_id=$1 and role='facilitator' and tier=0 and status='active') is_trainee,
              (select p.display_name from supervision sp join people p on p.id=sp.supervisor_id where sp.person_id=$1 and sp.status='active') supervisor`, [target]))[0],
    s: await facilitatorStats(q, target),
    who: (await q('select full_name, birth_year from people where id=$1', [target]))[0],
    roleTier: Number((await q("select coalesce(max(tier),0) t from role_assignments where person_id=$1 and role='facilitator' and status='active'", [target]))[0]?.t ?? 0),
  }));
  const tier = s.cert?.tier ?? roleTier;
  if (who && tier === 0 && trainee?.is_trainee) {
    return (
      <>
        <PageHeader image="/images/trainer-hero.jpg" title={own ? 'My pathway' : `${who.full_name}’s pathway`} subtitle="Trainee Facilitator: you learn by watching and reporting what you see." />
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <Stat label="Level" value="Trainee" sub="Tier 0, before certification" />
          <Stat label="Reports filed" value={trainee.reports} sub={`${trainee.cohorts} cohort${trainee.cohorts === 1 ? '' : 's'}`} tone="gold" />
          <Stat label="Supervisor" value={trainee.supervisor ?? 'Not assigned'} sub={trainee.supervisor ? 'Reads your reports first' : 'Ask a founder to assign one'} tone={trainee.supervisor ? 'teal' : 'red'} />
        </div>
        <Card title="What a trainee does">
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
            <li>Join a cohort as an observer and file a short report at the end of each training day.</li>
            <li>Say what surprised you, even if it seems small. Those reports often show us what we did not expect.</li>
            <li>Your supervisor reads each report and may talk it through with you.</li>
            <li>When you have observed a full programme and your supervisor agrees, a founder can certify you as an Associate Facilitator (Tier 1).</li>
          </ul>
          <Link href="/portal/reports" className="mt-3 inline-block rounded-lg bg-teal px-4 py-2 text-sm font-bold text-white">Write today’s report</Link>
        </Card>
      </>
    );
  }
  if (!who || tier === 0) {
    return (
      <>
        <PageHeader image="/images/trainer-hero.jpg" title={own ? 'My pathway' : `${who?.full_name ?? 'Trainer'}’s pathway`} subtitle="From Foundation Facilitator to Accredited ToT Lead." />
        <Card title={own ? 'You are not on the facilitator pathway yet' : 'This person is not on the facilitator pathway'}>
          <p className="text-sm text-slate-700">{own ? 'Founders go through the pathway like every trainer. Start at Tier 1 and your co-founder certifies each step.' : 'They hold no facilitator role. Give them one from the Team page.'}</p>
          <Link href={own ? '/portal/journey' : '/portal/team'} className="mt-3 inline-block rounded-lg bg-teal px-4 py-2 text-sm font-bold text-white">{own ? 'Start my facilitator pathway' : 'Open the Team page'}</Link>
        </Card>
      </>
    );
  }
  const next = nextTierRequirements(tier, s);
  const maint = maintenance(tier, s);
  const ladder = [1, 2, 3, 4].map((t) => ({ tier: `Tier ${t}`, you: t <= tier ? 1 : 0, ahead: t > tier ? 1 : 0 }));
  const young = who.birth_year && new Date().getFullYear() - who.birth_year < 18;
  return (
    <>
      <PageHeader image="/images/trainer-hero.jpg" title={own ? 'My pathway' : `${who.full_name}’s pathway`} subtitle="From Foundation Facilitator to Accredited ToT Lead: what is held, what is needed next, and what keeps a trainer certified." />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Current tier" value={`Tier ${tier}`} sub={TIER_TITLES[tier]} />
        <Stat tone="gold" label="Certificate" value={s.cert?.number ?? '—'} sub={s.cert ? `Issued ${d(s.cert.issued_on)}` : undefined} />
        <Stat tone="green" label="Independent deliveries" value={s.deliveries} sub={`${s.twelveDay} were 12-Day`} />
        <Stat label="Last QA visit" value={s.lastQa ? d(s.lastQa) : 'None yet'} sub={tier === 1 ? 'Due within 90 days of first delivery, then every 18 months' : tier === 2 ? 'Every 24 months' : undefined} />
      </div>
      {young && <Card className="mb-4 border-gold bg-gold-100"><p className="text-sm"><b>Under 18 safeguards.</b> You deliver and make follow-up visits only with an adult Elimu+ facilitator or partner supervisor present or accompanying you, and you are never the sole adult responsible for a session or visit.</p></Card>}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="The ladder" subtitle="No tier can be skipped">
          <BarCard data={ladder} x="tier" height={200} stacked bars={[{ key: 'you', label: 'Reached', color: '#0D3B3B' }, { key: 'ahead', label: 'Ahead', color: '#D4A843' }]} />
          <ul className="mt-2 text-xs text-slate-600">{[1, 2, 3, 4].map((t) => <li key={t}><b>Tier {t}</b> · {TIER_TITLES[t]}</li>)}</ul>
        </Card>
        <Card title={next ? `To reach Tier ${next.to}` : 'Highest tier'} className="lg:col-span-1">
          {next ? <ReqList reqs={next.reqs} /> : <p className="text-sm">Tier 4 is the highest tier. Your obligations are the annual portfolio and ToT leadership record.</p>}
        </Card>
        <Card title="To stay certified" subtitle={`Calendar year ${s.year}`}>
          {maint.length ? <ReqList reqs={maint} /> : <p className="text-sm text-slate-500">Maintenance targets for this tier are managed by founders.</p>}
          <p className="mt-3 text-xs text-slate-500">Follow-up records at 30, 60 and 90 days are required for every cohort you deliver.</p>
        </Card>
      </div>
    </>
  );
}
