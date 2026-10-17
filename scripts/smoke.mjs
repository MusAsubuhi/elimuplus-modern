import { chromium } from 'playwright';
const base = process.env.BASE || 'http://localhost:3100';
const P = (n) => `00000000-0000-4000-8000-000000000${n}`;
const plan = {
  founder: [P(101), ['command', 'finance', 'approvals', 'people', 'audit', 'qa', 'cohorts', 'pathway', 'requests', 'invite']],
  master: [P(201), ['qa', 'cohorts', 'pathway', 'requests', 'invite']],
  tier2: [P(202), ['cohorts/00000000-0000-4000-8000-000000000501','cohorts', 'requests', 'pathway']],
  tier1young: [P(204), ['cohorts', 'pathway']],
  zawadi: [P(301), ['me', 'canvas', 'canvas/print', 'directory']],
  amina: [P(303), ['me', 'canvas']],
  ke358: [P(401), ['partner', 'partner/request', 'partner/billing', 'partner/library']],
  school: [P(402), ['partner', 'partner/billing', 'partner/library']],
};
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
let bad = 0;
for (const [who, [id, pages]] of Object.entries(plan)) {
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  await ctx.addCookies([{ name: 'elimu_demo', value: id, url: base }]);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror ' + e.message));
  page.on('console', (m) => m.type() === 'error' && !/favicon|fonts.g|ERR_TUNNEL_CONNECTION_FAILED/.test(m.text()) && errs.push('console ' + m.text()));
  for (const p of pages) {
    errs.length = 0;
    const r = await page.goto(`${base}/portal/${p}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
    const body = await page.textContent('body');
    const fail = r.status() >= 400 || /Application error|Unhandled|Internal Server Error/.test(body) || errs.length;
    if (fail) bad++;
    console.log(`${fail ? 'FAIL' : 'ok  '} ${who.padEnd(10)} /portal/${p} ${r.status()} ${errs.join(' | ').slice(0, 200)}`);
    await page.screenshot({ path: `shots/${who}-${p.replace(/\//g, '_')}.png`, fullPage: true });
  }
  await ctx.close();
}
await browser.close();
console.log(bad ? `${bad} problems` : 'all pages ok');
process.exit(bad ? 1 : 0);
