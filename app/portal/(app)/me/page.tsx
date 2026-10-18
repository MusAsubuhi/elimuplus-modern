import Link from 'next/link';
import { asUser } from '@/lib/db';
import { getLang, requireMe } from '@/lib/session';
import { participantContext, PHASES } from '@/lib/data';
import { t, phaseKey } from '@/lib/i18n';
import { Badge, Card, ImgBand, PageHeader, ProgressBar, Stat, statusTone } from '@/components/ui';
import { BarCard, Gauge } from '@/components/charts';
import { d } from '@/lib/format';

export default async function MyJourney() {
  const me = await requireMe('participant', 'founder', 'master', 'facilitator');
  const lang = await getLang(me);
  const ctx = await asUser(me.id, (q) => participantContext(q, me.id));
  if (!ctx) return <Card title="No cohort yet">{!me.roles.includes('participant') ? <>You have not started the participant journey. <Link href="/portal/journey" className="font-bold text-teal underline">Start it here</Link>.</> : 'You are not enrolled in a cohort yet. Your facilitator will add you.'}</Card>;
  const { en, boxes, unlocked, filled, schedule, canvas } = ctx;
  const nameOf = (n: number) => boxes.find((b) => b.number === n)?.[lang === 'sw' ? 'name_sw' : 'name_en'];
  const pct = Math.round((filled.size / 12) * 100);
  const phaseBars = PHASES.map((p) => ({ phase: `${p.n}`, filled: p.boxes.filter((b) => filled.has(b)).length, left: p.boxes.filter((b) => !filled.has(b)).length }));
  const next = schedule.find((s) => s.status === 'scheduled');
  const stLabel = (s: string) => (lang === 'sw' ? { done: 'Imekamilika', scheduled: 'Imepangwa', missed: 'Imekosekana', unreachable: 'Hajapatikana' }[s] : s) ?? s;
  return (
    <>
      <PageHeader image="/images/home-canvas-hands.jpg" title={`${t(lang, 'welcome')}, ${me.displayName}`} subtitle={`${en.cohort_name} · ${en.org_name}`}>
        <Link href="/portal/canvas" className="rounded-lg bg-gold px-4 py-2 text-sm font-bold text-teal">{t(lang, 'myCanvas')} →</Link>
        <Link href="/portal/canvas/print" className="rounded-lg border border-white/50 px-4 py-2 text-sm font-bold text-white">{t(lang, 'print')}</Link>
      </PageHeader>

      <div className="grid gap-4 md:grid-cols-3">
        <Card title={t(lang, 'progress')}>
          <Gauge value={pct} label={`${filled.size}/12 ${t(lang, 'boxesFilled')}`} />
        </Card>
        <Card title={lang === 'sw' ? 'Hatua kwa hatua' : 'By phase'}>
          <BarCard data={phaseBars} x="phase" stacked height={200}
            bars={[{ key: 'filled', label: lang === 'sw' ? 'Imejazwa' : 'Filled', color: '#0D3B3B' }, { key: 'left', label: lang === 'sw' ? 'Imebaki' : 'To do', color: '#D4A843' }]} />
        </Card>
        <div className="grid gap-4">
          <Stat label={lang === 'sw' ? 'Hali ya turubai' : 'Canvas status'} value={<Badge tone={statusTone(canvas?.status ?? 'draft')}>{canvas?.status ?? 'draft'}</Badge>} sub={canvas?.updated_at ? d(canvas.updated_at) : undefined} />
          <Stat tone="gold" label={lang === 'sw' ? 'Ufuatiliaji unaofuata' : 'Next follow-up'} value={next ? `${next.visit} ${lang === 'sw' ? 'siku' : 'days'}` : '—'} sub={next ? `${t(lang, 'due')} ${d(next.due_date)}` : undefined} />
        </div>
      </div>

      <h2 className="mb-3 mt-8 text-lg font-bold text-teal">{t(lang, 'myJourney')}</h2>
      <div className="grid gap-4 lg:grid-cols-5">
        {PHASES.map((p) => (
          <Card key={p.n} title={`${p.n}. ${t(lang, phaseKey(p.n))}`}>
            <ul className="space-y-2">
              {p.boxes.map((b) => {
                const state = filled.has(b) ? 'done' : unlocked.has(b) ? 'open' : 'locked';
                return (
                  <li key={b}>
                    <Link href={state === 'locked' ? '/portal/me' : `/portal/canvas?phase=${p.n}#box-${b}`}
                      className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm ${state === 'done' ? 'border-teal bg-teal-50 text-teal' : state === 'open' ? 'border-gold bg-gold-100 text-ink' : 'border-slate-200 bg-slate-50 text-slate-400'}`}>
                      <span><b>{b}</b> {nameOf(b)}</span>
                      <span className="text-xs">{state === 'done' ? '✓' : state === 'open' ? t(lang, 'open') : '🔒'}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Card>
        ))}
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        <Card title={t(lang, 'followups')} className="md:col-span-2">
          <ol className="relative ml-3 space-y-5 border-l-2 border-teal-100 pl-6">
            {schedule.map((s) => (
              <li key={s.id} className="relative">
                <span className={`absolute -left-[34px] top-0.5 flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-white ${s.status === 'done' ? 'bg-teal' : s.status === 'unreachable' ? 'bg-[#C8553D]' : 'bg-gold'}`}>{s.visit}</span>
                <div className="font-bold text-teal">{s.visit} {lang === 'sw' ? 'siku' : 'days'} <Badge tone={statusTone(s.status)}>{stLabel(s.status)}</Badge></div>
                <div className="text-xs text-slate-500">{s.visited_on ? d(s.visited_on) : `${t(lang, 'due')} ${d(s.due_date)}`}</div>
              </li>
            ))}
            {!schedule.length && <li className="text-sm text-slate-500">{lang === 'sw' ? 'Ratiba itaonekana baada ya mafunzo.' : 'Your schedule appears after training.'}</li>}
          </ol>
        </Card>
        <ImgBand src="/images/home-follow-up-visit.jpg" className="min-h-[200px]" caption={lang === 'sw' ? 'Tunakutembelea siku 30, 60 na 90 kuona unavyoendelea.' : 'We visit at 30, 60 and 90 days to see how you are doing.'} />
      </div>
      <div className="mt-6"><ProgressBar value={pct} tone="gold" /></div>
    </>
  );
}
