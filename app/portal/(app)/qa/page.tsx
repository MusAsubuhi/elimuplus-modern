import { asUser } from '@/lib/db';
import { requireMe } from '@/lib/session';
import { Badge, Card, PageHeader, Stat, Table, statusTone, submitCls } from '@/components/ui';
import { BarCard, PieCard } from '@/components/charts';
import { d, daysFromToday } from '@/lib/format';
import { advanceReport } from '../../actions';

export default async function QA() {
  const me = await requireMe('master', 'founder');
  const { facs, visits, reports, cands } = await asUser(me.id, async (q) => ({
    facs: await q(`select p.id, p.display_name, c.tier, c.number, c.status, c.issued_on,
        (select count(*) from cohort_facilitators cf join cohorts co on co.id=cf.cohort_id where cf.person_id=p.id and cf.role='lead')::int led,
        (select max(observed_on) from qa_visits v where v.facilitator_id=p.id) last_qa
      from certifications c join people p on p.id=c.person_id order by c.tier desc, p.display_name`),
    visits: await q(`select v.*, f.display_name facilitator, o.display_name observer from qa_visits v join people f on f.id=v.facilitator_id left join people o on o.id=v.observer_id order by v.observed_on desc`),
    reports: await q(`select r.*, o.name org_name from reports r join organisations o on o.id=r.organisation_id order by case r.status when 'draft' then 0 when 'reviewed' then 1 else 2 end, r.created_at desc`),
    cands: await q(`select i.*, o.name org_name from invitations i left join organisations o on o.id=i.organisation_id where i.role in ('trainer_candidate','facilitator') order by i.created_at desc`),
  }));
  const isFounder = me.roles.includes('founder');
  const byTier = [1, 2, 3, 4].map((t) => ({ tier: `Tier ${t}`, count: facs.filter((f) => f.tier === t).length }));
  const outcomes = ['pass', 'conditional', 'concern'].map((o) => ({ name: o, value: visits.filter((v) => v.outcome === o).length })).filter((x) => x.value);
  const scores = visits.filter((v) => v.score != null).map((v) => ({ who: v.facilitator.split(' ')[0], score: v.score }));
  const awaiting = reports.filter((r) => r.status !== 'released').length;
  return (
    <>
      <PageHeader image="/images/trainer-team.jpg" title="Quality and reports" subtitle="Facilitators by tier, QA visits and scores, and the report review queue before anything reaches a partner." />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Certified facilitators" value={facs.length} />
        <Stat tone="green" label="QA visits on record" value={visits.length} />
        <Stat tone={awaiting ? 'gold' : 'green'} label="Reports awaiting release" value={awaiting} />
        <Stat tone="gold" label="Trainer candidates" value={cands.filter((c) => c.role === 'trainer_candidate').length} />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Facilitators by tier"><BarCard data={byTier} x="tier" height={220} bars={[{ key: 'count', label: 'Facilitators', color: '#0D3B3B' }]} /></Card>
        <Card title="QA scores (out of 18)" subtitle="Pass mark 15 for Tier 1, 16 for Tier 2"><BarCard data={scores} x="who" height={220} bars={[{ key: 'score', label: 'Score', color: '#D4A843' }]} /></Card>
        <Card title="QA outcomes">{outcomes.length ? <PieCard data={outcomes} height={220} /> : <p className="text-sm text-slate-500">No visits yet.</p>}</Card>
      </div>

      <Card title="Facilitator register" className="mt-4">
        <Table head={['Facilitator', 'Tier', 'Certificate', 'Status', 'Led cohorts', 'Last QA', 'QA due']}
          rows={facs.map((f) => {
            const dueMonths = f.tier === 1 ? 18 : 24;
            const due = f.last_qa ? new Date(new Date(f.last_qa).setMonth(new Date(f.last_qa).getMonth() + dueMonths)) : null;
            return [<b key="n">{f.display_name}</b>, `Tier ${f.tier}`, f.number, <Badge key="s" tone={statusTone(f.status)}>{f.status}</Badge>, f.led,
              f.last_qa ? d(f.last_qa) : <Badge key="x" tone="gold">none yet</Badge>,
              due ? <span key="d" className={daysFromToday(due) < 60 ? 'font-bold text-[#C8553D]' : ''}>{d(due)}</span> : '—'];
          })} />
      </Card>

      <Card title="Report review queue" subtitle="Draft, then reviewed by a master trainer, then released by a founder" className="mt-4">
        <Table head={['Report', 'Partner', 'Status', 'Next step']} rows={reports.map((r) => [
          <div key="t"><b>{r.title}</b><div className="text-xs text-slate-500">{r.type} · {r.period}</div></div>, r.org_name,
          <Badge key="s" tone={statusTone(r.status)}>{r.status}</Badge>,
          <div key="a" className="flex gap-2">
            {r.status === 'draft' && <form action={advanceReport}><input type="hidden" name="report" value={r.id} /><input type="hidden" name="to" value="reviewed" /><button className={submitCls}>Mark reviewed</button></form>}
            {r.status === 'reviewed' && (isFounder
              ? <form action={advanceReport}><input type="hidden" name="report" value={r.id} /><input type="hidden" name="to" value="released" /><button className="rounded-lg bg-gold px-4 py-2 text-sm font-bold text-teal">Release to partner</button></form>
              : <span className="text-xs text-slate-500">Waiting for a founder to release</span>)}
            {r.status === 'released' && <span className="text-xs text-slate-500">Released {d(r.released_on)}</span>}
          </div>])} />
      </Card>

      <Card title="QA visits" className="mt-4">
        <Table head={['Date', 'Facilitator', 'Observer', 'Score', 'Outcome', 'Notes']} rows={visits.map((v) => [d(v.observed_on), v.facilitator, v.observer ?? '—', v.score ?? '—', <Badge key="o" tone={statusTone(v.outcome ?? '')}>{v.outcome}</Badge>, v.notes])} />
      </Card>

      <Card title="Trainer candidates and nominations" className="mt-4">
        <Table head={['Name', 'Role', 'Partner', 'Status']} rows={cands.map((c) => [c.full_name, c.role, c.org_name ?? '—', <Badge key="s" tone={statusTone(c.status)}>{c.status}</Badge>])} empty="No candidates yet. Use Nominate trainers." />
      </Card>
    </>
  );
}
