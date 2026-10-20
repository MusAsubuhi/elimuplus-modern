// Walks through the business book in demo mode on a phone-sized screen: fill a day, see the result, week, month, setup, and who may look.
import { chromium } from 'playwright';
const base = process.env.BASE || 'http://localhost:3100';
const P = (n) => `00000000-0000-4000-8000-000000000${n}`;
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
let bad = 0;
const check = (name, cond, extra = '') => { if (!cond) bad++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${cond ? '' : '  -> ' + String(extra).slice(0, 300)}`); };
async function open(id, w = 390, h = 800) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  await ctx.addCookies([{ name: 'elimu_demo', value: id, url: base }, { name: 'elimu_lang', value: 'en', url: base }]);
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  return { ctx, page, errs };
}
const body = async (page) => (await page.textContent('main').catch(() => null)) ?? (await page.textContent('body')) ?? '';

let { ctx, page, errs } = await open(P(301));
await page.goto(base + '/portal/book', { waitUntil: 'networkidle' });
let tx = await body(page);
check('participant sees her own book hub', /Omena ya Zawadi/.test(tx) && /Today’s page/.test(tx) && /The last 7 days/.test(tx), tx.slice(0, 300));
check('phone screen has no sideways scroll', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
await page.goto(base + '/portal/book/day', { waitUntil: 'networkidle' });
const inputs = await page.locator('input[name="q_cash"]').count();
check('items-mode day shows a box per item', inputs === 2, inputs);
await page.locator('input[name="q_cash"]').nth(0).fill('20');
await page.locator('input[name="q_credit"]').nth(1).fill('2');
await page.locator('input[name="stock_paid"]').fill('500');
await page.locator('input[name="transport"]').fill('30');
await page.getByRole('button', { name: /Save today/ }).click();
await page.waitForLoadState('networkidle');
tx = await body(page);
// 20 omena x (50-30)=400 + 2 dagaa x 30 = 60 -> 460; fixed 1800/26 = 69.23 -> reached
check('result shows break-even reached with the right sales', /You reached break-even/.test(tx) && /KES 1,200/.test(tx), page.url() + ' ' + (await page.textContent('body')).slice(0, 300));
check('cash worked out', /Cash at end/.test(tx));
await page.goto(base + '/portal/book/week', { waitUntil: 'networkidle' });
tx = await body(page);
check('week page compares with last week', /Weekly summary/.test(tx) && /Last week/.test(tx));
await page.locator('textarea[name="learned"]').fill('Omena sells best early.');
await page.getByRole('button', { name: /^Save$/ }).click(); await page.waitForLoadState('networkidle');
check('reflection is kept', (await page.locator('textarea[name="learned"]').inputValue()) === 'Omena sells best early.');
await page.goto(base + '/portal/book/month', { waitUntil: 'networkidle' });
tx = await body(page);
check('month page shows revenue streams and canvas check', /Where my sales came from/.test(tx) && /Does my canvas still describe/.test(tx));
await page.goto(base + '/portal/book/setup', { waitUntil: 'networkidle' });
await page.locator('input[name="goal_text"], textarea[name="goal_text"]').fill('Save KES 300 a week');
await page.locator('input[name="share"]').check();
await page.getByRole('button', { name: /^Save$/ }).click(); await page.waitForLoadState('networkidle');
check('sharing can be switched on', await page.locator('input[name="share"]').isChecked());
check('participant pages have no errors', errs.length === 0, errs);
await ctx.close();

// Swahili
({ ctx, page } = await open(P(301)));
await ctx.addCookies([{ name: 'elimu_lang', value: 'sw', url: base }]);
await page.goto(base + '/portal/book', { waitUntil: 'networkidle' });
check('Swahili text is shown', /Kitabu cha Biashara Yangu/.test(await body(page)));
await ctx.close();

// trainer: Rehema shared, Zawadi (now shared in this run) readable but never writable
({ ctx, page, errs } = await open(P(203), 1100, 900));
await page.goto(base + `/portal/book/view?person=${P(302)}`, { waitUntil: 'networkidle' });
tx = await body(page);
check('trainer reads a shared book', /Rehema Mboga/.test(tx) && /read but not change/.test(tx), tx.slice(0, 300));
check('read-only view has no entry buttons', (await page.getByText('Fill in today').count()) === 0);
check('trainer view has no errors', errs.length === 0, errs);
await ctx.close();

// partner is turned away from the book
({ ctx, page } = await open(P(401)));
await page.goto(base + '/portal/book', { waitUntil: 'networkidle' });
check('partner cannot open a business book', !/Omena ya Zawadi|Rehema Mboga/.test(await body(page)) && !page.url().endsWith('/portal/book'), page.url());
await ctx.close();
await browser.close();
console.log(bad ? `\n${bad} FAILED` : '\nall passed'); process.exit(bad ? 1 : 0);
