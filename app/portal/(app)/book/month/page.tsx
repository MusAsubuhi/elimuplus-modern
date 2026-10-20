import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getLang, requireMe } from '@/lib/session';
import { loadBook, loadReflection } from '@/lib/book-data';
import { addDays, bestAndWeakestWeekday, isIsoDate, monthStart, nextMonthStart, prevMonthStart, revenueStreams, summarise, todayNairobi, trend } from '@/lib/book';
import { bt, weekdayNames } from '@/lib/book-text';
import { Card, PageHeader, Stat } from '@/components/ui';
import { BookTabs, Field, bigBtn, money, textCls } from '@/components/book-ui';
import { saveReflection } from '../../../book-actions';

const arrow = (x: string) => (x === 'up' ? '▲' : x === 'down' ? '▼' : x === 'same' ? '≈' : '');

export default async function BookMonth({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const me = await requireMe('participant');
  const lang = await getLang(me);
  const t = bt(lang);
  const today = todayNairobi();
  const sp = await searchParams;
  const start = monthStart(sp.p && isIsoDate(sp.p) && sp.p <= today ? sp.p : today);
  const end = addDays(nextMonthStart(start), -1);
  const prev = prevMonthStart(start);
  const loaded = await loadBook(me.id, me.id);
  if (!loaded) redirect('/portal/book');
  const { book, figures, linesByDay } = loaded;
  const now = summarise(figures, start, end);
  const before = summarise(figures, prev, addDays(start, -1));
  const refl = await loadReflection(me.id, book.id, 'month', start);
  const names = weekdayNames(lang);
  const monthLines = Object.entries(linesByDay).filter(([d]) => d >= start && d <= end).flatMap(([, l]) => l);
  const streams = revenueStreams(monthLines);
  const bw = bestAndWeakestWeekday(figures.filter((r) => r.day >= start && r.day <= end));
  const creditShare = now.sales ? Math.round((now.salesCredit / now.sales) * 100) : 0;
  const last = figures.filter((r) => r.day <= end).slice(-1)[0];
  const isThis = start === monthStart(today);
  const rows: [string, string, string, string][] = [
    [t('sales'), money(now.sales), money(before.sales), arrow(trend(now.sales, before.daysRecorded ? before.sales : null))],
    [t('profit'), money(now.profit), money(before.profit), arrow(trend(now.profit, before.daysRecorded ? before.profit : null))],
    [t('fixedCosts'), money(now.fixed), money(before.fixed), ''],
    [t('otherCosts'), money(now.otherCosts), money(before.otherCosts), ''],
    [t('daysAtBE'), `${now.daysAtBreakEven} / ${now.daysTraded}`, `${before.daysAtBreakEven} / ${before.daysTraded}`, ''],
    [t('saved'), money(now.saved), money(before.saved), ''],
  ];
  const ticks: [string, any][] = [['problem', 'cProblem'], ['solution', 'cSolution'], ['prices', 'cPrices'], ['partners', 'cPartners']];
  return (
    <>
      <PageHeader image="/images/trainer-hero.jpg" title={t('monthTitle')} subtitle={start.slice(0, 7)} />
      <BookTabs lang={lang} active="month" />
      <div className="mb-4 flex justify-between text-sm font-bold text-teal">
        <Link href={`/portal/book/month?p=${prev}`}>← {t('prev')}</Link>
        {!isThis && <Link href={`/portal/book/month?p=${nextMonthStart(start)}`}>{t('next')} →</Link>}
      </div>
      <div className="mb-4 grid grid-cols-2 gap-3">
        <Stat label={t('profit')} value={now.profit === null ? '–' : money(now.profit)} tone={now.profit !== null && now.profit < 0 ? 'red' : 'green'} />
        <Stat label={t('owed')} value={money(last?.owedToMe ?? book.opening_owed_to_me)} tone="red" />
      </div>
      <Card>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-slate-500"><th className="py-1"></th><th>{isThis ? t('thisM') : start.slice(0, 7)}</th><th>{t('lastM')}</th><th>{t('trendLabel')}</th></tr></thead>
          <tbody>{rows.map(([k, a, b, tr]) => (<tr key={k} className="border-t border-teal-50"><td className="py-2 pr-2 font-semibold">{k}</td><td className="font-bold">{a}</td><td className="text-slate-600">{b}</td><td>{tr}</td></tr>))}</tbody>
        </table>
      </Card>
      <div className="mt-5 grid gap-5 md:grid-cols-2">
        {streams.length > 0 && (
          <Card title={t('streams')}>
            <ul className="space-y-2 text-sm">{streams.map((s) => (<li key={s.name} className="flex justify-between"><span className="font-semibold">{s.name}</span><span>{money(s.sales)} · {s.share}%</span></li>))}</ul>
          </Card>
        )}
        <Card title={t('credit')}>
          <p className="text-sm">{t('creditGiven')}: <b>{money(now.salesCredit)}</b> ({creditShare}%)</p>
          <p className="mt-1 text-sm">{t('cash')}: <b>{money(now.salesCash)}</b></p>
          <p className="mt-1 text-sm">{t('owed')}: <b>{money(last?.owedToMe ?? book.opening_owed_to_me)}</b></p>
        </Card>
        <Card title={t('bestAndWeakest')}>
          {bw ? <p className="text-sm">{t('best')}: <b>{names[bw.best]}</b> · {t('weakest')}: <b>{names[bw.weakest]}</b></p> : <p className="text-sm text-slate-500">{t('notEnough')}</p>}
        </Card>
      </div>
      <form action={saveReflection} className="mt-5 space-y-4">
        <input type="hidden" name="kind" value="month" /><input type="hidden" name="start" value={start} />
        <Card title={t('canvasCheck')} subtitle={undefined}>
          <div className="space-y-2">
            {ticks.map(([k, label]) => (
              <fieldset key={k} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-teal-100 p-2 text-sm">
                <legend className="sr-only">{t(label)}</legend>
                <span className="font-semibold">{t(label)}</span>
                <span className="flex gap-3">
                  <label className="flex items-center gap-1"><input type="radio" name={`canvas_${k}`} value="true" defaultChecked={refl.data[k] === true} /> {t('stillTrue')}</label>
                  <label className="flex items-center gap-1"><input type="radio" name={`canvas_${k}`} value="false" defaultChecked={refl.data[k] === false} /> {t('changed')}</label>
                </span>
              </fieldset>
            ))}
          </div>
          <Link href="/portal/canvas" className="mt-3 inline-block text-sm font-bold text-teal underline">{t('canvasLink')}</Link>
        </Card>
        <Card>
          <div className="space-y-4">
            <Field label={t('learned')}><textarea name="learned" rows={3} maxLength={600} defaultValue={refl.learned} className={textCls} /></Field>
            <Field label={t('nextStep')}><textarea name="next_step" rows={3} maxLength={600} defaultValue={refl.next_step} className={textCls} /></Field>
          </div>
        </Card>
        <button className={bigBtn}>{t('saveBtn')}</button>
      </form>
    </>
  );
}
