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
