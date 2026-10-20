import 'server-only';
import { asUser } from './db';
import { addDays, num, type BookCfg, type DayRow, type FixedCost, type Item, type Line, runBook, type DayFigures } from './book';

export type BookRow = BookCfg & {
  id: string; person_id: string; business_name: string; what_i_sell: string | null; where_i_trade: string | null;
  started_on: string | null; goal_text: string | null; share_with_trainer: boolean; created_at: string;
};
export type ItemRow = Item & { id: string; unit: string | null; active: boolean; sort_order: number };
export type CostRow = FixedCost & { id: string; name: string };

export type Loaded = {
  book: BookRow; items: ItemRow[]; costs: CostRow[]; days: DayRow[]; linesByDay: Record<string, Line[]>;
  figures: DayFigures[];
};

const iso = (x: any) => (x instanceof Date ? x.toISOString().slice(0, 10) : String(x ?? '').slice(0, 10));

/** Loads one person's active book as the signed-in viewer. Row rules decide what comes back: nothing at all when it is not theirs and not shared. */
export async function loadBook(viewer: string, personId: string): Promise<Loaded | null> {
  return asUser(viewer, async (q) => {
    const b = (await q(`select * from business_books where person_id=$1 and status='active'`, [personId]))[0];
    if (!b) return null;
    const book: BookRow = {
      id: b.id, person_id: b.person_id, business_name: b.business_name, what_i_sell: b.what_i_sell, where_i_trade: b.where_i_trade,
      started_on: b.started_on ? iso(b.started_on) : null, goal_text: b.goal_text, share_with_trainer: !!b.share_with_trainer, created_at: String(b.created_at),
      entry_mode: b.entry_mode, margin_pct: b.margin_pct === null ? null : num(b.margin_pct), days_per_week: num(b.days_per_week), days_per_month: num(b.days_per_month),
      opening_cash: num(b.opening_cash), opening_owed_to_me: num(b.opening_owed_to_me),
    };
    const items: ItemRow[] = (await q(`select * from business_items where book_id=$1 order by sort_order, created_at`, [b.id]))
      .map((i: any) => ({ id: i.id, name: i.name, unit: i.unit, price_kes: num(i.price_kes), unit_cost_kes: num(i.unit_cost_kes), active: !!i.active, sort_order: num(i.sort_order) }));
    const costs: CostRow[] = (await q(`select * from business_fixed_costs where book_id=$1 order by created_at`, [b.id]))
      .map((c: any) => ({ id: c.id, name: c.name, amount_kes: num(c.amount_kes), times_per_month: num(c.times_per_month) }));
    const dayRows = await q(`select * from business_days where book_id=$1 order by day desc limit 400`, [b.id]);
    const days: DayRow[] = dayRows.map((d: any) => ({
      day: iso(d.day), traded: !!d.traded, sales_cash: num(d.sales_cash), sales_credit: num(d.sales_credit), debts_received: num(d.debts_received),
      stock_paid: num(d.stock_paid), stall_fee: num(d.stall_fee), transport: num(d.transport), mpesa_fees: num(d.mpesa_fees), other_paid: num(d.other_paid),
      debts_repaid: num(d.debts_repaid), customers: d.customers === null ? null : num(d.customers), saved_kes: num(d.saved_kes), cash_counted: d.cash_counted === null ? null : num(d.cash_counted),
    }));
    const ids = dayRows.map((d: any) => d.id);
    const lineRows = ids.length ? await q(`select l.*, d.day from business_day_lines l join business_days d on d.id=l.day_id where l.day_id = any($1::uuid[])`, [ids]) : [];
    const linesByDay: Record<string, Line[]> = {};
    for (const l of lineRows) (linesByDay[iso(l.day)] ??= []).push({ name: l.name, qty: num(l.qty), price_kes: num(l.price_kes), unit_cost_kes: num(l.unit_cost_kes), on_credit: !!l.on_credit });
    const figures = runBook(book, costs, days, linesByDay);
    return { book, items, costs, days, linesByDay, figures };
  });
}

/** Days shown as chips on the hub: the last n calendar days ending at `asOf`. */
export const lastDays = (asOf: string, n: number) => Array.from({ length: n }, (_, i) => addDays(asOf, -(n - 1 - i)));

export async function loadReflection(viewer: string, bookId: string, kind: 'week' | 'month', start: string) {
  return asUser(viewer, async (q) => {
    const r = (await q('select learned, next_step, data from business_reflections where book_id=$1 and kind=$2 and period_start=$3', [bookId, kind, start]))[0];
    return { learned: (r?.learned ?? '') as string, next_step: (r?.next_step ?? '') as string, data: (r?.data ?? {}) as Record<string, boolean> };
  });
}
