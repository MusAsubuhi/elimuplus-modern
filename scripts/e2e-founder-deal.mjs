// A founder creates a proposal and quotation for an organisation, accepts it, and the partner admin can then add participants.
import { chromium } from 'playwright';
const base = process.env.BASE || 'http://localhost:3100';
const P = (n) => `00000000-0000-4000-8000-000000000${n}`;
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
let bad = 0;
const check = (n, c, x = '') => { if (!c) bad++; console.log(`${c ? 'ok  ' : 'FAIL'} ${n}${c ? '' : '  -> ' + String(x).slice(0, 300)}`); };
async function open(id) { const ctx = await browser.newContext(); await ctx.addCookies([{ name: 'elimu_demo', value: id, url: base }]); return ctx.newPage(); }
const main = async (p) => (await p.textContent('main')) ?? '';
let page = await open(P(101));
await page.goto(base + '/portal/deals', { waitUntil: 'networkidle' });
await page.locator('select[name="org"]').selectOption({ label: 'Pwani Technical College (demo)' });
await page.locator('input[name="cohort"]').fill('College intake');
await page.locator('input[name="participants"]').fill('25');
await page.getByRole('button', { name: /Create/i }).first().click();
await page.waitForURL(/ok=|err=/);
let tx = await main(page);
check('founder creates proposal and quotation', /Proposal and quotation created/.test(tx), tx.slice(0, 300));
await page.getByRole('button', { name: 'They accepted' }).first().click();
await page.getByText(/Accepted\. The cohort is confirmed|Not confirmed yet|Could not mark/).waitFor();
tx = await main(page);
check('accepting an organisation that is not yet called, visited and checked explains why it is held back', /Not confirmed yet: this organisation still has to be called/.test(tx), tx.slice(0, 300));
page = await open(P(403));
await page.goto(base + '/portal/partner/roster', { waitUntil: 'networkidle' });
tx = await main(page);
check('partner admin can now add participants to it', /College intake/.test(tx), tx.slice(0, 300));
await browser.close();
console.log(bad ? `${bad} failed` : 'all passed'); process.exit(bad ? 1 : 0);
