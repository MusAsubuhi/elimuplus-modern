import Link from 'next/link';
import { asUser } from '@/lib/db';
import { requirePartner } from '@/lib/session';
import { partnerData } from '@/lib/partner';
import { Badge, Card, ImgBand, PageHeader, Stat, Table, statusTone, inputCls, submitCls } from '@/components/ui';
import { BarCard, Gauge, PieCard } from '@/components/charts';
import { d, pct } from '@/lib/format';
import { followupStats } from '@/lib/data';
import { nominate } from '../../actions';
import { loadImpact, totals } from '@/lib/impact';
import { Outcomes } from '@/components/outcomes';

export default async function Partner({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const sp = await searchParams;
  const me = await requirePartner();
  const { orgs, cohorts, follow, roster, noms, impact } = await asUser(me.id, async (q) => ({
    ...(await partnerData(q)),
    impact: await loadImpact(q),
    roster: await q(`select p.display_name, p.birth_year, e.status, e.track, c.name cohort_name,
        (select count(distinct a.box_number) from canvas_answers a join canvases cv on cv.id=a.canvas_id where cv.enrolment_id=e.id)::int boxes
        from enrolments e join people p on p.id=e.person_id join cohorts c on c.id=e.cohort_id order by c.seq, p.display_name`),
    noms: await q('select * from invitations where nominated_by=$1 order by created_at desc', [me.id]),
  }));
  const named = roster.length > 0;
  const stats = followupStats(follow);
  const total = cohorts.reduce((s, c) => s + c.n, 0), completed = cohorts.reduce((s, c) => s + c.completed, 0);
  const s90 = stats[2];
  const incomePie = ['higher', 'same', 'lower'].map((k) => ({ name: k, value: follow.filter((f) => f.income === k).length, color: k === 'higher' ? '#2E8B7A' : k === 'same' ? '#D4A843' : '#C8553D' })).filter((x) => x.value);
  const shown = impact.find((c) => c.id === sp.c) ?? impact.find((c) => c.m.adult?.['30']?.n || c.m.baseline?.n) ?? impact[0];
  const tt = totals(impact);
  const myOrg = orgs.find((o) => me.orgIds.includes(o.id)) ?? orgs[0];
  return (
    <>
      <PageHeader image="/images/partner-hero.jpg" title={myOrg?.name ?? 'Partner'} subtitle="Your cohorts, how participants are doing at 30, 60 and 90 days, and the documents we have released to you.">
        <Link href="/portal/partner/request" className="rounded-lg bg-gold px-4 py-2 text-sm font-bold text-teal">Request a training</Link>
      </PageHeader>
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Cohorts" value={cohorts.length} sub={`${cohorts.filter((c) => ['delivering', 'followup'].includes(c.status)).length} active`} />
        <Stat tone="green" label="Participants trained" value={total} sub={`${completed} completed`} />
        <Stat tone="gold" label="Completion" value={`${pct(completed, total)}%`} />
        <Stat label="Reached at 90 days" value={s90.total ? `${s90.done}/${s90.total}` : '—'} sub="visits completed" />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Still trading, by visit" subtitle="Made a sale in the 14 days before the visit"><BarCard data={stats.map((s) => ({ visit: `${s.visit} days`, survival: s.survival, reach: s.reach }))} x="visit" height={240} bars={[{ key: 'survival', label: '% trading', color: '#0D3B3B' }, { key: 'reach', label: '% reached', color: '#D4A843' }]} /></Card>
        <Card title="Survival at 90 days"><Gauge value={s90.survival} target={75} label="of those reached" /></Card>
        <Card title="Income compared with before">{incomePie.length ? <PieCard data={incomePie} height={220} /> : <p className="text-sm text-slate-500">Appears after the first follow-up visits.</p>}</Card>
      </div>

      {shown && (
        <div className="mt-6">
          <h2 className="mb-1 text-lg font-extrabold text-teal">Results for {shown.name}</h2>
          <p className="mb-3 text-sm text-slate-600">Totals across {tt.enrolled} participants in your cohorts, {tt.female} women and {tt.male} men. Pick a cohort:{' '}
            {impact.map((c) => <Link key={c.id} href={`/portal/partner?c=${c.id}`} className={`mr-2 underline ${c.id === shown.id ? 'font-bold text-teal' : 'text-slate-600'}`}>{c.name}</Link>)}</p>
          <Outcomes m={shown.m} />
        </div>
      )}

      <Card title="Cohorts" className="mt-4">
        <Table head={['Cohort', 'Format', 'Dates', 'Enrolled', 'Completed', 'Status']} rows={cohorts.map((c) => [<b key="n">{c.name}</b>, c.format === '12-day' ? '12-Day' : '5-Day', `${d(c.start_date)} to ${d(c.end_date)}`, c.n, c.completed, <Badge key="s" tone={statusTone(c.status)}>{c.status}</Badge>])} />
      </Card>

      <Card title="Participants" className="mt-4" subtitle={named ? 'Named access is part of your agreement.' : 'Your agreement shares results as totals, without names.'}>
        {named ? <Table head={['Name', 'Cohort', 'Status', 'Canvas boxes']} rows={roster.map((r) => [<b key="n">{r.display_name}</b>, r.cohort_name, <Badge key="s" tone={statusTone(r.status)}>{r.status}</Badge>, `${r.boxes}/12`])} />
          : <p className="text-sm text-slate-600">Totals only. If you would like named access, ask us to update your agreement.</p>}
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card title="Nominate a participant" subtitle="Bring people to the next cohort. We confirm details with you first.">
          <form action={nominate} className="space-y-2 text-sm">
            <input type="hidden" name="back" value="/portal/partner" /><input type="hidden" name="role" value="participant" /><input type="hidden" name="org" value={myOrg?.id} />
            <input name="name" placeholder="Full name" required className={inputCls} />
            <input name="contact" placeholder="Phone or email" required className={inputCls} />
            <input name="birth" type="number" placeholder="Year of birth" className={inputCls} />
            <label className="flex gap-2 text-xs"><input type="checkbox" name="guardian" />Guardian consent obtained (needed under 18)</label>
            <button className={submitCls}>Send nomination</button>
          </form>
        </Card>
        <Card title="Your nominations" className="lg:col-span-2">
          <Table head={['Name', 'Status', 'Note']} rows={noms.map((n) => [<b key="n">{n.full_name}</b>, <Badge key="s" tone={statusTone(n.status)}>{n.status}</Badge>, n.note ?? ''])} empty="No nominations yet." />
        </Card>
      </div>
      <ImgBand src="/images/partner-church-hall.jpg" className="mt-6 h-44" caption="Training happens where your people already gather." />
    </>
  );
}
