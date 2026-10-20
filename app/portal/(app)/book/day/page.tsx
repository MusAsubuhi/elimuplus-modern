import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getLang, requireMe } from '@/lib/session';
import { loadBook } from '@/lib/book-data';
import { addDays, dailyFixed, isIsoDate, todayNairobi, weekdayIndex, breakEvenUnits, unitContribution } from '@/lib/book';
import { bt, weekdayNames } from '@/lib/book-text';
import { Card, PageHeader } from '@/components/ui';
import { BookTabs, Field, Ladder, bigBtn, fieldVal, money, numCls, textCls } from '@/components/book-ui';
import { saveDay } from '../../../book-actions';
import { asUser } from '@/lib/db';

export default async function BookDay({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  const me = await requireMe('participant');
  const lang = await getLang(me);
  const t = bt(lang);
  const today = todayNairobi();
  const sp = await searchParams;
  const day = sp.d && isIsoDate(sp.d) && sp.d <= today ? sp.d : today;
  const loaded = await loadBook(me.id, me.id);
  if (!loaded) redirect('/portal/book');
  const { book, items, costs, days, linesByDay, figures } = loaded;
  const row = days.find((x) => x.day === day);
  const fig = figures.find((x) => x.day === day);
  const prevFig = [...figures].reverse().find((x) => x.day < day && x.traded);
  const noticed = row ? (await asUser(me.id, (q) => q('select noticed from business_days where book_id=$1 and day=$2', [book.id, day])))[0]?.noticed ?? '' : '';
  const fixed = dailyFixed(book, costs);
  const lines = linesByDay[day] ?? [];
  const itemMode = book.entry_mode === 'items';
  const activeItems = items.filter((i) => i.active);
  const traded = row ? row.traded : true;
  const names = weekdayNames(lang);
  const nice = `${names[weekdayIndex(day)]} ${day.slice(8)}/${day.slice(5, 7)}`;
  const qtyOf = (name: string, credit: boolean) => lines.filter((l) => l.name === name && l.on_credit === credit).reduce((a, l) => a + l.qty, 0);
  const trend = fig && fig.contribution !== null && prevFig && prevFig.contribution !== null
    ? (fig.contribution > prevFig.contribution + 1 ? t('up') : fig.contribution < prevFig.contribution - 1 ? t('down') : t('same')) : null;
  const unitsHint = itemMode && activeItems.length === 1 ? breakEvenUnits(fixed, unitContribution(activeItems[0])) : null;
  return (
    <>
      <PageHeader image="/images/trainer-hero.jpg" title={`${t('dayTitle')}: ${nice}`} subtitle={book.business_name} />
      <BookTabs lang={lang} active="today" />
      <div className="mb-4 flex justify-between text-sm font-bold text-teal">
        <Link href={`/portal/book/day?d=${addDays(day, -1)}`}>← {addDays(day, -1).slice(8)}/{addDays(day, -1).slice(5, 7)}</Link>
        {day < today && <Link href={`/portal/book/day?d=${addDays(day, 1)}`}>{addDays(day, 1).slice(8)}/{addDays(day, 1).slice(5, 7)} →</Link>}
      </div>

      {fig && (
        <Card title={t('resultTitle')}>
          {fig.traded ? <Ladder lang={lang} earned={fig.contribution} needed={fixed} reached={fig.reached} /> : <p className="text-sm">{t('dayOff')}</p>}
          <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
            <div><dt className="text-slate-500">{t('sales')}</dt><dd className="font-bold">{money(fig.sales)}</dd></div>
            <div><dt className="text-slate-500">{t('paidOutShort')}</dt><dd className="font-bold">{money(fig.paidOut)}</dd></div>
            <div><dt className="text-slate-500">{t('openingCashShort')}</dt><dd className="font-bold">{money(fig.openingCash)}</dd></div>
            <div><dt className="text-slate-500">{t('closingCashShort')}</dt><dd className="font-bold">{money(fig.closingCash)}</dd></div>
          </dl>
          {fig.countedDifference !== null && (
            <p className={`mt-3 text-sm font-bold ${Math.abs(fig.countedDifference) < 1 ? 'text-emerald-700' : 'text-amber-700'}`}>
              {Math.abs(fig.countedDifference) < 1 ? `✔ ${t('matches')}` : `${t('difference')}: ${money(fig.countedDifference)}`}
            </p>
          )}
          {trend && <p className="mt-2 text-xs text-slate-500">{t('vsYesterday')}: {trend}</p>}
        </Card>
      )}

      <form action={saveDay} className="mt-5 space-y-5">
        <input type="hidden" name="day" value={day} />
        <Card>
          <label className="flex items-center gap-3 text-base font-bold">
            <input type="checkbox" name="traded" defaultChecked={traded} className="h-6 w-6" /> {t('tradingToday')}
          </label>
          <p className="mt-1 text-xs text-slate-500">{t('beNeeded')}: {money(fixed)}{unitsHint ? ` · ${t('unitsToBE')} ${unitsHint} ${activeItems[0].name}` : ''}</p>
        </Card>

        <Card title={t('soldTitle')}>
          {itemMode && activeItems.length > 0 ? (
            <div className="space-y-3">
              {activeItems.map((i) => (
                <div key={i.id} className="grid grid-cols-2 gap-2 rounded-xl border border-teal-100 p-3">
                  <input type="hidden" name="q_item" value={i.id} />
                  <div className="col-span-2 text-sm font-bold">{i.name}{i.unit ? ` / ${i.unit}` : ''} <span className="font-normal text-slate-500">{t('pricedAt')} {money(i.price_kes)}</span></div>
                  <label className="text-xs font-semibold">{t('qtyCash')}<input name="q_cash" inputMode="decimal" defaultValue={fieldVal(qtyOf(i.name, false))} className={numCls} /></label>
                  <label className="text-xs font-semibold">{t('qtyCredit')}<input name="q_credit" inputMode="decimal" defaultValue={fieldVal(qtyOf(i.name, true))} className={numCls} /></label>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <Field label={t('cashSales')}><input name="sales_cash" inputMode="decimal" defaultValue={fieldVal(row?.sales_cash)} className={numCls} /></Field>
              <Field label={t('creditSales')}><input name="sales_credit" inputMode="decimal" defaultValue={fieldVal(row?.sales_credit)} className={numCls} /></Field>
            </div>
          )}
          <div className="mt-4"><Field label={t('debtsIn')}><input name="debts_received" inputMode="decimal" defaultValue={fieldVal(row?.debts_received)} className={numCls} /></Field></div>
        </Card>

        <Card title={t('paidTitle')}>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('stockPaid')}><input name="stock_paid" inputMode="decimal" defaultValue={fieldVal(row?.stock_paid)} className={numCls} /></Field>
            <Field label={t('stallFee')}><input name="stall_fee" inputMode="decimal" defaultValue={fieldVal(row?.stall_fee)} className={numCls} /></Field>
            <Field label={t('transport')}><input name="transport" inputMode="decimal" defaultValue={fieldVal(row?.transport)} className={numCls} /></Field>
            <Field label={t('mpesa')}><input name="mpesa_fees" inputMode="decimal" defaultValue={fieldVal(row?.mpesa_fees)} className={numCls} /></Field>
            <Field label={t('other')}><input name="other_paid" inputMode="decimal" defaultValue={fieldVal(row?.other_paid)} className={numCls} /></Field>
            <Field label={t('repaid')}><input name="debts_repaid" inputMode="decimal" defaultValue={fieldVal(row?.debts_repaid)} className={numCls} /></Field>
          </div>
          <p className="mt-2 text-xs text-slate-500">{t('stallNote')}</p>
        </Card>

        <Card title={t('moreTitle')}>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label={t('customers')}><input name="customers" inputMode="numeric" defaultValue={row?.customers ?? ''} className={numCls} /></Field>
            <Field label={t('savedToday')}><input name="saved_kes" inputMode="decimal" defaultValue={fieldVal(row?.saved_kes)} className={numCls} /></Field>
            <Field label={t('counted')} hint={t('countedHint')}><input name="cash_counted" inputMode="decimal" defaultValue={row?.cash_counted ?? ''} className={numCls} /></Field>
            <Field label={t('noticed')}><textarea name="noticed" rows={2} maxLength={500} defaultValue={noticed} className={textCls} /></Field>
          </div>
        </Card>
        <button className={bigBtn}>{t('saveDay')}</button>
      </form>
    </>
  );
}
