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
  ItemType: { LIST: 'LIST' }, PageNavigationType: { SUBMIT: 'SUBMIT', CONTINUE: 'CONTINUE' }, DestinationType: { SPREADSHEET: 'S' },
  create(title) { const id = 'form' + ++n; const items = []; const f = { id, title, items,
    setTitle(t) { f.title = t; return f; }, getId: () => id, getPublishedUrl: () => 'https://forms/' + id, getEditUrl: () => 'https://edit/' + id,
    setDescription(d) { f.description = d; return f; }, getDescription: () => f.description || '', setAcceptingResponses(v) { f.accepting = v; return f; }, setCollectEmail() { return f; }, setProgressBar() { return f; }, setAllowResponseEdits() { return f; }, setShowLinkToRespondAgain() { return f; }, setConfirmationMessage() { return f; },
    setDestination() {}, getDestinationId: () => 'sheet' + id, getTitle: () => f.title, getResponses: () => [{ getTimestamp: () => new Date('2026-10-18T09:00:00Z') }], getItems: () => items.filter((i) => i.type === 'LIST').map((i) => ({ asListItem: () => i })),
  };
  for (const [m, t] of [['addListItem', 'LIST'], ['addTextItem', 'TEXT'], ['addParagraphTextItem', 'PARA'], ['addMultipleChoiceItem', 'CHOICE'], ['addScaleItem', 'SCALE'], ['addCheckboxItem', 'CHECKBOX'], ['addDateItem', 'DATE'], ['addPageBreakItem', 'PAGE']]) f[m] = () => { const it = { type: t, getTitle: () => it.title, setChoiceValues(v) { it.choices = v; return it; }, setTitle(x) { it.title = x; return it; }, setRequired(x) { it.required = x; return it; }, setHelpText() { return it; }, setValidation() { return it; }, setBounds() { return it; }, setLabels() { return it; }, setGoToPage() { return it; }, setChoices(c) { it.choices = c; return it; }, createChoice(l) { return l; }, setPoints() { return it; }, setRequired2() { return it; } }; items.push(it); return it; };
  forms[id] = f; return f; },
  openById: (id) => forms[id], createTextValidation: () => ({ requireNumber: () => ({ build: () => ({}) }) }),
};
const ctx = {
  FormApp, Logger: { log() {} }, MailApp: { sendEmail: (m) => mails.push(m) },
  Session: { getEffectiveUser: () => ({ getEmail: () => 'owner@x.org' }) },
  SpreadsheetApp: { create: () => ({ getId: () => 's1', getUrl: () => 'https://sheet' }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => store[k] ?? null, setProperty: (k, v) => (store[k] = v), getProperties: () => ({ ...store }), deleteProperty: (k) => delete store[k] }) },
  ScriptApp: { newTrigger: (fn) => { const t = { fn }; const b = { forForm: () => b, onFormSubmit: () => b, timeBased: () => b, everyDays: () => b, everyHours: () => b, everyMinutes: () => b, everyWeeks: () => b, onWeekDay: () => b, nearMinute: () => b, atHour: () => b, create: () => triggers.push(fn) }; return b; }, getProjectTriggers: () => [] },
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
check('every form starts with the same Elimu+ header', made.every((f) => /^ELIMU\+  \|  Start\. Start small\. Start to finish\./.test(f.description)), made.map((f) => f.description).join(' / ').slice(0, 200));
check('a submit trigger is installed for every form', triggers.filter((t) => t === 'onFormSubmit').length === 4);

// a trainee submits
const ids = JSON.parse(store.FORM_IDS);
const cohort = lists.cohorts.find((c) => /Bandari/.test(c.label)).label;
const ir = (title, resp) => ({ getItem: () => ({ getTitle: () => title }), getResponse: () => resp });
ctx.__e = { source: forms[ids['0']], response: { getId: () => 'gform-resp-77', getItemResponses: () => [
  ir('Send this report to', lists.leaders[0]?.label ?? 'x'), ir('Your full name', 'Wanjiku Mutua'), ir('Your phone number (the one you sign in to Elimu+ with)', '0700 000 205'),
  ir('Which cohort is this about', cohort), ir('This report is about', 'The training'),
  ir('Training day number', '4'), ir('Participants present', '31'),
  ir('What surprised you today, good or bad?', 'A parent offered the hall for free'),
  ir('Overall concern', 'Keep an eye on it'), ir('If there is a concern, what happened? If you need help tomorrow, say what.', 'Power went off twice'),
] } };
vm.runInContext('onFormSubmit(__e)', ctx);
check('the script posts a payload with level, respondent and answers', lastPayload && lastPayload.level === 0 && lastPayload.respondent_name === 'Wanjiku Mutua' && lastPayload.answers['Training day number'] === '4', JSON.stringify(lastPayload));
check('the chosen leader is emailed the report', lists.leaders.length === 0 || (mails.length === 1 && /Wanjiku/.test(mails[0].subject)), JSON.stringify(mails));

const reportPayload = lastPayload;
// ---- the baseline, learning, exit and youth follow-up forms
const before = Object.keys(forms).length;
vm.runInContext('createAllInstruments()', ctx);
check('four more forms are created for the baseline, learning check, exit and youth follow-up', Object.keys(forms).length - before === 4, Object.keys(forms).length - before);
const ids2 = JSON.parse(store.FORM_IDS);
check('their ids are remembered', ['baseline', 'learning', 'exit', 'youth_followup'].every((k) => ids2[k]), JSON.stringify(ids2));
check('the baseline asks which group the participant is in', forms[ids2.baseline].items.some((i) => i.title === 'Which group is this participant in?'));
check('the learning check does not ask for an officer', !forms[ids2.learning].items.some((i) => i.title === 'Your full name'));
const ir2 = (title, resp) => ({ getItem: () => ({ getTitle: () => title }), getResponse: () => resp });
ctx.__b = { source: forms[ids2.learning], response: { getId: () => 'gform-learn-1', getItemResponses: () => [
  ir2('Participant name', 'Zawadi Demo'), ir2('Participant phone number', '0700 000 301'), ir2('Which cohort is this about', cohort),
  ir2('When is this check being taken?', 'Start of the programme'),
] } };
vm.runInContext('onFormSubmit(__b)', ctx);
check('submitting the learning check posts an instrument payload', lastPayload && lastPayload.kind === 'instrument' && lastPayload.instrument === 'learning', JSON.stringify(lastPayload));

// and the real webhook understands it
const r = await fetch(base + '/api/forms/report', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forms-secret': SECRET }, body: JSON.stringify(reportPayload) });
const j = await r.json();
check('the portal accepts it and matches the person and the cohort', r.status === 200 && j.ok && j.matchedPerson && j.matchedCohort, JSON.stringify(j));
// ---- the hourly report of form links
vm.runInContext('publishFormLinks()', ctx);
check('the script reports every form with its links and response count', lastPayload && lastPayload.kind === 'links' && lastPayload.forms.length >= 8 && lastPayload.forms.every((f) => /^https:\/\/docs\.google\.com\/spreadsheets/.test(f.sheet_url) && f.google_responses === 1), JSON.stringify(lastPayload).slice(0, 300));
const rl = await (await fetch(base + '/api/forms/links', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forms-secret': SECRET }, body: JSON.stringify(lastPayload) })).json();
check('the portal saves them', rl.ok && rl.saved === lastPayload.forms.length, JSON.stringify(rl));
const rb = await fetch(base + '/api/forms/links', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forms-secret': 'wrong' }, body: '{}' });
check('a wrong secret is refused', rb.status === 401, rb.status);
// ---- the simplified forms: old ones are closed and renamed OLD, new ones are built with the header
const olds = Object.values(forms).filter((f) => ['baseline', 'exit', 'youth_followup'].some((k) => f.id === ids2[k]));
vm.runInContext('createFollowUpForm()', ctx);
const fuForm = forms[JSON.parse(store.FORM_IDS).followup];
check('the follow-up form has the header and short pages', /^ELIMU\+/.test(fuForm.description) && fuForm.items.filter((i) => i.type === 'PAGE').length === 3 * 3 + 0 || fuForm.items.filter((i) => i.type === 'PAGE').length >= 8, fuForm.items.filter((i) => i.type === 'PAGE').length);
vm.runInContext('createSimplifiedForms()', ctx);
const ids3 = JSON.parse(store.FORM_IDS);
check('the simplified run closes the old forms and renames them OLD', olds.every((f) => /^OLD /.test(f.title) && f.accepting === false), olds.map((f) => f.title).join(', '));
check('and builds fresh ones under the same keys', ['0', '1', '2', '3', 'followup', 'baseline', 'exit', 'youth_followup'].every((k) => ids3[k] && !olds.some((f) => f.id === ids3[k])), JSON.stringify(ids3));
console.log(bad ? `\n${bad} FAILED` : '\nall ok'); process.exit(bad ? 1 : 0);
