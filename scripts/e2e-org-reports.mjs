// Drives the organisation report builder in demo mode: scoping, PDF and CSV downloads, the send flow without email configured, and the history.
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
const base = process.env.BASE || 'http://localhost:3100';
const P = (n) => `00000000-0000-4000-8000-000000000${n}`;
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
let bad = 0;
const check = (name, cond, extra = '') => { if (!cond) bad++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${cond ? '' : '  -> ' + String(extra).slice(0, 300)}`); };
async function as(id) {
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 1000 }, acceptDownloads: true });
  await ctx.addCookies([{ name: 'elimu_demo', value: id, url: base }]);
  const page = await ctx.newPage(); page.on('pageerror', (e) => console.log('  pageerror', e.message));
  return { ctx, page };
}
const main = async (page) => (await page.textContent('main')) ?? '';

let { ctx, page } = await as(P(401));
await page.goto(base + '/portal/partner/reports', { waitUntil: 'networkidle' });
let tx = await main(page);
check('partner sees the builder with its own cohort', /Build a report/.test(tx) && /Reach and completion/.test(tx) && /KE358/.test(tx), tx.slice(0, 300));
check('partner sees no other organisation’s cohort', !/KE740/.test(tx));
check('a takeaway and a comparison section are shown', /completed/.test(tx) && /What participants learned/.test(tx));
const pdf = await ctx.request.get(base + (await page.getAttribute('a:has-text("Download PDF report")', 'href')));
const buf = await pdf.body(); writeFileSync('/tmp/org-report-demo.pdf', buf);
check('PDF downloads as a real PDF', pdf.status() === 200 && buf.subarray(0, 5).toString() === '%PDF-' && buf.length > 3000, pdf.status());
const csv = await ctx.request.get(base + (await page.getAttribute('a:has-text("Download data (CSV)")', 'href')));
const ct = await csv.text();
check('CSV has a header, the cohort and a total row', /^Cohort,Start,End/.test(ct) && /KE358/.test(ct) && /All selected cohorts/.test(ct), ct.slice(0, 200));
check('CSV holds no participant names', !/Amina|Juma|Zawadi|Rehema|Salim/.test(ct));
// send without email configured
await page.fill('input[name=to]', 'funder@example.org');
await page.check('input[name=confirm]');
await page.click('button:has-text("Send PDF")'); await page.waitForLoadState('networkidle'); await page.waitForTimeout(1200);
tx = await main(page); const full = (await page.textContent('body')) ?? '';
check('without email set up, the user is told nothing was sent', /not switched on/.test(full), full.slice(0, 200));
tx = await main(page);
check('history lists the downloads and the unsent email', /Download \(PDF\)/.test(tx) && /Download \(CSV\)/.test(tx) && /Email \(PDF\)/.test(tx) && /not configured/.test(tx) && /funder@example.org/.test(tx), tx.slice(-500));
await page.goto(base + '/portal/partner/reports', { waitUntil: 'networkidle' });
await page.fill('input[name=to]', 'not-an-email'); await page.check('input[name=confirm]');
await page.click('button:has-text("Send PDF")'); await page.waitForLoadState('networkidle'); await page.waitForTimeout(800);
check('a bad address is refused', /not a valid email/.test((await page.textContent('body')) ?? ''));
await page.goto(base + '/portal/partner/reports', { waitUntil: 'networkidle' });
await page.fill('input[name=to]', 'a@b.org');
await page.click('button:has-text("Send PDF")'); await page.waitForLoadState('networkidle'); await page.waitForTimeout(800);
check('sending needs the permission tickbox', /allowed to see/.test((await page.textContent('body')) ?? ''));
await ctx.close();

({ ctx, page } = await as(P(402)));
await page.goto(base + '/portal/partner/reports', { waitUntil: 'networkidle' });
tx = await main(page);
check('another partner does not see KE358 or its history', !/KE358/.test(tx) && !/funder@example.org/.test(tx), tx.slice(0, 200));
await ctx.close();

({ ctx, page } = await as(P(203)));
const r = await page.goto(base + '/portal/partner/reports', { waitUntil: 'networkidle' });
check('a trainer cannot open the partner report builder', !/Build a report/.test(await main(page)) , page.url());
const direct = await ctx.request.get(base + '/portal/partner/reports/file?f=pdf', { maxRedirects: 0 });
check('a trainer cannot fetch a report file directly', direct.status() !== 200, direct.status());
await ctx.close();
await browser.close();
console.log(bad ? `\n${bad} FAILED` : '\nall passed'); process.exit(bad ? 1 : 0);
