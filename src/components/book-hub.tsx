import Link from 'next/link';
import { bt, weekdayNames } from '@/lib/book-text';
import type { Lang } from '@/lib/session';
import type { Loaded } from '@/lib/book-data';
import { lastDays } from '@/lib/book-data';
import { addDays, dailyFixed, summarise, weekStart } from '@/lib/book';
import { Card, Stat } from '@/components/ui';
import { LineCard } from '@/components/charts';
import { Ladder, money } from '@/components/book-ui';

/** The home screen of a book. The same screen serves the owner and, read-only, a trainer the owner has chosen to share with. */
export function BookHub({ lang, loaded, asOf, readOnly = false }: { lang: Lang; loaded: Loaded; asOf: string; readOnly?: boolean }) {
  const t = bt(lang);
  const { book, costs, figures } = loaded;
  const fixed = dailyFixed(book, costs);
  const byDay = new Map(figures.map((r) => [r.day, r]));
  const today = byDay.get(asOf);
  const wk = summarise(figures, weekStart(asOf), addDays(weekStart(asOf), 6));
  const last = figures[figures.length - 1];
  const chips = lastDays(asOf, 7);
  const names = weekdayNames(lang);
  const chart = lastDays(asOf, 14).map((d) => {
    const r = byDay.get(d);
    return { day: d.slice(8) + '/' + d.slice(5, 7), needed: Math.round(fixed), earned: r && r.traded && r.contribution !== null ? Math.round(r.contribution) : null };
  });
  const dayHref = (d: string) => `/portal/book/day?d=${d}`;
  return (
    <div className="space-y-5">
      <Card title={book.business_name} subtitle={[book.what_i_sell, book.where_i_trade].filter(Boolean).join(' · ') || undefined}>
        {book.goal_text && <p className="mb-3 rounded-lg bg-teal-50 p-3 text-sm text-slate-700">🎯 {book.goal_text}</p>}
        <div className="mb-1 text-sm font-bold text-teal">{t('todayPage')}: {today ? t('filled') : t('notYet')}</div>
        {today && today.traded ? (
          <Ladder lang={lang} earned={today.contribution} needed={fixed} reached={today.reached} />
        ) : !today ? (
          <p className="text-sm text-slate-600">{t('beNeeded')}: <b>{money(fixed)}</b></p>
        ) : null}
        {!readOnly && <Link href={dayHref(asOf)} className="mt-4 block rounded-xl bg-teal px-5 py-4 text-center text-base font-bold text-white md:inline-block">{today ? t('seeToday') : t('fillNow')}</Link>}
      </Card>

      <Card title={t('last7')} subtitle={readOnly ? undefined : t('tapDay')}>
        <div className="grid grid-cols-7 gap-1.5">
          {chips.map((d) => {
            const r = byDay.get(d);
            const wd = names[(new Date(d + 'T00:00:00Z').getUTCDay() + 6) % 7];
            const tone = !r ? 'border-slate-200 bg-white text-slate-500' : !r.traded ? 'border-slate-200 bg-slate-100 text-slate-600' : r.reached ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-amber-300 bg-amber-50 text-amber-800';
            const inner = (<><span className="block text-[11px] font-semibold">{wd}</span><span className="block text-base font-bold">{d.slice(8)}</span><span className="block text-xs">{!r ? '·' : !r.traded ? '–' : r.reached ? '✔' : '▽'}</span></>);
            return readOnly
              ? <div key={d} className={`rounded-lg border p-2 text-center ${tone}`}>{inner}</div>
              : <Link key={d} href={dayHref(d)} className={`rounded-lg border p-2 text-center ${tone}`}>{inner}</Link>;
          })}
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={`${t('thisWeek')}: ${t('sales')}`} value={money(wk.sales)} />
        <Stat label={`${t('thisWeek')}: ${t('profit')}`} value={wk.profit === null ? '–' : money(wk.profit)} tone={wk.profit !== null && wk.profit < 0 ? 'red' : 'green'} />
        <Stat label={t('daysAtBE')} value={`${wk.daysAtBreakEven} / ${wk.daysTraded}`} tone="gold" />
        <Stat label={t('saved')} value={money(wk.saved)} />
        <Stat label={t('owed')} value={money(last?.owedToMe ?? book.opening_owed_to_me)} tone="red" />
        <Stat label={t('cashNow')} value={money(last?.closingCash ?? book.opening_cash)} />
      </div>
      {wk.profit === null && <p className="text-xs text-slate-500">{t('profitUnknown')}</p>}

      {figures.length > 1 && (
        <Card title={t('chartTitle')}>
          <LineCard data={chart} x="day" money lines={[{ key: 'needed', label: t('needed'), color: '#C8553D' }, { key: 'earned', label: t('earned'), color: '#2E8B7A' }]} />
        </Card>
      )}
    </div>
  );
}
