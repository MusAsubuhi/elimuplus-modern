// My business book: every figure on every screen comes from the functions in this file, so the day page, the week, the month,
// the trainer's view and the tests can never disagree. Pure functions only (no database, no React).

export type BookCfg = {
  entry_mode: 'simple' | 'items';
  margin_pct: number | null;
  days_per_week: number;
  days_per_month: number;
  opening_cash: number;
  opening_owed_to_me: number;
};
export type FixedCost = { amount_kes: number; times_per_month: number };
export type Item = { id?: string; name: string; price_kes: number; unit_cost_kes: number };
export type DayRow = {
  day: string; traded: boolean;
  sales_cash: number; sales_credit: number; debts_received: number;
  stock_paid: number; stall_fee: number; transport: number; mpesa_fees: number; other_paid: number; debts_repaid: number;
  customers: number | null; saved_kes: number; cash_counted: number | null;
};
export type Line = { qty: number; price_kes: number; unit_cost_kes: number; on_credit: boolean; name?: string };

export const num = (x: unknown): number => { const v = Number(x); return Number.isFinite(v) ? v : 0; };
const r0 = (x: number) => Math.round(x);

// ---------- dates (calendar days as yyyy-mm-dd, no time zones involved) ----------
export const todayNairobi = (now: Date = new Date()): string =>
  now.toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
export const addDays = (iso: string, n: number): string => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
export const isIsoDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z'));
/** 0 = Monday ... 6 = Sunday */
export const weekdayIndex = (iso: string) => (new Date(iso + 'T00:00:00Z').getUTCDay() + 6) % 7;
export const weekStart = (iso: string) => addDays(iso, -weekdayIndex(iso));
export const monthStart = (iso: string) => iso.slice(0, 7) + '-01';
export const nextMonthStart = (iso: string) => {
  const [y, m] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
};
export const prevMonthStart = (iso: string) => {
  const [y, m] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 10);
};

// ---------- the setup pages ----------
export const monthlyFixed = (costs: FixedCost[]) => costs.reduce((a, c) => a + num(c.amount_kes) * num(c.times_per_month), 0);
export const dailyFixed = (cfg: BookCfg, costs: FixedCost[]) => (cfg.days_per_month > 0 ? monthlyFixed(costs) / cfg.days_per_month : 0);
export const weeklyFixed = (cfg: BookCfg, costs: FixedCost[]) => dailyFixed(cfg, costs) * cfg.days_per_week;
export const unitContribution = (i: Pick<Item, 'price_kes' | 'unit_cost_kes'>) => num(i.price_kes) - num(i.unit_cost_kes);
/** How many of one item must be sold to cover the day's fixed costs (null when each one earns nothing). */
export const breakEvenUnits = (fixedForPeriod: number, perUnit: number): number | null =>
  perUnit > 0 ? Math.ceil(fixedForPeriod / perUnit - 1e-9) : null;
/** Share of every shilling sold that is left after the item cost, as a percentage, from a list of items at their usual mix. */
export const marginFromItems = (items: Item[]): number | null => {
  const withPrice = items.filter((i) => num(i.price_kes) > 0);
  if (!withPrice.length) return null;
  const avg = withPrice.reduce((a, i) => a + unitContribution(i) / num(i.price_kes), 0) / withPrice.length;
  return Math.round(avg * 1000) / 10;
};

// ---------- one day ----------
export type DayFigures = {
  day: string; traded: boolean;
  salesCash: number; salesCredit: number; sales: number;
  contribution: number | null;      // what is left after the cost of the items sold
  paidOut: number; otherCosts: number;
  fixedToday: number;               // the day's share of fixed costs (0 on a day off)
  reached: boolean | null;          // null when the contribution cannot be worked out yet
  gap: number | null;               // contribution minus the day's fixed costs
  openingCash: number; closingCash: number; countedDifference: number | null;
  owedToMe: number;
  saved: number; customers: number | null;
};

/** Works out every day in date order, carrying cash and money owed from one day to the next. */
export function runBook(cfg: BookCfg, costs: FixedCost[], days: DayRow[], lines: Record<string, Line[]> | ((d: DayRow) => Line[])): DayFigures[] {
  const fixed = dailyFixed(cfg, costs);
  const sorted = [...days].sort((a, b) => a.day.localeCompare(b.day));
  const out: DayFigures[] = [];
  let cash = num(cfg.opening_cash);
  let owed = num(cfg.opening_owed_to_me);
  for (const d of sorted) {
    const ls = typeof lines === 'function' ? lines(d) : lines[d.day] ?? [];
    const useLines = cfg.entry_mode === 'items' && ls.length > 0;
    const salesCash = useLines ? ls.filter((l) => !l.on_credit).reduce((a, l) => a + l.qty * l.price_kes, 0) : num(d.sales_cash);
    const salesCredit = useLines ? ls.filter((l) => l.on_credit).reduce((a, l) => a + l.qty * l.price_kes, 0) : num(d.sales_credit);
    const sales = salesCash + salesCredit;
    let contribution: number | null;
    if (useLines) contribution = ls.reduce((a, l) => a + l.qty * (l.price_kes - l.unit_cost_kes), 0);
    else if (cfg.margin_pct !== null && cfg.margin_pct !== undefined) contribution = (sales * num(cfg.margin_pct)) / 100;
    else contribution = d.traded && sales === 0 ? 0 : null;
    const otherCosts = num(d.transport) + num(d.mpesa_fees) + num(d.other_paid);
    const paidOut = num(d.stock_paid) + num(d.stall_fee) + otherCosts + num(d.debts_repaid);
    const opening = cash;
    cash = cash + salesCash + num(d.debts_received) - paidOut - num(d.saved_kes);
    owed = Math.max(0, owed + salesCredit - num(d.debts_received));
    const fixedToday = d.traded ? fixed : 0;
    out.push({
      day: d.day, traded: d.traded, salesCash, salesCredit, sales, contribution, paidOut, otherCosts, fixedToday,
      reached: d.traded && contribution !== null ? contribution + 1e-9 >= fixed : d.traded ? null : false,
      gap: contribution !== null && d.traded ? contribution - fixed : null,
      openingCash: opening, closingCash: cash,
      countedDifference: d.cash_counted === null || d.cash_counted === undefined ? null : num(d.cash_counted) - cash,
      owedToMe: owed, saved: num(d.saved_kes), customers: d.customers === null || d.customers === undefined ? null : num(d.customers),
    });
  }
  return out;
}

// ---------- a week or a month ----------
export type PeriodFigures = {
  from: string; to: string;
  daysRecorded: number; daysTraded: number; daysAtBreakEven: number;
  sales: number; contribution: number | null; fixed: number; otherCosts: number; profit: number | null;
  saved: number; customers: number; salesCash: number; salesCredit: number;
};
export function summarise(rows: DayFigures[], from: string, to: string): PeriodFigures {
  const inside = rows.filter((r) => r.day >= from && r.day <= to);
  const traded = inside.filter((r) => r.traded);
  const unknown = traded.some((r) => r.contribution === null);
  const contribution = unknown ? null : traded.reduce((a, r) => a + (r.contribution ?? 0), 0);
  const fixed = traded.reduce((a, r) => a + r.fixedToday, 0);
  const otherCosts = inside.reduce((a, r) => a + r.otherCosts, 0);
  return {
    from, to, daysRecorded: inside.length, daysTraded: traded.length,
    daysAtBreakEven: traded.filter((r) => r.reached).length,
    sales: inside.reduce((a, r) => a + r.sales, 0), contribution, fixed, otherCosts,
    profit: contribution === null ? null : contribution - fixed - otherCosts,
    saved: inside.reduce((a, r) => a + r.saved, 0),
    customers: inside.reduce((a, r) => a + (r.customers ?? 0), 0),
    salesCash: inside.reduce((a, r) => a + r.salesCash, 0), salesCredit: inside.reduce((a, r) => a + r.salesCredit, 0),
  };
}
export type Trend = 'up' | 'same' | 'down' | 'none';
/** Compares two amounts; changes smaller than 5% of the earlier one count as "same". */
export function trend(now: number | null, before: number | null): Trend {
  if (now === null || before === null) return 'none';
  const tol = Math.max(Math.abs(before) * 0.05, 1);
  if (now > before + tol) return 'up';
  if (now < before - tol) return 'down';
  return 'same';
}

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
/** Best and weakest weekday by average contribution, from traded days only. Needs at least two weekdays with data. */
export function bestAndWeakestWeekday(rows: DayFigures[]): { best: number; weakest: number } | null {
  const buckets = new Map<number, number[]>();
  for (const r of rows) if (r.traded && r.contribution !== null) {
    const w = weekdayIndex(r.day); buckets.set(w, [...(buckets.get(w) ?? []), r.contribution]);
  }
  if (buckets.size < 2) return null;
  const avg = [...buckets.entries()].map(([w, v]) => [w, v.reduce((a, x) => a + x, 0) / v.length] as const);
  avg.sort((a, b) => b[1] - a[1]);
  return { best: avg[0][0], weakest: avg[avg.length - 1][0] };
}

export type Stream = { name: string; units: number; sales: number; contribution: number; share: number };
export function revenueStreams(all: Line[]): Stream[] {
  const m = new Map<string, Stream>();
  for (const l of all) {
    const k = l.name ?? 'Other';
    const s = m.get(k) ?? { name: k, units: 0, sales: 0, contribution: 0, share: 0 };
    s.units += l.qty; s.sales += l.qty * l.price_kes; s.contribution += l.qty * (l.price_kes - l.unit_cost_kes);
    m.set(k, s);
  }
  const total = [...m.values()].reduce((a, s) => a + s.sales, 0);
  return [...m.values()].map((s) => ({ ...s, share: total ? r0((s.sales / total) * 100) : 0 })).sort((a, b) => b.sales - a.sales);
}

/** The 90-day follow-up test: at least one sale in the 14 days up to and including the visit day. */
export function operatingWithin14Days(rows: DayFigures[], asOf: string): boolean {
  const from = addDays(asOf, -13);
  return rows.some((r) => r.day >= from && r.day <= asOf && r.traded && r.sales > 0);
}
/** Days logged out of the days that have passed since the book began (never a score or a ranking, only a mirror for the person). */
export function daysLogged(rows: DayFigures[], startedOn: string, asOf: string): { logged: number; passed: number } {
  const passed = Math.max(0, Math.round((Date.parse(asOf) - Date.parse(startedOn)) / 86400000) + 1);
  return { logged: rows.filter((r) => r.day >= startedOn && r.day <= asOf).length, passed };
}
