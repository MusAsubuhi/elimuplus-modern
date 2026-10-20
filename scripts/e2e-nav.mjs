// Navigation by screen size: phones get a side drawer behind a menu button, tablets and computers get the sections along the top.
import { chromium } from 'playwright';
const base = process.env.BASE || 'http://localhost:3100';
const P = (n) => `00000000-0000-4000-8000-000000000${n}`;
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
let bad = 0;
const check = (name, cond, extra = '') => { if (!cond) bad++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${cond ? '' : '  -> ' + String(extra).slice(0, 200)}`); };
async function open(id, w, h) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  await ctx.addCookies([{ name: 'elimu_demo', value: id, url: base }, { name: 'elimu_lang', value: 'en', url: base }]);
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(base + '/portal', { waitUntil: 'networkidle' });
  return { ctx, page, errs };
}
const noSideScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

// phone, participant
let { ctx, page, errs } = await open(P(301), 390, 800);
const menu = page.getByRole('button', { name: 'Open menu' });
check('phone shows the menu button', await menu.isVisible());
check('phone: sections are hidden until opened', !(await page.getByRole('link', { name: 'My business book' }).first().isVisible()));
check('phone: no sideways scroll', await noSideScroll(page));
await menu.click(); await page.waitForTimeout(400);
const bb = page.getByRole('link', { name: 'My business book' }).first();
check('phone: drawer opens with the sections', await bb.isVisible());
await page.keyboard.press('Escape'); await page.waitForTimeout(400);
check('phone: Escape closes the drawer', !(await bb.isVisible()));
await menu.click(); await page.waitForTimeout(400);
await bb.click(); await page.waitForURL('**/portal/book'); await page.waitForTimeout(400);
check('phone: choosing a section goes there and closes the drawer', page.url().endsWith('/portal/book') && !(await page.getByRole('link', { name: 'My business book' }).first().isVisible()));
check('phone: no errors', errs.length === 0, errs);
await ctx.close();

// tablet and computer, participant: links along the top, no menu button
for (const [label, w] of [['tablet', 820], ['computer', 1360]]) {
  ({ ctx, page, errs } = await open(P(301), w, 900));
  check(`${label}: no menu button`, !(await page.getByRole('button', { name: 'Open menu' }).isVisible()));
  const link = page.locator('nav').getByRole('link', { name: 'My business book' }).first();
  check(`${label}: sections are along the top`, await link.isVisible() && (await link.boundingBox()).y < 90, JSON.stringify(await link.boundingBox()));
  check(`${label}: no sideways scroll`, await noSideScroll(page));
  await ctx.close();
}

// computer, founder: grouped drop-downs
({ ctx, page, errs } = await open(P(101), 1360, 900));
const money = page.getByRole('button', { name: /^Money/ });
check('founder: groups appear as menus along the top', await money.isVisible());
check('founder: a menu is closed until clicked', !(await page.getByRole('link', { name: 'Trainer payments' }).first().isVisible()));
await money.click();
check('founder: clicking a group lists its sections', await page.getByRole('link', { name: 'Trainer payments' }).first().isVisible());
await page.keyboard.press('Escape');
check('founder: Escape closes the menu', !(await page.getByRole('link', { name: 'Trainer payments' }).first().isVisible()));
await money.click(); await page.getByRole('link', { name: 'Trainer payments' }).first().click(); await page.waitForURL('**/portal/payouts');
check('founder: choosing from the menu navigates', page.url().includes('/portal/payouts'));
check('founder: no errors', errs.length === 0, errs);
await ctx.close();
await browser.close();
console.log(bad ? `\n${bad} FAILED` : '\nall passed'); process.exit(bad ? 1 : 0);
