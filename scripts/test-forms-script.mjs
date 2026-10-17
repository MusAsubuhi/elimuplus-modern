// Runs the generated Apps Script against a mock of Google's services, then sends the payload it builds to the real webhook.
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const base = process.env.BASE || 'http://localhost:3100';
const SECRET = process.env.FORMS_WEBHOOK_SECRET || 'test-secret';
const src = readFileSync('forms-kit/ElimuPlusForms.gs', 'utf8').replace('"PASTE_THE_SECRET_HERE"', JSON.stringify(SECRET)).replace(/const PORTAL_URL = "[^"]*"/, `const PORTAL_URL = ${JSON.stringify(base)}`);
const store = {}; const forms = {}; const mails = []; const triggers = []; let n = 0; let lastPayload = null;
const chain = (o) => new Proxy(o, { get: (t, k) => (k in t ? t[k] : (...a) => { if (/^set|^add|^create|^require|^build/.test(String(k))) { t._calls = [...(t._calls || []), [k, a]]; if (k === 'setTitle') t.title = a[0]; if (k === 'setRequired') t.required = a[0]; return p; } return p; }) });
let p;
const mkItem = (type) => { const it = { type }; p = chain(it); return p; };
const FormApp = {
  ItemType: { LIST: 'LIST' }, DestinationType: { SPREADSHEET: 'S' },
  create(title) { const id = 'form' + ++n; const items = []; const f = { id, title, items,
    getId: () => id, getPublishedUrl: () => 'https://forms/' + id, getEditUrl: () => 'https://edit/' + id,
    setDescription() { return f; }, setCollectEmail() { return f; }, setProgressBar() { return f; }, setAllowResponseEdits() { return f; }, setShowLinkToRespondAgain() { return f; }, setConfirmationMessage() { return f; },
    setDestination() {}, getItems: () => items.filter((i) => i.type === 'LIST').map((i) => ({ asListItem: () => i })),
  };
  for (const [m, t] of [['addListItem', 'LIST'], ['addTextItem', 'TEXT'], ['addParagraphTextItem', 'PARA'], ['addMultipleChoiceItem', 'CHOICE'], ['addScaleItem', 'SCALE']]) f[m] = () => { const it = { type: t, getTitle: () => it.title, setChoiceValues(v) { it.choices = v; return it; }, setTitle(x) { it.title = x; return it; }, setRequired(x) { it.required = x; return it; }, setHelpText() { return it; }, setValidation() { return it; }, setBounds() { return it; }, setLabels() { return it; } }; items.push(it); return it; };
  forms[id] = f; return f; },
  openById: (id) => forms[id], createTextValidation: () => ({ requireNumber: () => ({ build: () => ({}) }) }),
};
const ctx = {
  FormApp, Logger: { log() {} }, MailApp: { sendEmail: (m) => mails.push(m) },
  Session: { getEffectiveUser: () => ({ getEmail: () => 'owner@x.org' }) },
  SpreadsheetApp: { create: () => ({ getId: () => 's1', getUrl: () => 'https://sheet' }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => store[k] ?? null, setProperty: (k, v) => (store[k] = v), getProperties: () => ({ ...store }), deleteProperty: (k) => delete store[k] }) },
  ScriptApp: { newTrigger: (fn) => { const t = { fn }; const b = { forForm: () => b, onFormSubmit: () => b, timeBased: () => b, everyDays: () => b, everyHours: () => b, atHour: () => b, create: () => triggers.push(fn) }; return b; }, getProjectTriggers: () => [] },
  UrlFetchApp: { fetch: (url, o = {}) => { const done = (code, text) => ({ getResponseCode: () => code, getContentText: () => text }); return { __sync: true, url, o, done }; } },
};
// UrlFetchApp is synchronous in Apps Script; emulate with a pre-fetched answer table.
const lists = await (await fetch(base + '/api/forms/cohorts', { headers: { 'x-forms-secret': SECRET } })).json();
ctx.UrlFetchApp.fetch = (url, o = {}) => {
  if (url.endsWith('/api/forms/cohorts')) return { getResponseCode: () => 200, getContentText: () => JSON.stringify(lists) };
  lastPayload = JSON.parse(o.payload); return { getResponseCode: () => 200, getContentText: () => '{}' };
};
vm.createContext(ctx); vm.runInContext(src, ctx);
let bad = 0; const check = (nme, c, x = '') => { if (!c) bad++; console.log(`${c ? 'ok  ' : 'FAIL'} ${nme}${c ? '' : '  -> ' + String(x).slice(0, 300)}`); };

vm.runInContext('createAllForms()', ctx);
const made = Object.values(forms);
check('four forms are created, one per level', made.length === 4, made.length);
check('each form starts with a routing dropdown', made.every((f) => f.items[0].title === 'Send this report to'));
check('the cohort dropdown is filled from the portal', made[0].items.find((i) => i.title === 'Which cohort is this about').choices.length > 1);
check('the trainee form has the surprise question, the master form has scores', made[0].items.some((i) => /surprised you/.test(i.title)) && made[3].items.some((i) => /Preparation/.test(i.title)));
check('a submit trigger is installed for every form', triggers.filter((t) => t === 'onFormSubmit').length === 4);

// a trainee submits
const ids = JSON.parse(store.FORM_IDS);
const cohort = lists.cohorts.find((c) => /Bandari/.test(c.label)).label;
const ir = (title, resp) => ({ getItem: () => ({ getTitle: () => title }), getResponse: () => resp });
ctx.__e = { source: forms[ids['0']], response: { getId: () => 'gform-resp-77', getItemResponses: () => [
  ir('Send this report to', lists.leaders[0]?.label ?? 'x'), ir('Your full name', 'Wanjiku Mutua'), ir('Your phone number (the one you sign in to Elimu+ with)', '0700 000 205'),
  ir('Which cohort is this about', cohort), ir('This report is about', 'The training'),
  ir('Which training day was this?', '4'), ir('How many participants were in the room?', '31'),
  ir('What surprised you today, good or bad? Anything we may not have expected.', 'A parent offered the hall for free'),
  ir('Is there anything we should look at?', 'Keep an eye on it'), ir('If so, what happened?', 'Power went off twice'),
] } };
vm.runInContext('onFormSubmit(__e)', ctx);
check('the script posts a payload with level, respondent and answers', lastPayload && lastPayload.level === 0 && lastPayload.respondent_name === 'Wanjiku Mutua' && lastPayload.answers['Which training day was this?'] === '4', JSON.stringify(lastPayload));
check('the chosen leader is emailed the report', lists.leaders.length === 0 || (mails.length === 1 && /Wanjiku/.test(mails[0].subject)), JSON.stringify(mails));

// and the real webhook understands it
const r = await fetch(base + '/api/forms/report', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forms-secret': SECRET }, body: JSON.stringify(lastPayload) });
const j = await r.json();
check('the portal accepts it and matches the person and the cohort', r.status === 200 && j.ok && j.matchedPerson && j.matchedCohort, JSON.stringify(j));
console.log(bad ? `\n${bad} FAILED` : '\nall ok'); process.exit(bad ? 1 : 0);
