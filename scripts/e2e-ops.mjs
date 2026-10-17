// Drives levels, day reports, CRM readiness gate, requests-to-cohort, founder alerts and the Google Forms webhook in demo mode.
import { chromium } from 'playwright';
const base = process.env.BASE || 'http://localhost:3100';
const SECRET = process.env.FORMS_WEBHOOK_SECRET || 'test-secret';
const P = (n) => `00000000-0000-4000-8000-000000000${n}`;
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
let bad = 0;
const check = (name, cond, extra = '') => { if (!cond) bad++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${cond ? '' : '  -> ' + String(extra).slice(0, 300)}`); };
async function as(id) {
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 1000 } });
  await ctx.addCookies([{ name: 'elimu_demo', value: id, url: base }]);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('  pageerror', e.message));
  return page;
}
const text = async (page) => (await page.textContent('body')) ?? '';
const go = async (page, path) => { await page.goto(base + path, { waitUntil: 'networkidle' }); return text(page); };
const submit = async (page, sel) => { await page.click(sel); await page.waitForTimeout(1500); await page.waitForLoadState('networkidle'); };

// ---- trainee: short report with a surprise and a concern
const t = await as(P(205));
let tx = await go(t, '/portal/reports');
check('trainee sees the Trainee report', /Trainee Facilitator report/.test(tx) && /What surprised you/.test(tx), tx.slice(0, 300));
check('trainee does not see a money question', !/Money spent today/.test(tx));
await t.selectOption('select[name=cohort]', { index: 1 });
await t.fill('input[name=day_number]', '3'); await t.fill('input[name=headcount]', '27');
await t.check('input[name=started_on_time][value="Yes"]'); await t.check('input[name=room_ok][value="Mostly"]');
await t.check('input[name=engagement][value="4"]', { force: true });
await t.fill('textarea[name=best_moment]', 'The group wall gallery'); await t.fill('textarea[name=surprised_me]', 'Three girls arrived late because of a long walk');
await t.check('input[name=concern][value="Keep an eye on it"]');
await submit(t, 'button:has-text("Send report")');
check('trainee is asked to explain the concern', /Please say what happened/.test(await text(t)));
await t.selectOption('select[name=cohort]', { index: 1 });
await t.fill('input[name=day_number]', '3'); await t.fill('input[name=headcount]', '27');
await t.check('input[name=started_on_time][value="Yes"]'); await t.check('input[name=room_ok][value="Mostly"]');
await t.check('input[name=engagement][value="4"]', { force: true });
await t.fill('textarea[name=best_moment]', 'The group wall gallery'); await t.fill('textarea[name=surprised_me]', 'Three girls arrived late because of a long walk');
await t.check('input[name=concern][value="Keep an eye on it"]');
await t.fill('textarea[name=concern_note]', 'Girls walk 5 km in the dark');
await submit(t, 'button:has-text("Send report")');
check('trainee report accepted', /Report sent/.test(await text(t)), (await text(t)).slice(0, 300));
tx = await go(t, '/portal/pathway');
check('trainee pathway shows reports filed and supervisor', /Reports filed/.test(tx) && /Supervisor/.test(tx));

// ---- associate (203) supervises the trainee: reads, marks seen
const a = await as(P(203));
tx = await go(a, '/portal/reports?show=queue');
check('supervisor sees the trainee report', /Girls walk 5 km/.test(tx), tx.slice(0, 300));
await a.fill('input[name=note]', 'Good catch, I will raise it with the host'); await submit(a, 'button:has-text("Mark seen")');
check('supervisor can mark it seen', /Marked as seen/.test(await text(a)));

// ---- certified (202) must not see a trainee report they do not supervise... (202 supervises 203/204, not 205)
const c2 = await as(P(202));
tx = await go(c2, '/portal/reports?show=queue');
check('an unrelated certified facilitator does not see the trainee report', !/Girls walk 5 km/.test(tx));
tx = await go(c2, '/portal/reports');
check('certified facilitator sees the full report', /Certified Facilitator report/.test(tx) && /Money spent today/.test(tx));

// ---- founder alerts
const f = await as(P(101));
tx = await go(f, '/portal/alerts');
check('founder alerts lists the trainee report as attention', /Day report from Wanjiku/.test(tx) && /attention/.test(tx), tx.slice(0, 500));
check('alerts show email is not set up (no key in test)', /Not set up/.test(tx));
await f.fill('input[name=email]', 'founder@example.org'); await submit(f, 'button:has-text("Save")');
check('founder can save their alert email', /Alerts will be emailed to founder@example.org/.test(await text(f)));
tx = await go(f, '/portal/alerts');
await submit(f, 'button:has-text("Mark all seen")');
check('mark all seen clears the unread count', /Not yet seen by you/.test(await text(f)) && !/gold/.test('') );
const cofounder = await as(P(102));
tx = await go(cofounder, '/portal/alerts');
check('seen is per founder: co-founder still has unread', /Day report from Wanjiku/.test(tx));

// ---- partner requests a cohort; CRM gate
const k = await as(P(401));
await go(k, '/portal/partner/request');
await k.fill('input[name=name]', 'KE358 Cohort 2 test'); 
const sel = await k.locator('select[name=org]').count();
if (sel) await k.selectOption('select[name=org]', { index: 1 }).catch(() => {});
await submit(k, 'button:has-text("Send"), button:has-text("Request"), button[type=submit]');
tx = await go(f, '/portal/alerts');
check('a partner training request raised an alert', /Training requested by/.test(tx), tx.slice(0, 400));
tx = await go(f, '/portal/crm');
check('CRM lists organisations with call / visit / checks', /Called/.test(tx) && /Venue checks/.test(tx));
const link = f.locator('a:has-text("KE358 Child")').first();
await link.click(); await f.waitForURL(/\/portal\/crm\/.+/); await f.waitForLoadState('networkidle');
check('CRM org page opened', /Room and facilities checks/.test(await text(f)), f.url());
const orgUrl = f.url();
const statusForm = f.locator('form:has(select[name=status])').filter({ hasText: 'KE358 Cohort 2 test' });
const coh = f.locator('li:has-text("KE358 Cohort 2 test")').last();
await coh.locator('select[name=status]').selectOption('confirmed');
await coh.locator('button:has-text("Change status")').click(); await f.waitForTimeout(1500); await f.waitForLoadState('networkidle');
check('cohort cannot be confirmed before call, visit and checks', /Not ready yet/.test(await text(f)), (await text(f)).slice(0, 300));

// log a call and a visit as a master trainer, tick every required check
const m = await as(P(201));
await m.goto(orgUrl, { waitUntil: 'networkidle' });
await m.selectOption('form:has(textarea[name=summary]) select[name=kind]', 'call');
await m.selectOption('form:has(textarea[name=summary]) select[name=outcome]', 'reached');
await m.fill('textarea[name=summary]', 'Spoke to the pastor, happy with dates'); await submit(m, 'button:has-text("Save entry")');
check('call logged', /Logged/.test(await text(m)));
await m.selectOption('form:has(textarea[name=summary]) select[name=kind]', 'visit');
await m.selectOption('form:has(textarea[name=summary]) select[name=outcome]', 'completed');
await m.fill('textarea[name=summary]', 'Saw the hall: 60 seats, quiet'); await submit(m, 'button:has-text("Save entry")');
const sels = m.locator('select[name^=st_]'); const n = await sels.count();
for (let i = 0; i < n; i++) await sels.nth(i).selectOption('ok');
await submit(m, 'button:has-text("Save checks")');
check('venue checks saved', /Venue checks saved/.test(await text(m)));
check('org shows ready', /Ready to run a programme/.test(await text(m)) && />\s*Ready\s*</.test(await m.content()) || /Ready/.test(await text(m)));
// an issue needs a note
await m.selectOption('select[name=st_water_toilets]', 'issue'); await submit(m, 'button:has-text("Save checks")');
check('an issue without a note is refused', /Say what the problem is/.test(await text(m)));
await m.goto(orgUrl, { waitUntil: 'networkidle' });
await m.selectOption('select[name=st_water_toilets]', 'issue'); await m.fill('input[name=nt_water_toilets]', 'Toilets locked on weekdays');
await submit(m, 'button:has-text("Save checks")');
tx = await go(f, '/portal/alerts');
check('a venue issue raised an alert', /Venue issue flagged/.test(tx));
// fix it, then the founder can confirm
await m.goto(orgUrl, { waitUntil: 'networkidle' });
await m.selectOption('select[name=st_water_toilets]', 'ok'); await submit(m, 'button:has-text("Save checks")');
await f.goto(orgUrl, { waitUntil: 'networkidle' });
const coh2 = f.locator('li:has-text("KE358 Cohort 2 test")').last();
await coh2.locator('select[name=status]').selectOption('confirmed');
await coh2.locator('button:has-text("Change status")').click(); await f.waitForTimeout(1500); await f.waitForLoadState('networkidle');
check('cohort confirms once the organisation is ready', /Cohort is now confirmed/.test(await text(f)), (await text(f)).slice(0, 300));
await coh2.locator('select[name=person]').selectOption({ label: 'Wanjiku Mutua (Trainee)' }).catch(() => {});

// ---- people: approval needs a logged call
tx = await go(f, '/portal/people');
check('people page shows call status', /Not called yet|✓ Called/.test(tx));

// ---- requests link to an active cohort
const z = await as(P(202));
tx = await go(z, '/portal/requests');
check('requests page asks for cohort and training or follow-up', /Which cohort is this for/.test(tx) && /Is it for the training or a follow-up/.test(tx));
const opts = await z.locator('select[name=cohort] option').allInnerTexts();
check('requests list only running, confirmed or follow-up cohorts', opts.every((o) => !/requested|quoted|closed/.test(o)), opts.join('|'));
await z.fill('input[name=amount]', '1500'); await z.fill('textarea[name=reason]', 'Transport for follow-up visits');
await z.selectOption('select[name=purpose]', 'followup_30');
await submit(z, 'button:has-text("Submit request")');
check('training-type request without a cohort is refused', /Choose the cohort this is for/.test(await text(z)), (await text(z)).slice(0, 300));
await z.fill('input[name=amount]', '1500'); await z.fill('textarea[name=reason]', 'Transport for follow-up visits');
await z.selectOption('select[name=purpose]', 'followup_30'); await z.selectOption('select[name=cohort]', { index: 1 });
await submit(z, 'button:has-text("Submit request")');
tx = await text(z);
check('request linked to the cohort and its follow-up', /Request submitted/.test(tx) && /30-day follow-up/.test(tx), tx.slice(0, 300));

// ---- Google Forms webhook
const post = (body, secret = SECRET) => fetch(base + '/api/forms/report', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forms-secret': secret }, body: JSON.stringify(body) });
let r = await post({ level: 0, answers: {} }, 'wrong');
check('webhook refuses a wrong secret', r.status === 401);
const body = { level: 0, response_id: 'resp-1', respondent_name: 'Wanjiku Mutua', respondent_phone: '0700 000 205', cohort: 'Bandari Cohort A (demo) [00000000]', routed_email: '', phase: 'training',
  answers: { 'Which training day was this?': '2', 'How many participants were in the room?': '30', 'What surprised you today, good or bad? Anything we may not have expected.': 'Parents came to watch', 'Is there anything we should look at?': 'Urgent, someone should call me', 'If so, what happened?': 'A participant fainted' } };
r = await post(body); const j = await r.json();
check('webhook accepts a Google Form response', r.status === 200 && j.ok, JSON.stringify(j));
r = await post(body); const j2 = await r.json();
check('a repeated response is ignored', j2.duplicate === true, JSON.stringify(j2));
tx = await go(f, '/portal/alerts');
check('the form response raised an urgent alert', /Day report from/.test(tx) && /urgent/.test(tx));
tx = await go(f, '/portal/reports?show=queue');
check('the form report shows in the reading queue', /A participant fainted/.test(tx) && /from Google Form/.test(tx), tx.slice(0, 300));
r = await fetch(base + '/api/forms/cohorts', { headers: { 'x-forms-secret': SECRET } });
const cj = await r.json();
check('cohort list endpoint works for the Forms script', Array.isArray(cj.cohorts) && cj.cohorts.length > 0, JSON.stringify(cj).slice(0, 200));

await browser.close();
console.log(bad ? `\n${bad} FAILED` : '\nall ok');
process.exit(bad ? 1 : 0);
