// Drives the founder/trainer flows in demo mode: add person, approve suggestion, suggest org, certify, journeys, pathway.
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
  page.on('pageerror', (e) => console.log('  pageerror', e.message));
  return page;
}
const text = async (page) => (await page.textContent('body')) ?? '';

// ---- founder: pathway no longer bounces, journeys start
let f = await as(P(101));
await f.goto(`${base}/portal/pathway`, { waitUntil: 'networkidle' });
check('founder pathway loads (not redirected)', f.url().endsWith('/portal/pathway'), f.url());
check('founder pathway offers to start', /not on the facilitator pathway/.test(await text(f)));
await f.goto(`${base}/portal/journey`, { waitUntil: 'networkidle' });
await f.click('text=Start my facilitator pathway'); await f.waitForLoadState('networkidle');
await f.goto(`${base}/portal/pathway`, { waitUntil: 'networkidle' });
check('founder pathway shows Tier 1 after starting', /Tier 1/.test(await text(f)) && /To reach Tier 2/.test(await text(f)));
await f.goto(`${base}/portal/journey`, { waitUntil: 'networkidle' });
await f.click('text=Start my participant journey'); await f.waitForLoadState('networkidle');
await f.goto(`${base}/portal/me`, { waitUntil: 'networkidle' });
check('founder has a participant journey', /Founders' cohort/.test(await text(f)) || /Founders’ cohort/.test(await text(f)) || /founders/i.test(await text(f)), (await text(f)).slice(0, 200));
await f.goto(`${base}/portal/canvas?phase=3`, { waitUntil: 'networkidle' });
const ta = f.locator('textarea').first();
check('founder canvas boxes are open for typing', (await ta.count()) > 0);
await ta.fill('Founder test answer'); await f.click('button:has-text("Save"), button:has-text("Hifadhi")'); await f.waitForLoadState('networkidle');
check('founder canvas answer saved', /saved|Founder test answer/i.test(await text(f)) || (await f.locator('textarea').first().inputValue()) === 'Founder test answer');
await f.goto(`${base}/portal/command`, { waitUntil: 'networkidle' });
check('founders cohort excluded from command figures', !/Founders.{0,3} (own )?cohort/.test(await text(f)));

// ---- founder: add a person (trainer tier 1, 16 years old, needs guardian)
await f.goto(`${base}/portal/team`, { waitUntil: 'networkidle' });
await f.fill('input[name=name]', 'Test Trainer'); await f.fill('input[name=phone]', '+254 712 345 678');
await f.selectOption('select[name=role]', 'facilitator:1'); await f.fill('input[name=age]', '16');
await f.click('text=Add person and create sign-in'); await f.locator('[role=alert]').first().waitFor();
check('under-18 without guardian consent is refused', /guardian consent/i.test(await text(f)));
await f.check('input[name=guardian]'); await f.selectOption('select[name=education]', 'secondary');
await f.click('text=Add person and create sign-in'); await f.getByText('can now sign in').first().waitFor();
const t1 = await text(f);
check('one-time PIN shown (6 digits)', /temporary PIN\s*\d{6}/.test(t1.replace(/\s+/g, ' ')), t1.slice(t1.indexOf('can now'), t1.indexOf('can now') + 120));
check('phone normalised to 0712345678', t1.includes('0712345678'));
await f.fill('input[name=name]', 'Dup Person'); await f.fill('input[name=phone]', '0712 345 678'); await f.click('text=Add person and create sign-in');
await f.waitForTimeout(800);
check('duplicate phone refused', /already on the platform/.test(await text(f)));
await f.reload({ waitUntil: 'networkidle' });
check('new person listed with education and age', /Test Trainer/.test(await text(f)) && /Completed secondary/.test(await text(f)));

// ---- co-founder certifies the first founder; self-certify is not offered
let c = await as(P(102));
await c.goto(`${base}/portal/team`, { waitUntil: 'networkidle' });
const rowForFounder = c.locator('tr', { hasText: 'Asubuhi (Founder)' }).last();
check('co-founder sees Issue Tier 1 for the founder', await c.locator('button:has-text("Issue Tier 1")').count() >= 1);
await c.goto(`${base}/portal/pathway?person=${P(101)}`, { waitUntil: 'networkidle' });
check('co-founder can review the founders pathway', /Asubuhi/.test(await text(c)) && /Tier 1/.test(await text(c)));
await c.goto(`${base}/portal/team`, { waitUntil: 'networkidle' });
const btns = c.locator('tr', { hasText: 'Asubuhi (Founder)' }).locator('button:has-text("Issue Tier 1")');
await btns.first().click(); await c.getByText('Tier 1 certificate issued').waitFor();
check('Tier 1 certificate issued to the founder', true);
await c.goto(`${base}/portal/team`, { waitUntil: 'networkidle' });
check('own row offers pathway, not self-certification', !(await c.locator('tr', { hasText: 'James Kimani' }).locator('button:has-text("Issue Tier")').count()));
await f.goto(`${base}/portal/pathway`, { waitUntil: 'networkidle' });
check('founder pathway now shows the certificate', /EL-\d{4}-T1-\d{3}/.test(await text(f)));

// ---- tier 1 trainer: suggests an individual and an organisation
let t = await as(P(203));
await t.goto(`${base}/portal/invite`, { waitUntil: 'networkidle' });
check('trainer reaches the suggest page', /Suggest a person/.test(await text(t)) && /Suggest an organisation/.test(await text(t)));
const indiv = t.locator('form').filter({ has: t.locator('input[name=contact]') });
await indiv.locator('input[name=name]').fill('Mama Neema'); await indiv.locator('input[name=contact]').fill('0722 111 222');
await indiv.locator('input[name=age]').fill('34'); await indiv.locator('select[name=education]').selectOption('primary');
await indiv.locator('input[name=occupation]').fill('Sells vegetables'); await indiv.locator('input[name=ward]').fill('Likoni');
await indiv.locator('button:has-text("Send for approval")').click(); await t.getByText('Suggestion sent').waitFor();
check('individual suggestion sent', true);
const org = t.locator('form').filter({ has: t.locator('input[name=contact_person]') });
await org.locator('input[name=name]').fill('Shika Adabu Youth Group'); await org.locator('select[name=type]').selectOption('ngo');
await org.locator('input[name=ward]').fill('Shika Adabu'); await org.locator('input[name=address]').fill('Near the market'); await org.locator('input[name=people]').fill('25');
await org.locator('input[name=contact_person]').fill('Hassan'); await org.locator('input[name=contact_phone]').fill('0733 000 111');
await org.locator('button:has-text("Send for approval")').click(); await t.getByText('Organisation suggested').waitFor();
check('organisation suggestion sent', true);
await t.getByText('Shika Adabu Youth Group').first().waitFor();
check('suggestions listed for the trainer', /Mama Neema/.test(await text(t)) && /Shika Adabu Youth Group/.test(await text(t)));
await t.goto(`${base}/portal/team`, { waitUntil: 'networkidle' });
check('trainer cannot open the Team page', !t.url().includes('/portal/team'), t.url());

// ---- founder reviews both
await f.goto(`${base}/portal/people`, { waitUntil: 'networkidle' });
const ptxt = await text(f);
check('founder sees individual details (age, schooling, ward)', /34 yrs/.test(ptxt) && /Completed primary/.test(ptxt) && /Sells vegetables/.test(ptxt) && /Likoni/.test(ptxt));
check('founder sees organisation details (ward, landmark, contact)', /Shika Adabu/.test(ptxt) && /Near the market/.test(ptxt) && /Hassan/.test(ptxt) && /about 25 people/.test(ptxt));
await f.locator('button:has-text("Add as partner")').first().click(); await f.getByText('Organisation added as a prospect').waitFor();
check('organisation approved as prospect', true);
const row = f.locator('tr', { hasText: 'Mama Neema' });
await row.locator('button:has-text("Approve and create account")').click();
await f.getByText('Call this person first').first().waitFor();
check('approving without a logged call is refused', true);
await row.locator('input[name=override]').fill('Known to the founders already'); await row.locator('button:has-text("Approve and create account")').click(); await f.getByText('can now sign in').first().waitFor();
check('approving a person creates an account with a PIN', /0722111222/.test(await text(f)) && /temporary PIN\s*\d{6}/.test((await text(f)).replace(/\s+/g, ' ')));
await f.goto(`${base}/portal/team`, { waitUntil: 'networkidle' });
check('approved person now on the team list', /Mama Neema/.test(await text(f)));
await f.goto(`${base}/portal/people`, { waitUntil: 'networkidle' });
check('partner list includes the new prospect', /Shika Adabu Youth Group/.test(await text(f)));

// ---- first sign-in: new person must choose their own PIN
let np = await browser.newContext({ viewport: { width: 1200, height: 900 } });
const lp = await np.newPage();
await lp.goto(`${base}/portal/login`, { waitUntil: 'networkidle' });
await lp.locator('button', { hasText: 'Mama Neema' }).first().click(); await lp.waitForURL(/set-pin/);
check('new person is sent to choose a PIN', /Choose a PIN|choose a PIN/.test(await text(lp)));
await lp.fill('input[name=pin]', '123456'); await lp.fill('input[name=again]', '123456'); await lp.click('text=Save my PIN');
await lp.getByText('not a simple run').waitFor(); check('simple PIN refused', true);
await lp.fill('input[name=pin]', '482916'); await lp.fill('input[name=again]', '482917'); await lp.click('text=Save my PIN');
await lp.getByText('do not match').waitFor(); check('mismatched PIN refused and input kept', (await lp.inputValue('input[name=pin]')) === '482916');
await lp.fill('input[name=again]', '482916'); await lp.click('text=Save my PIN'); await lp.waitForURL(/\/portal\/me|\/portal$/);
check('after saving the PIN they reach their home page', !/set-pin/.test(lp.url()), lp.url());
await lp.goto(`${base}/portal/set-pin`, { waitUntil: 'networkidle' });
check('set-pin no longer shown once a PIN is chosen', !lp.url().includes('set-pin'), lp.url());
await np.close();

// ---- first-login PIN change screen
let n = await as(P(101));
await n.goto(`${base}/portal/set-pin`, { waitUntil: 'networkidle' });
check('set-pin bounces people who do not need it', !n.url().includes('set-pin'), n.url());

await browser.close();
console.log(bad ? `${bad} problems` : 'all checks passed');
process.exit(bad ? 1 : 0);
