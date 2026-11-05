// A partner administrator asks for a training, gets a proposal and quotation, then can add participants; the founders see the quotation.
import { chromium } from 'playwright';
const base = process.env.BASE || 'http://localhost:3100';
const P = (n) => `00000000-0000-4000-8000-000000000${n}`;
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
let bad = 0;
const check = (name, cond, extra = '') => { if (!cond) bad++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${cond ? '' : '  -> ' + String(extra).slice(0, 250)}`); };
async function open(id) {
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 1000 } });
  await ctx.addCookies([{ name: 'elimu_demo', value: id, url: base }]);
  return { ctx, page: await ctx.newPage() };
}
const main = async (page) => (await page.textContent('main')) ?? '';

let { ctx, page } = await open(P(403));
await page.goto(base + '/portal/partner/request', { waitUntil: 'networkidle' });
await page.locator('input[name="name"]').fill('Youth cohort, March');
await page.locator('input[name="audience"]').fill('Youth 15 to 24');
await page.locator('input[name="size"]').fill('30');
await page.locator('input[name="venue"]').fill('Likoni church hall');
await page.locator('input[name="start"]').fill('2026-11-13');
await page.getByRole('button', { name: /Request proposal and quotation/ }).click();
await page.waitForURL(/ok=|err=/);
let tx = await main(page);
check('request goes through', /Thank you\. We are preparing your proposal and quotation/.test(tx) && !/Could not send/.test(tx), tx.slice(0, 300));
check('the request now shows as being prepared', /We are preparing your proposal and quotation/.test(tx));
check('the new cohort is listed as quoted', /Youth cohort, March/.test(tx) && /quoted/i.test(tx), tx.slice(0, 500));
await page.goto(base + '/portal/partner/timeline', { waitUntil: 'networkidle' });
tx = await main(page);
check('the partner timeline opens with a start date set', /Youth cohort, March/.test(tx) || tx.length > 50, tx.slice(0, 200));
await page.goto(base + '/portal/partner/request', { waitUntil: 'networkidle' });
tx = await main(page);
check('after the first request the page explains why the form is hidden and offers a way to ask again', /Request another training/.test(tx) || /We are preparing your proposal/.test(tx), tx.slice(0, 300));
await page.goto(base + '/portal/partner/roster', { waitUntil: 'networkidle' });
tx = await main(page);
check('the roster page offers the new cohort', /Youth cohort, March/.test(tx), tx.slice(0, 300));
await page.locator('textarea[name="list"]').fill('Amina Wanjiru, 0712345678, F, 2004, yes\nJuma Otieno, 0722111222, M, 2002');
await page.getByRole('button', { name: /Add to the list/ }).click();
await page.waitForURL(/ok=|err=/);
tx = await main(page);
check('participants can be added', /2 added/.test(tx), tx.slice(0, 300));
await ctx.close();

({ ctx, page } = await open(P(101)));
await page.goto(base + '/portal/deals', { waitUntil: 'networkidle' });
tx = await main(page);
check('founders see the requested quotation', /requested by the partner/.test(tx) && /Pwani Technical College/.test(tx), tx.slice(0, 400));
const links = await page.locator('a[href*="/d/proposal/"]').evaluateAll((as) => as.map((a) => new URL(a.href).pathname));
if (links.length) {
  const dp = await ctx.newPage(); await dp.goto(base + links[0], { waitUntil: 'networkidle' });
  check('the proposal is titled by kind and organisation', /Elimu\+ Partnership Proposal for Pwani/.test(await dp.title()), await dp.title());
  await dp.goto(base + links[0].replace('/proposal/', '/quote/'), { waitUntil: 'networkidle' });
  check('the quotation is titled by kind, number and organisation', /Elimu\+ Quotation .*Pwani/.test(await dp.title()), await dp.title());
} else check('a proposal link is shown to the founder', false, 'no link');
await ctx.close();
await browser.close();
console.log(bad ? `\n${bad} FAILED` : '\nall passed'); process.exit(bad ? 1 : 0);
