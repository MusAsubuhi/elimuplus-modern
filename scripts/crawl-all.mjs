// Opens every portal page as every role in demo mode and reports errors, redirects and empty/failed pages.
import { chromium } from 'playwright';
const base = process.env.BASE || 'http://localhost:3100';
const P = (n) => `00000000-0000-4000-8000-000000000${n}`;
const roles = {
  founder: P(101), cofounder: P(102), master: P(201), tier2: P(202), tier1: P(203), tier1young: P(204),
  trainee: P(205), zawadi: P(301), rehema: P(302), amina: P(303), salim: P(306), ke358: P(401), school: P(402),
};
const paths = [
  '/portal', '/portal/me', '/portal/canvas', '/portal/canvas/print', '/portal/journey', '/portal/pathway', '/portal/cohorts',
  '/portal/command', '/portal/directory', '/portal/finance', '/portal/approvals', '/portal/invite', '/portal/people', '/portal/team',
  '/portal/qa', '/portal/requests', '/portal/reports', '/portal/reports?show=queue', '/portal/reports?show=mine', '/portal/crm', '/portal/crm?tab=people', '/portal/alerts', '/portal/audit', '/portal/partner', '/portal/partner/billing', '/portal/partner/library', '/portal/partner/request',
];
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
const out = [];
for (const [role, id] of Object.entries(roles)) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addCookies([{ name: 'elimu_demo', value: id, url: base }]);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL/.test(m.text())) errs.push('console: ' + m.text().slice(0, 160)); });
  const list = [...paths];
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    errs.length = 0;
    let status = 0;
    try {
      const r = await page.goto(base + p, { waitUntil: 'networkidle', timeout: 30000 });
      status = r?.status() ?? 0;
    } catch (e) { status = -1; errs.push('goto: ' + e.message.slice(0, 120)); }
    const url = new URL(page.url()).pathname;
    const text = (await page.locator('body').innerText().catch(() => '')) || '';
    const broken = /Application error|server-side exception|Internal Server Error|This page could not be found|Something went wrong/i.test(text);
    const banner = await page.locator('[role=alert], .alert, .flash').allInnerTexts().catch(() => []);
    // collect cohort detail links once
    if (p === '/portal/cohorts') {
      const hrefs = await page.locator('a[href^="/portal/cohorts/"]').evaluateAll((as) => [...new Set(as.map((a) => a.getAttribute('href')))]).catch(() => []);
      for (const h of hrefs.slice(0, 2)) if (!list.includes(h)) list.push(h);
    }
    out.push({ role, p, url, status, broken, len: text.length, banner: banner.filter((b) => b.trim() && !/^$/.test(b)).join(' | ').slice(0, 120), errs: [...errs].slice(0, 3) });
    if (broken || status >= 500 || errs.length) await page.screenshot({ path: `/tmp/claude-0/shots/${role}${p.replace(/\W+/g, '_')}.png` }).catch(() => {});
  }
  await ctx.close();
}
await browser.close();
const problems = out.filter((o) => o.broken || o.status >= 400 || o.status < 0 || o.errs.length);
console.log(`checked ${out.length} page loads, ${problems.length} problems`);
for (const o of problems) console.log(JSON.stringify(o));
// summary of where each role lands (redirects) for pages that did not stay put
const redirects = out.filter((o) => o.url !== o.p && !o.broken);
const byRole = {};
for (const o of redirects) (byRole[o.role] ??= []).push(`${o.p}→${o.url}`);
for (const [r, v] of Object.entries(byRole)) console.log(`redirects ${r}: ${v.length}`, ["founder","master","trainee","tier2"].includes(r) ? v.join(" ") : "");
console.log(JSON.stringify(out.filter((o) => o.len < 400 && o.url === o.p).map((o) => `${o.role}:${o.p}:${o.len}`)));
