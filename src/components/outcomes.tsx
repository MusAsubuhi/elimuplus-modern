import { Card, Stat, Table } from '@/components/ui';
import { BarCard, Gauge, PieCard } from '@/components/charts';
import { pct } from '@/lib/format';
import { kes } from '@/lib/format';
import { label, tallyRows, type Impact } from '@/lib/impact';

const stages = ['30', '60', '90'];
const num = (v: unknown) => (typeof v === 'number' ? v : Number(v) || 0);

/** One cohort's results, from de-identified totals only. */
export function Outcomes({ m }: { m: Impact }) {
  const base = m.baseline ?? {};
  const adult = (s: string) => m.adult?.[s] ?? {};
  const youth = (s: string) => m.youth?.[s] ?? {};
  const l = m.learning ?? {}, x = m.exit ?? {};
  const adultN = stages.reduce((s, k) => s + num(adult(k).n), 0);
  const youthN = stages.reduce((s, k) => s + num(youth(k).n), 0);
  const trading = stages.map((s) => ({ visit: `Day ${s}`, trading: pct(num(adult(s).sold14), num(adult(s).sold14_known)), reached: pct(num(adult(s).n) + 0, Math.max(num(adult(s).due), num(adult(s).n))) }));
  const habits = [
    { habit: 'Records daily', day0: pct(num(base.records_daily), num(base.adult_n)), ...Object.fromEntries(stages.map((s) => [`d${s}`, pct(num(adult(s).records_daily), num(adult(s).n))])) },
    { habit: 'Separates money', day0: pct(num(base.separates_always), num(base.adult_n)), ...Object.fromEntries(stages.map((s) => [`d${s}`, pct(num(adult(s).separates_always), num(adult(s).n))])) },
    { habit: 'Sets money aside', day0: pct(num(base.set_aside), num(base.adult_n)), ...Object.fromEntries(stages.map((s) => [`d${s}`, pct(num(adult(s).set_aside), num(adult(s).n))])) },
  ];
  const income = ['higher', 'same', 'lower'].map((k) => ({ name: label(k), value: stages.reduce((s, st) => s + num(adult(st)[k]), 0), color: k === 'higher' ? '#2E8B7A' : k === 'same' ? '#D4A843' : '#C8553D' })).filter((v) => v.value);
  const challenges: Record<string, number> = {};
  for (const s of stages) for (const [k, v] of Object.entries(adult(s).challenges ?? {})) challenges[k] = (challenges[k] ?? 0) + num(v);
  const g = tallyRows(m.gender), age = tallyRows(m.age);
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Enrolled" value={num(m.enrolled)} sub={`${num(m.completed)} completed${num(m.dropped) ? `, ${num(m.dropped)} left early` : ''}`} />
        <Stat tone="green" label="Attendance" value={m.attendance_rate != null ? `${m.attendance_rate}%` : '—'} sub={`${num(m.sessions)} sessions`} />
        <Stat tone="gold" label="Learning gain" value={l.paired_n ? `+${num(l.paired_gain)} pts` : '—'} sub={l.paired_n ? `${l.pre_pct}% to ${l.post_pct}% (${l.paired_n} people)` : 'Appears once pre and post checks are in'} />
        <Stat label="Training rating" value={x.n ? `${x.rating}/5` : '—'} sub={x.n ? `${x.recommend}/${x.n} would recommend` : 'Appears after exit feedback'} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Who took part"><PieCard data={g} height={200} />{age.length > 0 && <div className="mt-2 text-xs text-slate-600">{age.map((a) => `${a.name}: ${a.value}`).join(' · ')}</div>}
          <div className="mt-2 text-xs text-slate-600">{num(m.had_business)} already had a business · {num(m.disability)} living with a disability</div></Card>
        <Card title="Trading after training" subtitle="Made a sale in the 14 days before each visit">
          {adultN ? <BarCard data={trading} x="visit" height={220} bars={[{ key: 'trading', label: '% trading', color: '#0D3B3B' }, { key: 'reached', label: '% reached', color: '#D4A843' }]} /> : <p className="text-sm text-slate-500">Appears after the first follow-up visits.</p>}</Card>
        <Card title="Trading at 90 days">{num(adult('90').sold14_known) ? <Gauge value={pct(num(adult('90').sold14), num(adult('90').sold14_known))} target={75} label="of those reached" /> : <p className="text-sm text-slate-500">No 90-day visits yet.</p>}</Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Money habits, Day 0 to Day 90" subtitle="Share of business owners">
          {base.n || adultN ? <BarCard data={habits} x="habit" height={240} bars={[{ key: 'day0', label: 'Day 0', color: '#9AA5A0' }, { key: 'd30', label: 'Day 30', color: '#D4A843' }, { key: 'd60', label: 'Day 60', color: '#2E8B7A' }, { key: 'd90', label: 'Day 90', color: '#0D3B3B' }]} /> : <p className="text-sm text-slate-500">Appears once Day 0 baselines and follow-ups are in.</p>}</Card>
        <Card title="Income compared with before">{income.length ? <PieCard data={income} height={220} /> : <p className="text-sm text-slate-500">Appears after follow-up visits.</p>}</Card>
      </div>

      {adultN > 0 && (
        <Card title="Business owners, visit by visit">
          <Table head={['', 'Day 0', 'Day 30', 'Day 60', 'Day 90']} rows={[
            ['Reached / due', `${num(base.adult_n)}`, ...stages.map((s) => `${num(adult(s).n)} / ${num(adult(s).due)}`)],
            ['Growing or stable', '', ...stages.map((s) => (adult(s).n ? `${num(adult(s).growing) + num(adult(s).stable)} of ${adult(s).n}` : '—'))],
            ['Struggling or closed', '', ...stages.map((s) => (adult(s).n ? `${num(adult(s).struggling) + num(adult(s).closed)} of ${adult(s).n}` : '—'))],
            ['Average weekly profit', base.avg_profit ? kes(base.avg_profit) : '—', ...stages.map((s) => (adult(s).avg_profit ? kes(adult(s).avg_profit) : '—'))],
            ['Average stock value', base.avg_stock_value ? kes(base.avg_stock_value) : '—', ...stages.map((s) => (adult(s).avg_stock_value ? kes(adult(s).avg_stock_value) : '—'))],
            ['Skipped a meal for money reasons', base.n ? `${num(base.meal_any)}` : '—', ...stages.map((s) => (adult(s).n ? `${num(adult(s).meal_any)} of ${adult(s).n}` : '—'))],
            ['Confidence (1 to 5)', base.avg_confidence ?? '—', ...stages.map((s) => adult(s).confidence ?? '—')],
            ['Needed a referral', '', ...stages.map((s) => (adult(s).n ? num(adult(s).referrals) : '—'))],
          ]} />
        </Card>
      )}

      {Object.keys(challenges).length > 0 && <Card title="What participants say is hardest"><BarCard data={tallyRows(challenges).map((c) => ({ name: c.name, count: c.value }))} x="name" height={220} horizontal bars={[{ key: 'count', label: 'People', color: '#C8553D' }]} /></Card>}

      {youthN > 0 && (
        <Card title="Youth, visit by visit">
          <Table head={['', 'Day 30', 'Day 60', 'Day 90']} rows={[
            ['Visited', ...stages.map((s) => num(youth(s).n))],
            ['Officer view: on track', ...stages.map((s) => (youth(s).n ? `${num(youth(s).on_track)} of ${youth(s).n}` : '—'))],
            ['Needs support or disengaged', ...stages.map((s) => (youth(s).n ? `${num(youth(s).needs_support) + num(youth(s).disengaged)} of ${youth(s).n}` : '—'))],
            ['Earned a first income', ...stages.map((s) => (youth(s).n ? num(youth(s).first_income) : '—'))],
            ['CV ready', ...stages.map((s) => (youth(s).n ? num(youth(s).cv_ready) : '—'))],
            ['Applications / interviews', ...stages.map((s) => (youth(s).n ? `${num(youth(s).applications)} / ${num(youth(s).interviews)}` : '—'))],
            ['Venture started / operating', ...stages.map((s) => (youth(s).n ? `${num(youth(s).venture_started)} / ${num(youth(s).venture_operating)}` : '—'))],
            ['Team project done', ...stages.map((s) => (youth(s).n ? num(youth(s).team_project_done) : '—'))],
            ['Safety concerns', ...stages.map((s) => (youth(s).n ? num(youth(s).safety) : '—'))],
          ]} />
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {num(m.support?.total_kes) > 0 && <Card title="Start-up support given"><div className="text-2xl font-extrabold text-teal">{kes(m.support.total_kes)}</div><div className="text-sm text-slate-600">to {num(m.support.people)} participants</div></Card>}
        {(l.pre_n || l.post_n) ? <Card title="What they learned" subtitle="Average score on the same six questions">
          <BarCard data={[{ stage: 'Before', score: num(l.pre_pct), confidence: Math.round(num(l.pre_conf) * 20) }, { stage: 'After', score: num(l.post_pct), confidence: Math.round(num(l.post_conf) * 20) }]} x="stage" height={200} bars={[{ key: 'score', label: 'Score %', color: '#0D3B3B' }, { key: 'confidence', label: 'Confidence (out of 100)', color: '#D4A843' }]} /></Card> : null}
      </div>
    </div>
  );
}
