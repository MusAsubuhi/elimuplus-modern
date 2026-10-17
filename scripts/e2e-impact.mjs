// Drives the baseline, learning, exit, adult and youth follow-up webhooks in demo mode, then reads the new portal pages.
import fs from 'node:fs';
const base = process.env.BASE || 'http://localhost:3100';
const SECRET = process.env.FORMS_WEBHOOK_SECRET || 'test-secret';
const P = (n) => `00000000-0000-4000-8000-000000000${n}`;
const COHORT = 'Bandari Cohort A (demo) [00000000]';
const INS = JSON.parse(fs.readFileSync('src/lib/instruments.json', 'utf8')).instruments;
const TPL = JSON.parse(fs.readFileSync('src/lib/followup-template.json', 'utf8'));
let bad = 0;
const check = (name, cond, extra = '') => { if (!cond) bad++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${cond ? '' : '  -> ' + String(extra).slice(0, 400)}`); };
const post = async (path, body, secret = SECRET) => { const r = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forms-secret': secret }, body: JSON.stringify(body) }); return { status: r.status, j: await r.json().catch(() => ({})) }; };
const page = async (path, as) => { const r = await fetch(base + path, { headers: { cookie: `elimu_demo=${as}` }, redirect: 'manual' }); const html = await r.text(); return { status: r.status, html, text: html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/\s+/g, ' ') }; };

// Fills every field of a form with a sensible answer, keyed by question text like the Google Form sends it.
function fill(fields, pickers = {}) {
  const a = {};
  for (const f of fields) {
    const p = pickers[f.key];
    if (p !== undefined) { a[f.label] = p; continue; }
    if (f.type === 'choice') a[f.label] = f.correct ?? f.options[0];
    else if (f.type === 'checkbox') a[f.label] = f.options.slice(0, 2).join(', ');
    else if (f.type === 'number') a[f.label] = '3';
    else if (f.type === 'scale') a[f.label] = '4';
    else if (f.type === 'date') a[f.label] = '2026-10-10';
    else a[f.label] = `Sample ${f.key}`;
  }
  return a;
}
const branchFields = (inst, value) => inst.branch.options.find((o) => o.value === value).sections.flatMap((s) => s.fields);
const wrongAnswers = (fields) => Object.fromEntries(fields.filter((f) => f.correct).map((f) => [f.key, f.options.find((o) => o !== f.correct)]));

const who = { zawadi: { name: 'Zawadi Demo', phone: '0700 000 301' }, amina: { name: 'Amina Demo', phone: '0700 000 303' } };
const env = (w, extra) => ({ response_id: `r-${Math.random().toString(36).slice(2)}`, officer_name: 'Neema Achieng', officer_phone: '0700 000 201', participant_name: w.name, participant_phone: w.phone, cohort: COHORT, ...extra });

// ---- security and bad input
let r = await post('/api/forms/instrument', { instrument: 'baseline' }, 'wrong');
check('instrument webhook refuses a wrong secret', r.status === 401);
r = await post('/api/forms/instrument', { instrument: 'nonsense', answers: {} });
check('unknown instrument is a 400', r.status === 400, JSON.stringify(r));
r = await post('/api/forms/instrument', env({ name: 'Nobody Known', phone: '0799 999 999' }, { instrument: 'learning', branch: '', answers: fill(INS.learning.common) }));
check('unregistered participant is rejected, not retried', r.j.ok === false && /not registered/.test(r.j.rejected ?? ''), JSON.stringify(r));

// ---- baseline: adult and youth
const bAdult = fill([...INS.baseline.common, ...branchFields(INS.baseline, 'adult')], { education: 'Completed secondary (KCSE)', gender: 'Female', birth_year: '1998', story_consent: 'Yes, with their name', disability: 'No' });
const bodyAdult = env(who.zawadi, { instrument: 'baseline', branch: 'Adult or caregiver', answers: bAdult });
r = await post('/api/forms/instrument', bodyAdult);
check('adult baseline accepted', r.j.ok === true && !r.j.duplicate, JSON.stringify(r));
r = await post('/api/forms/instrument', bodyAdult);
check('repeated baseline is a duplicate, not a second row', r.j.duplicate === true, JSON.stringify(r));
r = await post('/api/forms/instrument', env(who.amina, { instrument: 'baseline', branch: 'Youth', answers: fill([...INS.baseline.common, ...branchFields(INS.baseline, 'youth')], { gender: 'Female', birth_year: '2006', story_consent: 'Yes, without their name' }) }));
check('youth baseline accepted', r.j.ok === true, JSON.stringify(r));
r = await post('/api/forms/instrument', env(who.amina, { instrument: 'baseline', branch: 'Somebody else', answers: {} }));
check('baseline with no group is rejected', r.j.ok === false, JSON.stringify(r));

// ---- learning pre (poor) and post (full marks), exit feedback
const L = INS.learning.common;
r = await post('/api/forms/instrument', env(who.zawadi, { instrument: 'learning', branch: '', answers: fill(L, { stage: 'Start of the programme', ...wrongAnswers(L), confidence: '2' }) }));
check('pre check accepted', r.j.ok === true, JSON.stringify(r));
r = await post('/api/forms/instrument', env(who.zawadi, { instrument: 'learning', branch: '', answers: fill(L, { stage: 'End of the programme', confidence: '5' }) }));
check('post check accepted', r.j.ok === true, JSON.stringify(r));
r = await post('/api/forms/instrument', env(who.zawadi, { instrument: 'exit', branch: '', answers: fill(INS.exit.common, { concern: 'No' }) }));
check('exit feedback accepted', r.j.ok === true, JSON.stringify(r));

// ---- adult follow-up with the new Part A fields
const st = TPL.stages['30'];
const fu = Object.fromEntries([...TPL.identity, ...st.a, ...st.b, ...st.c].map((f) => [f.key, f]));
const fa = {};
const set = (k, v) => { if (fu[k]) fa[fu[k].label] = v; };
set('visited_on', '2026-10-12'); set('a1_operating', 'Yes, same business'); set('a1_sold14', 'Yes'); set('a1_days_open', '5'); set('a2_good_day', '20');
set('a4_compare', 'Higher'); set('a5_records', 'Daily'); set('a5_separate', 'Always'); set('a6_meal', 'No'); set('a7_confidence', '4'); set('a4_knows_breakeven', 'Yes'); set('a5_key_number', 'Yes'); set('a5_used_calc', 'Yes');
set('a4_sales_range', fu.a4_sales_range?.options?.[2]); set('a3_stock_value', '6000'); set('c_status', 'Growing'); set('c_urgent', 'No');
r = await post('/api/forms/followup', { stage: 30, response_id: 'fu-1', officer_name: 'Neema Achieng', officer_phone: '0700000201', participant_name: who.zawadi.name, participant_phone: who.zawadi.phone, cohort: COHORT, answers: fa });
check('adult follow-up accepted with typed fields', r.j.ok === true && r.j.matchedParticipant, JSON.stringify(r));

// ---- youth follow-up
const yf = INS.youth_followup.branch.options.find((o) => o.value === '30').sections.flatMap((s) => s.fields);
r = await post('/api/forms/instrument', env(who.amina, { instrument: 'youth_followup', branch: 'Day 30', answers: fill([...INS.youth_followup.common, ...yf], { safety_concern: 'No' }) }));
check('youth follow-up accepted', r.j.ok === true, JSON.stringify(r));

// ---- pages
const F = P(101), SEED_COHORT = P(501);
let pg = await page(`/portal/cohorts/${SEED_COHORT}/outcomes`, F);
check('cohort outcomes page renders', pg.status === 200 && /outcomes/i.test(pg.text), pg.status + pg.text.slice(0, 200));
check('learning gain shows (paired pre and post)', /\+\d+ pts/.test(pg.text), pg.text.slice(0, 600));
check('youth table shows the visit', /Youth, visit by visit/.test(pg.text));
check('adult table shows Day 0 to Day 90', /Business owners, visit by visit/.test(pg.text));
pg = await page('/portal/impact', F);
check('founder impact page renders with the cohort', pg.status === 200 && /Bandari Cohort A/.test(pg.text), pg.text.slice(0, 300));
pg = await page(`/portal/impact?c=${SEED_COHORT}`, F);
check('impact drill-down renders', /Money habits/.test(pg.text));
pg = await page(`/portal/cohorts/${SEED_COHORT}`, F);
const m = /href="\/portal\/cohorts\/[0-9a-f-]+\/participants\/([0-9a-f-]+)"/.exec(pg.html);
check('roster links to participant profiles', !!m);
const links = [...pg.html.matchAll(/href="(\/portal\/cohorts\/[0-9a-f-]+\/participants\/[0-9a-f-]+)"/g)].map((x) => x[1]);
let profile = null;
for (const l of new Set(links)) { const p = await page(l, F); check(`profile ${l.slice(-6)} renders`, p.status === 200, p.status); if (/Zawadi/.test(p.text)) profile = p; }
check('Zawadi profile shows Day 0 vs Day 30, learning and exit', profile && /Business and household, Day 0 to Day 90/.test(profile.text) && /Exit feedback/.test(profile.text) && /Learning/.test(profile.text), profile?.text.slice(0, 500));
check('profile shows the learning gain', profile && /\d+% → 100%/.test(profile.text), profile?.text.slice(0, 500));

// ---- partners see totals only
for (const [pid, nm] of [[P(401), 'KE358 admin (aggregates)'], [P(402), 'school admin']]) {
  pg = await page('/portal/partner', pid);
  check(`${nm}: partner page renders`, pg.status === 200, pg.status);
  check(`${nm}: no individual names in results`, !/Zawadi Demo|Amina Demo/.test(pg.text));
}
pg = await page(`/portal/cohorts/${SEED_COHORT}/outcomes`, P(401));
check('partners cannot open the facilitator outcomes page', pg.status !== 200 || !/Outcomes/.test(pg.text), pg.status);

console.log(bad ? `\n${bad} FAILED` : '\nall ok');
process.exit(bad ? 1 : 0);
