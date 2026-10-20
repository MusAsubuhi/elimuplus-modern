import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getLang, requireMe } from '@/lib/session';
import { loadBook, loadReflection } from '@/lib/book-data';
import { addDays, isIsoDate, summarise, todayNairobi, trend, weekStart } from '@/lib/book';
import { bt } from '@/lib/book-text';
import { Card, PageHeader, Stat } from '@/components/ui';
import { BookTabs, Field, bigBtn, money, textCls } from '@/components/book-ui';
import { saveReflection } from '../../../book-actions';

const arrow = (x: string) => (x === 'up' ? '▲' : x === 'down' ? '▼' : x === 'same' ? '≈' : '');

export default async function BookWeek({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const me = await requireMe('participant');
  const lang = await getLang(me);
  const t = bt(lang);
  const today = todayNairobi();
  const sp = await searchParams;
  const start = weekStart(sp.p && isIsoDate(sp.p) && sp.p <= today ? sp.p : today);
  const loaded = await loadBook(me.id, me.id);
  if (!loaded) redirect('/portal/book');
  const { book, figures } = loaded;
  const now = summarise(figures, start, addDays(start, 6));
  const before = summarise(figures, addDays(start, -7), addDays(start, -1));
  const refl = await loadReflection(me.id, book.id, 'week', start);
  const isThis = start === weekStart(today);
  const label = `${start.slice(8)}/${start.slice(5, 7)} – ${addDays(start, 6).slice(8)}/${addDays(start, 6).slice(5, 7)}`;
  const rows: [string, string, string, string][] = [
    [t('sales'), money(now.sales), money(before.sales), arrow(trend(now.sales, before.daysRecorded ? before.sales : null))],
    [t('contribution'), money(now.contribution), money(before.contribution), arrow(trend(now.contribution, before.daysRecorded ? before.contribution : null))],
    [t('fixedCosts'), money(now.fixed), money(before.fixed), ''],
    [t('otherCosts'), money(now.otherCosts), money(before.otherCosts), ''],
    [t('profit'), money(now.profit), money(before.profit), arrow(trend(now.profit, before.daysRecorded ? before.profit : null))],
    [t('daysAtBE'), `${now.daysAtBreakEven} / ${now.daysTraded}`, `${before.daysAtBreakEven} / ${before.daysTraded}`, ''],
    [t('saved'), money(now.saved), money(before.saved), ''],
  ];
  return (
    <>
      <PageHeader image="/images/trainer-hero.jpg" title={t('weekTitle')} subtitle={label} />
      <BookTabs lang={lang} active="week" />
      <div className="mb-4 flex justify-between text-sm font-bold text-teal">
        <Link href={`/portal/book/week?p=${addDays(start, -7)}`}>← {t('prev')}</Link>
        {!isThis && <Link href={`/portal/book/week?p=${addDays(start, 7)}`}>{t('next')} →</Link>}
      </div>
      <div className="mb-4 grid grid-cols-2 gap-3">
        <Stat label={t('profit')} value={now.profit === null ? '–' : money(now.profit)} tone={now.profit !== null && now.profit < 0 ? 'red' : 'green'} />
        <Stat label={t('daysTraded')} value={`${now.daysTraded} (${t('pagesFilled')}: ${now.daysRecorded})`} />
      </div>
      <Card>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-slate-500"><th className="py-1"></th><th>{isThis ? t('thisW') : label}</th><th>{t('lastW')}</th><th>{t('trendLabel')}</th></tr></thead>
          <tbody>{rows.map(([k, a, b, tr]) => (<tr key={k} className="border-t border-teal-50"><td className="py-2 pr-2 font-semibold">{k}</td><td className="font-bold">{a}</td><td className="text-slate-600">{b}</td><td>{tr}</td></tr>))}</tbody>
        </table>
        <p className="mt-3 text-xs text-slate-500">{t('profitNote')}</p>
      </Card>
      <form action={saveReflection} className="mt-5 space-y-4">
        <input type="hidden" name="kind" value="week" /><input type="hidden" name="start" value={start} />
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
