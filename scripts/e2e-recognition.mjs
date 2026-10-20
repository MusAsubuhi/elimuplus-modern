// Checks the recognition page for each kind of person in demo mode: right sections, only their own standing, no rankings.
import { chromium } from 'playwright';
const base = process.env.BASE || 'http://localhost:3100';
const P = (n) => `00000000-0000-4000-8000-000000000${n}`;
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
let bad = 0;
const check = (name, cond, extra = '') => { if (!cond) bad++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${cond ? '' : '  -> ' + String(extra).slice(0, 300)}`); };
async function view(id, path = '/portal/recognition') {
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 1000 } });
  await ctx.addCookies([{ name: 'elimu_demo', value: id, url: base }]);
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(base + path, { waitUntil: 'networkidle' });
  const tx = (await page.textContent('main').catch(() => null)) ?? (await page.textContent('body')) ?? '';
  await ctx.close();
  return { tx, errs };
}
let r = await view(P(203));
check('trainer sees craft ladders', /Your craft as a trainer/.test(r.tx) && /Cohorts led/.test(r.tx) && /Follow-up visits kept/.test(r.tx), r.tx.slice(0, 300));
check('trainer sees no service standards', !/Service standards/.test(r.tx));
check('trainer page has no errors', r.errs.length === 0, r.errs);
r = await view(P(101));
check('founder sees service standards, not badges', /Service standards/.test(r.tx) && /Expense requests answered within 3 days/.test(r.tx) && /Trainer payments decided within 3 days/.test(r.tx), r.tx.slice(0, 400));
r = await view(P(301));
check('participant sees a private journey', /Your journey so far/.test(r.tx) && /Your business on one page/.test(r.tx) && /Private to you/.test(r.tx), r.tx.slice(0, 300));
check('participant sees no trainer or staff sections', !/Your craft as a trainer|Service standards/.test(r.tx));
r = await view(P(401));
check('partner sees impact ladder from aggregates', /Your organisation’s impact/.test(r.tx) && /Cohorts completed/.test(r.tx) && /People reached/.test(r.tx), r.tx.slice(0, 300));
check('partner sees no individual names or trainer sections', !/Your craft as a trainer|Service standards|Faith|Brian/.test(r.tx));
check('nobody sees a leaderboard', !/leaderboard|rank #|top performer/i.test(r.tx));
await browser.close();
console.log(bad ? `\n${bad} FAILED` : '\nall passed'); process.exit(bad ? 1 : 0);
