'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { asUser } from '@/lib/db';
import { getLang, requireMe } from '@/lib/session';
import { addDays, isIsoDate, todayNairobi } from '@/lib/book';
import { bt } from '@/lib/book-text';

const s = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
const all = (f: FormData, k: string) => f.getAll(k).map((x) => String(x).trim());
const done = (path: string, msg: string, kind: 'ok' | 'err' = 'ok'): never =>
  redirect(`${path}${path.includes('?') ? '&' : '?'}${kind}=${encodeURIComponent(msg)}`);
/** A non-negative amount from a text box ("1,200" and "1 200" are fine); null when it is not a usable number. */
const amount = (v: string, empty = 0): number | null => {
  const t = v.replace(/[\s,]/g, '');
  if (t === '') return empty;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 && n < 1e9 ? Math.round(n * 100) / 100 : null;
};
const UUID = /^[0-9a-f-]{36}$/;

type Setup = {
  business_name: string; what_i_sell: string | null; where_i_trade: string | null; entry_mode: 'simple' | 'items'; margin_pct: number | null;
  days_per_week: number; days_per_month: number; opening_cash: number; opening_owed: number; goal_text: string | null; share: boolean;
};

function readSetup(f: FormData): Setup | string {
  const name = s(f, 'business_name');
  if (!name) return 'needName';
  const margin = amount(s(f, 'margin_pct'), -1);
  const cash = amount(s(f, 'opening_cash')), owed = amount(s(f, 'opening_owed'));
  if (cash === null || owed === null || margin === null || (margin > 100)) return 'numbersOnly';
  const dpw = Math.min(7, Math.max(1, Math.round(Number(s(f, 'days_per_week')) || 6)));
  const dpm = Math.min(31, Math.max(1, Math.round(Number(s(f, 'days_per_month')) || 26)));
  return {
    business_name: name.slice(0, 120), what_i_sell: s(f, 'what_i_sell').slice(0, 200) || null, where_i_trade: s(f, 'where_i_trade').slice(0, 200) || null,
    entry_mode: s(f, 'entry_mode') === 'items' ? 'items' : 'simple', margin_pct: margin < 0 ? null : margin,
    days_per_week: dpw, days_per_month: dpm, opening_cash: cash, opening_owed: owed, goal_text: s(f, 'goal_text').slice(0, 400) || null, share: f.get('share') === 'on',
  };
}

type Q = (sql: string, args?: any[]) => Promise<any[]>;

async function saveItemsAndCosts(q: Q, bookId: string, f: FormData): Promise<boolean> {
  const ids = all(f, 'item_id'), names = all(f, 'item_name'), units = all(f, 'item_unit'), costs = all(f, 'item_cost'), prices = all(f, 'item_price');
  for (let i = 0; i < names.length; i++) {
    const id = ids[i] ?? '';
    const name = names[i].slice(0, 80);
    if (!name) { if (UUID.test(id)) await q('update business_items set active=false where id=$1 and book_id=$2', [id, bookId]); continue; }
    const c = amount(costs[i] ?? ''), p = amount(prices[i] ?? '');
    if (c === null || p === null) return false;
    if (UUID.test(id)) await q('update business_items set name=$1, unit=$2, unit_cost_kes=$3, price_kes=$4, active=true, sort_order=$5 where id=$6 and book_id=$7', [name, (units[i] || '').slice(0, 30) || null, c, p, i, id, bookId]);
    else await q('insert into business_items(book_id,name,unit,unit_cost_kes,price_kes,sort_order) values($1,$2,$3,$4,$5,$6)', [bookId, name, (units[i] || '').slice(0, 30) || null, c, p, i]);
  }
  const cn = all(f, 'cost_name'), ca = all(f, 'cost_amount'), ct = all(f, 'cost_times');
  await q('delete from business_fixed_costs where book_id=$1', [bookId]);
  for (let i = 0; i < cn.length; i++) {
    if (!cn[i]) continue;
    const a = amount(ca[i] ?? ''), t = amount(ct[i] ?? '', 1);
    if (a === null || t === null) return false;
    await q('insert into business_fixed_costs(book_id,name,amount_kes,times_per_month) values($1,$2,$3,$4)', [bookId, cn[i].slice(0, 80), a, t > 0 ? t : 1]);
  }
  return true;
}

export async function startBook(f: FormData) {
  const me = await requireMe('participant');
  const t = bt(await getLang(me));
  const v = readSetup(f);
  if (typeof v === 'string') return done('/portal/book', t(v as any), 'err');
  let ok = true;
  try {
    await asUser(me.id, async (q) => {
      const enrol = (await q("select id from enrolments where person_id=$1 order by created_at desc limit 1", [me.id]))[0]?.id ?? null;
      const id = (await q(
        `insert into business_books(person_id,enrolment_id,business_name,what_i_sell,where_i_trade,started_on,entry_mode,margin_pct,days_per_week,days_per_month,opening_cash,opening_owed_to_me,goal_text,share_with_trainer)
         values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) returning id`,
        [me.id, enrol, v.business_name, v.what_i_sell, v.where_i_trade, todayNairobi(), v.entry_mode, v.margin_pct, v.days_per_week, v.days_per_month, v.opening_cash, v.opening_owed, v.goal_text, v.share]))[0].id;
      ok = await saveItemsAndCosts(q, id, f);
      if (!ok) throw new Error('numbers');
    });
  } catch { return done('/portal/book', ok ? 'Could not start the book.' : t('numbersOnly'), 'err'); }
  revalidatePath('/portal/book');
  done('/portal/book', t('title'));
}

export async function saveSetup(f: FormData) {
  const me = await requireMe('participant');
  const t = bt(await getLang(me));
  const v = readSetup(f);
  if (typeof v === 'string') return done('/portal/book/setup', t(v as any), 'err');
  let ok = true;
  try {
    await asUser(me.id, async (q) => {
      const b = (await q("select id from business_books where person_id=$1 and status='active'", [me.id]))[0];
      if (!b) throw new Error('nobook');
      await q(
        `update business_books set business_name=$1,what_i_sell=$2,where_i_trade=$3,entry_mode=$4,margin_pct=$5,days_per_week=$6,days_per_month=$7,opening_cash=$8,opening_owed_to_me=$9,goal_text=$10,share_with_trainer=$11 where id=$12`,
        [v.business_name, v.what_i_sell, v.where_i_trade, v.entry_mode, v.margin_pct, v.days_per_week, v.days_per_month, v.opening_cash, v.opening_owed, v.goal_text, v.share, b.id]);
      ok = await saveItemsAndCosts(q, b.id, f);
      if (!ok) throw new Error('numbers');
    });
  } catch { return done('/portal/book/setup', ok ? t('noBookFirst') : t('numbersOnly'), 'err'); }
  revalidatePath('/portal/book', 'layout');
  done('/portal/book/setup', t('saveBtn'));
}

const MONEY = ['sales_cash', 'sales_credit', 'debts_received', 'stock_paid', 'stall_fee', 'transport', 'mpesa_fees', 'other_paid', 'debts_repaid', 'saved_kes'] as const;

export async function saveDay(f: FormData) {
  const me = await requireMe('participant');
  const t = bt(await getLang(me));
  const day = s(f, 'day');
  const back = `/portal/book/day?d=${day}`;
  if (!isIsoDate(day)) return done('/portal/book', t('futureDay'), 'err');
  const today = todayNairobi();
  if (day > today) return done(back, t('futureDay'), 'err');
  if (day < addDays(today, -120)) return done(back, t('beforeStart'), 'err');
  const traded = f.get('traded') === 'on';
  const m: Record<string, number> = {};
  for (const k of MONEY) {
    const n = traded || k === 'saved_kes' || k === 'stock_paid' || k === 'debts_repaid' || k === 'debts_received' ? amount(s(f, k)) : 0;
    if (n === null) return done(back, t('numbersOnly'), 'err');
    m[k] = n;
  }
  const customers = s(f, 'customers') === '' ? null : amount(s(f, 'customers'));
  const counted = s(f, 'cash_counted') === '' ? null : amount(s(f, 'cash_counted'));
  if ((customers === null && s(f, 'customers') !== '') || (counted === null && s(f, 'cash_counted') !== '')) return done(back, t('numbersOnly'), 'err');
  const noticed = s(f, 'noticed').slice(0, 500) || null;
  const qCash = all(f, 'q_cash'), qCredit = all(f, 'q_credit'), itemIds = all(f, 'q_item');
  const qty = (x: string) => amount(x);
  try {
    await asUser(me.id, async (q) => {
      const b = (await q("select id, entry_mode from business_books where person_id=$1 and status='active'", [me.id]))[0];
      if (!b) throw new Error('nobook');
      const dayId = (await q(
        `insert into business_days(book_id,day,traded,sales_cash,sales_credit,debts_received,stock_paid,stall_fee,transport,mpesa_fees,other_paid,debts_repaid,customers,saved_kes,cash_counted,noticed)
         values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
         on conflict (book_id, day) do update set traded=excluded.traded, sales_cash=excluded.sales_cash, sales_credit=excluded.sales_credit, debts_received=excluded.debts_received,
           stock_paid=excluded.stock_paid, stall_fee=excluded.stall_fee, transport=excluded.transport, mpesa_fees=excluded.mpesa_fees, other_paid=excluded.other_paid,
           debts_repaid=excluded.debts_repaid, customers=excluded.customers, saved_kes=excluded.saved_kes, cash_counted=excluded.cash_counted, noticed=excluded.noticed
         returning id`,
        [b.id, day, traded, b.entry_mode === 'items' ? 0 : m.sales_cash, b.entry_mode === 'items' ? 0 : m.sales_credit, m.debts_received, m.stock_paid, m.stall_fee, m.transport, m.mpesa_fees, m.other_paid, m.debts_repaid,
         customers === null ? null : Math.round(customers), m.saved_kes, counted, noticed]))[0].id;
      if (b.entry_mode !== 'items') return;
      const items = await q('select id, name, price_kes, unit_cost_kes from business_items where book_id=$1', [b.id]);
      const byId = new Map(items.map((i: any) => [i.id, i]));
      const old = await q('select item_id, on_credit, price_kes, unit_cost_kes from business_day_lines where day_id=$1', [dayId]);
      const snap = new Map(old.map((l: any) => [`${l.item_id}|${l.on_credit}`, l]));
      const submitted = itemIds.filter((id) => byId.has(id));
      if (submitted.length) await q('delete from business_day_lines where day_id=$1 and item_id = any($2::uuid[])', [dayId, submitted]);
      for (let i = 0; i < itemIds.length; i++) {
        const it: any = byId.get(itemIds[i]);
        if (!it || !traded) continue;
        for (const [credit, raw] of [[false, qCash[i] ?? ''], [true, qCredit[i] ?? '']] as const) {
          const n = qty(raw);
          if (n === null) throw new Error('numbers');
          if (n <= 0) continue;
          const keep: any = snap.get(`${it.id}|${credit}`);
          await q('insert into business_day_lines(day_id,item_id,name,qty,price_kes,unit_cost_kes,on_credit) values($1,$2,$3,$4,$5,$6,$7)',
            [dayId, it.id, it.name, n, keep ? keep.price_kes : it.price_kes, keep ? keep.unit_cost_kes : it.unit_cost_kes, credit]);
        }
      }
      if (!traded) await q('delete from business_day_lines where day_id=$1', [dayId]);
    });
  } catch { return done(back, t('numbersOnly'), 'err'); }
  revalidatePath('/portal/book', 'layout');
  done(back, t('saveDay'));
}

export async function saveReflection(f: FormData) {
  const me = await requireMe('participant');
  const t = bt(await getLang(me));
  const kind = s(f, 'kind') === 'month' ? 'month' : 'week';
  const start = s(f, 'start');
  const back = `/portal/book/${kind}?p=${start}`;
  if (!isIsoDate(start)) return done('/portal/book', t('futureDay'), 'err');
  const data: Record<string, boolean> = {};
  for (const k of ['problem', 'solution', 'prices', 'partners']) if (f.get(`canvas_${k}`) !== null) data[k] = f.get(`canvas_${k}`) === 'true';
  try {
    await asUser(me.id, async (q) => {
      const b = (await q("select id from business_books where person_id=$1 and status='active'", [me.id]))[0];
      if (!b) throw new Error('nobook');
      await q(
        `insert into business_reflections(book_id,kind,period_start,learned,next_step,data) values($1,$2,$3,$4,$5,$6::jsonb)
         on conflict (book_id,kind,period_start) do update set learned=excluded.learned, next_step=excluded.next_step, data=excluded.data, updated_at=now()`,
        [b.id, kind, start, s(f, 'learned').slice(0, 600) || null, s(f, 'next_step').slice(0, 600) || null, JSON.stringify(data)]);
    });
  } catch { return done(back, t('noBookFirst'), 'err'); }
  revalidatePath('/portal/book', 'layout');
  done(back, t('saveBtn'));
}
