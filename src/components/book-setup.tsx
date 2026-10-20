import { bt } from '@/lib/book-text';
import type { Lang } from '@/lib/session';
import type { Loaded } from '@/lib/book-data';
import { Card } from '@/components/ui';
import { Field, bigBtn, fieldVal, numCls, textCls } from '@/components/book-ui';

/** One form for both first-time setup and later edits. Plain HTML, no scripts, so it works on slow phones. */
export function SetupForm({ lang, loaded, action }: { lang: Lang; loaded: Loaded | null; action: (f: FormData) => Promise<void> }) {
  const t = bt(lang);
  const b = loaded?.book;
  const items = (loaded?.items ?? []).filter((i) => i.active);
  const costs = loaded?.costs ?? [];
  const itemRows = [...items, ...Array.from({ length: Math.max(2, 4 - items.length) }, () => null)];
  const costRows = [...costs, ...Array.from({ length: Math.max(2, 3 - costs.length) }, () => null)];
  const mode = b?.entry_mode ?? 'simple';
  return (
    <form action={action} className="space-y-5">
      <Card title={t('startTitle')} subtitle={t('startHint')}>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label={t('businessName')}><input name="business_name" required maxLength={120} defaultValue={b?.business_name ?? ''} className={textCls} /></Field>
          <Field label={t('whatISell')}><input name="what_i_sell" maxLength={200} defaultValue={b?.what_i_sell ?? ''} className={textCls} /></Field>
          <Field label={t('whereITrade')}><input name="where_i_trade" maxLength={200} defaultValue={b?.where_i_trade ?? ''} className={textCls} /></Field>
          <Field label={t('daysPerWeek')}><input name="days_per_week" inputMode="numeric" defaultValue={b?.days_per_week ?? 6} className={numCls} /></Field>
          <Field label={t('daysPerMonth')}><input name="days_per_month" inputMode="numeric" defaultValue={b?.days_per_month ?? 26} className={numCls} /></Field>
          <Field label={t('openingCash')}><input name="opening_cash" inputMode="decimal" defaultValue={fieldVal(b?.opening_cash)} className={numCls} /></Field>
          <Field label={t('openingOwed')}><input name="opening_owed" inputMode="decimal" defaultValue={fieldVal(b?.opening_owed_to_me)} className={numCls} /></Field>
          <div className="md:col-span-2"><Field label={t('goal')} hint={t('goalHint')}><textarea name="goal_text" rows={2} maxLength={400} defaultValue={b?.goal_text ?? ''} className={textCls} /></Field></div>
        </div>
      </Card>

      <Card title={t('modeTitle')}>
        <div className="space-y-3">
          <label className="flex gap-3 rounded-xl border border-teal-100 p-3 text-sm">
            <input type="radio" name="entry_mode" value="simple" defaultChecked={mode === 'simple'} className="mt-1 h-5 w-5" />
            <span><b>{t('modeSimple')}</b><br /><span className="text-slate-600">{t('modeSimpleHint')}</span></span>
          </label>
          <label className="flex gap-3 rounded-xl border border-teal-100 p-3 text-sm">
            <input type="radio" name="entry_mode" value="items" defaultChecked={mode === 'items'} className="mt-1 h-5 w-5" />
            <span><b>{t('modeItems')}</b><br /><span className="text-slate-600">{t('modeItemsHint')}</span></span>
          </label>
          <Field label={t('marginLabel')} hint={t('marginHint')}>
            <input name="margin_pct" inputMode="decimal" defaultValue={b?.margin_pct ?? ''} placeholder="30" className={numCls} />
          </Field>
        </div>
      </Card>

      <Card title={t('itemsTitle')} subtitle={t('itemsHint')}>
        <div className="space-y-3">
          {itemRows.map((i, n) => (
            <div key={i?.id ?? `n${n}`} className="grid grid-cols-2 gap-2 rounded-xl border border-teal-100 p-3 md:grid-cols-4">
              <input type="hidden" name="item_id" value={i?.id ?? ''} />
              <label className="col-span-2 text-xs font-semibold md:col-span-1">{t('itemName')}<input name="item_name" maxLength={80} defaultValue={i?.name ?? ''} className={textCls} /></label>
              <label className="text-xs font-semibold">{t('itemUnit')}<input name="item_unit" maxLength={30} defaultValue={i?.unit ?? ''} className={textCls} /></label>
              <label className="text-xs font-semibold">{t('itemCost')}<input name="item_cost" inputMode="decimal" defaultValue={fieldVal(i?.unit_cost_kes)} className={numCls} /></label>
              <label className="text-xs font-semibold">{t('itemPrice')}<input name="item_price" inputMode="decimal" defaultValue={fieldVal(i?.price_kes)} className={numCls} /></label>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-500">{lang === 'sw' ? 'Futa jina ili kuondoa bidhaa. Historia yako haibadiliki.' : 'Clear the name to remove an item. Your past pages do not change.'}</p>
      </Card>

      <Card title={t('fixedTitle')} subtitle={t('fixedHint')}>
        <div className="space-y-3">
          {costRows.map((c, n) => (
            <div key={c?.id ?? `c${n}`} className="grid grid-cols-3 gap-2 rounded-xl border border-teal-100 p-3">
              <label className="col-span-3 text-xs font-semibold md:col-span-1">{t('costName')}<input name="cost_name" maxLength={80} defaultValue={c?.name ?? ''} className={textCls} /></label>
              <label className="col-span-2 text-xs font-semibold md:col-span-1">{t('costAmount')}<input name="cost_amount" inputMode="decimal" defaultValue={fieldVal(c?.amount_kes)} className={numCls} /></label>
              <label className="text-xs font-semibold">{t('costTimes')}<input name="cost_times" inputMode="decimal" defaultValue={c?.times_per_month ?? 1} className={numCls} /></label>
            </div>
          ))}
        </div>
      </Card>

      <Card title={t('shareTitle')}>
        <label className="flex gap-3 text-sm">
          <input type="checkbox" name="share" defaultChecked={b?.share_with_trainer ?? false} className="mt-1 h-5 w-5" />
          <span><b>{t('shareLabel')}</b><br /><span className="text-slate-600">{t('shareHint')}</span></span>
        </label>
      </Card>
      <button className={bigBtn}>{loaded ? t('saveBtn') : t('startBtn')}</button>
    </form>
  );
}
