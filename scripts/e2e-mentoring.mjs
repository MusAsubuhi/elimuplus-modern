// Demo-mode check that the mentoring pages render for founder, partner and participant without errors.
import { chromium } from 'playwright';
const base = process.env.BASE || 'http://localhost:3100';
const P = (n) => `00000000-0000-4000-8000-000000000${n}`;
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
let bad = 0;
const check = (name, cond, extra = '') => { if (!cond) bad++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${cond ? '' : '  -> ' + extra}`); };
async function as(id) {
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 1000 } });
  await ctx.addCookies([{ name: 'elimu_demo', value: id, url: base }]);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { bad++; console.log('  pageerror', e.message); });
  return page;
}
const text = async (p) => (await p.textContent('body')) ?? '';
const go = async (p, path) => { const r = await p.goto(base + path, { waitUntil: 'networkidle' }); return r?.status() ?? 0; };

const f = await as(P(101));
check('founder mentoring page 200', (await go(f, '/portal/mentoring')) === 200);
let t = await text(f);
check('mentoring shows applications and create circle', /Mentor/.test(t) && /circle/i.test(t), t.slice(0, 200));
check('founder circles list 200', (await go(f, '/portal/circles')) === 200);
check('founder enquiries page 200', (await go(f, '/portal/enquiries')) === 200);
check('founder needs page 200', (await go(f, '/portal/needs')) === 200);
check('founder menu has Mentoring', /Mentoring/.test(await text(f)));

check('founder website listings page shows the four live cards', (await go(f, '/portal/website')) === 200 && /Mtongwe/.test(await text(f)) && /On the website now/.test(await text(f)));
const api = await f.request.get(base + '/api/website/cohorts');
const feed = await api.json();
check('public cohort feed returns the four published cards', api.status() === 200 && feed.cohorts?.length === 4 && !JSON.stringify(feed).match(/phone|@|KES/i), JSON.stringify(feed).slice(0, 200));
await f.goto(base + '/portal/website', { waitUntil: 'networkidle' });
const addForm = f.locator('form', { has: f.locator('button:has-text("Add as a draft")') });
await addForm.locator('input[name=badge]').fill('Youth · 12-Day SEE');
await addForm.locator('input[name=heading]').fill('August 2027');
await addForm.locator('textarea[name=blurb]').fill('Youth cohort 5, run in the August holidays.');
await addForm.locator('input[name=date_note]').fill('August 2027 · exact dates to be confirmed');
await addForm.locator('input[name=starts_on]').fill('2027-08-01');
await addForm.locator('button:has-text("Add as a draft")').click(); await f.waitForTimeout(2500);
check('new listing arrives as a draft waiting for the founder', /Waiting for you/.test(await text(f)) && /August 2027/.test(await text(f)));
check('a draft is not yet in the public feed', (await (await f.request.get(base + '/api/website/cohorts')).json()).cohorts.length === 4);
await f.locator('button:has-text("Publish on the website")').first().click(); await f.waitForLoadState('networkidle');
const after = (await (await f.request.get(base + '/api/website/cohorts')).json()).cohorts;
check('tapping Publish puts it in the feed, in date order', after.length === 5 && after[3].heading === 'August 2027' && after[4].heading === 'Mtongwe', JSON.stringify(after.map((x) => x.heading)));
const pub = await (await browser.newContext()).newPage();
check('public impact page 200', (await go(pub, '/impact')) === 200);

const trainer = await as(P(202));
const st = await go(trainer, '/portal/mentoring');
check('trainer cannot open founder mentoring page', st !== 200 || !/Create a circle/i.test(await text(trainer)) , String(st));
check('trainer circles page does not crash', (await go(trainer, '/portal/circles')) < 500);

const pa = await as(P(301));
check('participant circles page does not crash', (await go(pa, '/portal/circles')) < 500);

await browser.close();
process.exit(bad ? 1 : 0);
