// Checks the business-book maths with figures worked out by hand. Run: node --import tsx scripts/test-book.mts
import { addDays, breakEvenUnits, dailyFixed, monthlyFixed, operatingWithin14Days, runBook, summarise, trend, weekStart, weekdayIndex, bestAndWeakestWeekday, revenueStreams, marginFromItems, nextMonthStart, prevMonthStart } from '../src/lib/book.ts';

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = '') => { cond ? pass++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  -> ' + extra}`); };
const near = (a: number | null, b: number) => a !== null && Math.abs(a - b) < 1e-6;

const cfg = { entry_mode: 'items' as const, margin_pct: null, days_per_week: 6, days_per_month: 26, opening_cash: 2000, opening_owed_to_me: 0 };
const costs = [{ amount_kes: 1500, times_per_month: 1 }, { amount_kes: 300, times_per_month: 1 }];
ok('monthly fixed = 1800', monthlyFixed(costs) === 1800);
ok('daily fixed = 1800 / 26', near(dailyFixed(cfg, costs), 1800 / 26));
ok('weekly fixed = daily x 6', near(dailyFixed(cfg, costs) * 6, (1800 / 26) * 6));
ok('break-even units rounds up (70 a day, KES 20 each = 4)', breakEvenUnits(69.23, 20) === 4);
ok('break-even units exact', breakEvenUnits(60, 20) === 3);
ok('break-even units null when nothing is earned on each', breakEvenUnits(60, 0) === null);
ok('margin from items: omena 40%, dagaa 30% averages 35%', marginFromItems([{ name: 'a', price_kes: 50, unit_cost_kes: 30 }, { name: 'b', price_kes: 100, unit_cost_kes: 70 }]) === 35);

const day = (d: string, o: Partial<any> = {}) => ({ day: d, traded: true, sales_cash: 0, sales_credit: 0, debts_received: 0, stock_paid: 0, stall_fee: 0, transport: 0, mpesa_fees: 0, other_paid: 0, debts_repaid: 0, customers: null, saved_kes: 0, cash_counted: null, ...o });
const lines = { '2026-10-05': [{ name: 'Omena', qty: 20, price_kes: 50, unit_cost_kes: 30, on_credit: false }, { name: 'Dagaa', qty: 5, price_kes: 100, unit_cost_kes: 70, on_credit: true }] };
const rows = runBook(cfg, costs, [day('2026-10-05', { stock_paid: 800, transport: 30, mpesa_fees: 10, debts_received: 100, saved_kes: 100, cash_counted: 1500 })], lines);
const r = rows[0];
ok('items mode: cash sales 20 x 50 = 1000', r.salesCash === 1000);
ok('items mode: credit sales 5 x 100 = 500', r.salesCredit === 500);
ok('sales = 1500', r.sales === 1500);
ok('contribution = 20x20 + 5x30 = 550', r.contribution === 550);
ok('paid out = 800 + 30 + 10 = 840', r.paidOut === 840);
ok('closing cash = 2000 + 1000 + 100 - 840 - 100 = 2160', near(r.closingCash, 2160));
ok('difference against counted cash = 1500 - 2160', near(r.countedDifference, -660));
ok('owed to me = 500 credit - 0 received on credit of the day... (opening 0 + 500 - 100) = 400', near(r.owedToMe, 400));
ok('break-even reached (550 >= 69.23)', r.reached === true);
ok('gap = 550 - 69.23', near(r.gap, 550 - 1800 / 26));

const simple = { ...cfg, entry_mode: 'simple' as const, margin_pct: 30 };
const s1 = runBook(simple, costs, [day('2026-10-05', { sales_cash: 200 }), day('2026-10-06', { sales_cash: 400 })], {});
ok('simple mode: contribution = 30% of sales', near(s1[0].contribution, 60) && near(s1[1].contribution, 120));
ok('simple mode: day below break-even is flagged', s1[0].reached === false && s1[1].reached === true);
ok('cash and owed carry from one day to the next', near(s1[1].openingCash, s1[0].closingCash));

const noMargin = runBook({ ...simple, margin_pct: null }, costs, [day('2026-10-05', { sales_cash: 200 })], {});
ok('simple mode without a margin: contribution unknown, break-even unknown', noMargin[0].contribution === null && noMargin[0].reached === null);
const off = runBook(simple, costs, [day('2026-10-07', { traded: false })], {});
ok('a day off carries no fixed cost and does not count as reaching break-even', off[0].fixedToday === 0 && off[0].reached === false);

// a week
const wk = runBook(simple, costs, [
  day('2026-10-05', { sales_cash: 1000, transport: 30 }), day('2026-10-06', { sales_cash: 200 }),
  day('2026-10-07', { traded: false }), day('2026-10-08', { sales_cash: 800, saved_kes: 100, customers: 9 })], {});
const w = summarise(wk, '2026-10-05', '2026-10-11');
ok('week: 3 traded days, 4 recorded', w.daysTraded === 3 && w.daysRecorded === 4);
ok('week: sales 2000', w.sales === 2000);
ok('week: contribution 30% = 600', near(w.contribution, 600));
ok('week: fixed charged on traded days only (3 x 69.23)', near(w.fixed, (1800 / 26) * 3));
ok('week: profit = 600 - 207.69 - 30', near(w.profit, 600 - (1800 / 26) * 3 - 30));
ok('week: days at break-even = 2 (day of 200 sells 60 < 69.23)', w.daysAtBreakEven === 2);
ok('week: saved 100, customers 9', w.saved === 100 && w.customers === 9);
const previous = summarise(wk, '2026-09-28', '2026-10-04');
ok('an empty period has zero days and a known zero profit', previous.daysRecorded === 0 && previous.profit === 0);

ok('trend up', trend(120, 100) === 'up');
ok('trend same inside 5%', trend(103, 100) === 'same');
ok('trend down', trend(80, 100) === 'down');
ok('trend none when unknown', trend(null, 100) === 'none');

// calendar helpers
ok('2026-10-20 is a Tuesday (index 1)', weekdayIndex('2026-10-20') === 1);
ok('week starts Monday', weekStart('2026-10-20') === '2026-10-19' && weekStart('2026-10-25') === '2026-10-19' && weekStart('2026-10-19') === '2026-10-19');
ok('addDays crosses month and year ends', addDays('2026-12-31', 1) === '2027-01-01' && addDays('2026-03-01', -1) === '2026-02-28');
ok('month helpers', nextMonthStart('2026-12-15') === '2027-01-01' && prevMonthStart('2026-01-15') === '2025-12-01');

// 90-day survival definition
const sv = runBook(simple, costs, [day('2026-10-01', { sales_cash: 100 }), day('2026-10-20', { sales_cash: 0 })], {});
ok('operating: a sale on day 14 back counts', operatingWithin14Days(sv, '2026-10-14') === true);
ok('operating: no sale in the last 14 days fails', operatingWithin14Days(sv, '2026-10-20') === false);

// weekdays and streams
const bw = bestAndWeakestWeekday(runBook(simple, costs, [day('2026-10-05', { sales_cash: 1000 }), day('2026-10-06', { sales_cash: 100 }), day('2026-10-12', { sales_cash: 900 })], {}));
ok('best weekday is Monday, weakest Tuesday', bw?.best === 0 && bw?.weakest === 1);
ok('weekday needs two different weekdays', bestAndWeakestWeekday(runBook(simple, costs, [day('2026-10-05', { sales_cash: 1000 })], {})) === null);
const st = revenueStreams(lines['2026-10-05']);
ok('streams sorted by sales with shares', st[0].name === 'Omena' && st[0].share === 67 && st[1].share === 33);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
