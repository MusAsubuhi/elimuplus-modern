// Generates the Google Apps Script that creates one Google Form per facilitator level.
// The questions come from src/lib/report-templates.json, the same file the portal uses, so the two never drift apart.
// Usage: FORMS_WEBHOOK_SECRET=... PORTAL_URL=https://portal.elimuplus.com node scripts/build-forms-script.mjs [outfile]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const tpl = JSON.parse(readFileSync(new URL('../src/lib/report-templates.json', import.meta.url), 'utf8'));
const fu = JSON.parse(readFileSync(new URL('../src/lib/followup-template.json', import.meta.url), 'utf8'));
const ins = JSON.parse(readFileSync(new URL('../src/lib/instruments.json', import.meta.url), 'utf8'));
const out = process.argv[2] || 'forms-kit/ElimuPlusForms.gs';
const secret = process.env.FORMS_WEBHOOK_SECRET || 'PASTE_THE_SECRET_HERE';
const portal = process.env.PORTAL_URL || 'https://portal.elimuplus.com';
const phases = [['training', 'The training'], ['followup_30', '30-day follow-up'], ['followup_60', '60-day follow-up'], ['followup_90', '90-day follow-up'], ['other', 'Something else']];

const code = `/**
 * Elimu+ day report forms.
 * Creates one Google Form per facilitator level (Trainee, Associate, Certified, Master), sends each report to the leader the
 * writer chooses, and posts it to the Elimu+ portal so founders see it and supervisors can mark it seen.
 *
 * HOW TO USE (once):
 *  1. Go to script.google.com, create a New project, paste this whole file, and save.
 *  2. Choose the function  createAllForms  and press Run. Approve the permissions when Google asks.
 *  3. Open  View > Logs  to see the four form links. Share the right link with each level.
 *  Later: the function  refreshChoices  keeps the cohort and leader lists current (a daily timer is set up for you).
 */
const PORTAL_URL = ${JSON.stringify(portal)};
const WEBHOOK_SECRET = ${JSON.stringify(secret)};
const TEMPLATES = ${JSON.stringify(tpl.levels)};
const PHASES = ${JSON.stringify(phases)};
const FOLLOWUP = ${JSON.stringify(fu)};
const INSTRUMENTS = ${JSON.stringify(ins.instruments)};

const ROUTE_Q = 'Send this report to';
const NAME_Q = 'Your full name';
const PHONE_Q = 'Your phone number (the one you sign in to Elimu+ with)';
const COHORT_Q = 'Which cohort is this about';
const PHASE_Q = 'This report is about';
const P_NAME_Q = 'Participant name';
const P_PHONE_Q = 'Participant phone number';
const STAGE_Q = 'Which follow-up visit is this?';

function createAllForms() {
  const props = PropertiesService.getScriptProperties();
  const ids = JSON.parse(props.getProperty('FORM_IDS') || '{}');
  const lists = fetchLists_();
  const links = [];
  Object.keys(TEMPLATES).forEach(function (level) {
    if (ids[level]) { links.push(TEMPLATES[level].short + ': already created ' + FormApp.openById(ids[level]).getPublishedUrl()); return; }
    const t = TEMPLATES[level];
    const form = FormApp.create('Elimu+ Day Report: ' + t.name);
    form.setDescription(t.depth + '\\n\\nGoes to: ' + t.goes_to + '\\nTake five minutes. Say what you actually saw.');
    form.setCollectEmail(false).setProgressBar(true).setAllowResponseEdits(false).setShowLinkToRespondAgain(true);
    form.setConfirmationMessage('Thank you. Your report has been sent.');

    form.addListItem().setTitle(ROUTE_Q).setHelpText('The person who should read this first.').setChoiceValues(routeLabels_(lists)).setRequired(true);
    form.addTextItem().setTitle(NAME_Q).setRequired(true);
    form.addTextItem().setTitle(PHONE_Q).setRequired(true);
    form.addListItem().setTitle(COHORT_Q).setChoiceValues(cohortLabels_(lists)).setRequired(true);
    form.addListItem().setTitle(PHASE_Q).setChoiceValues(PHASES.map(function (p) { return p[1]; })).setRequired(true);

    t.fields.forEach(function (f) { addQuestion_(form, f); });

    const sheet = SpreadsheetApp.create('Elimu+ Day Reports: ' + t.name + ' (responses)');
    form.setDestination(FormApp.DestinationType.SPREADSHEET, sheet.getId());
    ScriptApp.newTrigger('onFormSubmit').forForm(form).onFormSubmit().create();
    ids[level] = form.getId();
    links.push(t.short + ': ' + form.getPublishedUrl() + '   (edit: ' + form.getEditUrl() + ')   responses: ' + sheet.getUrl());
  });
  props.setProperty('FORM_IDS', JSON.stringify(ids));
  installTimers_();
  Logger.log('FORMS READY\\n' + links.join('\\n'));
  MailApp.sendEmail(Session.getEffectiveUser().getEmail(), 'Elimu+ report forms are ready', links.join('\\n\\n'));
}

function addQuestion_(form, f) {
  var item;
  if (f.type === 'longtext') item = form.addParagraphTextItem();
  else if (f.type === 'number') {
    item = form.addTextItem();
    item.setValidation(FormApp.createTextValidation().requireNumber().build());
  }
  else if (f.type === 'choice') item = form.addMultipleChoiceItem().setChoiceValues(f.options);
  else if (f.type === 'checkbox') item = form.addCheckboxItem().setChoiceValues(f.options);
  else if (f.type === 'date') item = form.addDateItem();
  else if (f.type === 'scale') {
    item = form.addScaleItem().setBounds(f.min || 1, f.max || 5);
    if (f.minLabel || f.maxLabel) item.setLabels(f.minLabel || '', f.maxLabel || '');
  }
  else item = form.addTextItem();
  item.setTitle(f.label).setRequired(!!f.required);
  if (f.help) item.setHelpText(f.help);
}

/* ---------- lists from the portal ---------- */
function fetchLists_() {
  try {
    const r = UrlFetchApp.fetch(PORTAL_URL + '/api/forms/cohorts', { headers: { 'x-forms-secret': WEBHOOK_SECRET }, muteHttpExceptions: true });
    if (r.getResponseCode() === 200) {
      const j = JSON.parse(r.getContentText());
      PropertiesService.getScriptProperties().setProperty('LISTS', JSON.stringify(j));
      return j;
    }
  } catch (e) { Logger.log('Could not reach the portal: ' + e); }
  return JSON.parse(PropertiesService.getScriptProperties().getProperty('LISTS') || '{"cohorts":[],"leaders":[]}');
}
function cohortLabels_(l) { return l.cohorts.length ? l.cohorts.map(function (c) { return c.label; }).concat(['Not listed here (say which in the report)']) : ['Not listed here (say which in the report)']; }
function routeLabels_(l) { return l.leaders.length ? l.leaders.map(function (x) { return x.label; }) : ['Elimu+ founders']; }

function refreshChoices() {
  const lists = fetchLists_();
  const ids = JSON.parse(PropertiesService.getScriptProperties().getProperty('FORM_IDS') || '{}');
  Object.keys(ids).forEach(function (level) {
    const form = FormApp.openById(ids[level]);
    form.getItems(FormApp.ItemType.LIST).forEach(function (it) {
      const li = it.asListItem();
      if (li.getTitle() === COHORT_Q) li.setChoiceValues(cohortLabels_(lists));
      if (li.getTitle() === ROUTE_Q) li.setChoiceValues(routeLabels_(lists));
    });
  });
  refreshRosters();
  try { publishFormLinks(); } catch (err) { Logger.log('Could not report form links: ' + err); }
}

function installTimers_() {
  const have = ScriptApp.getProjectTriggers().map(function (t) { return t.getHandlerFunction(); });
  if (have.indexOf('refreshChoices') < 0) ScriptApp.newTrigger('refreshChoices').timeBased().everyDays(1).atHour(5).create();
  if (have.indexOf('pollCohortForms') < 0) ScriptApp.newTrigger('pollCohortForms').timeBased().everyMinutes(5).create();
  if (have.indexOf('retryFailed') < 0) ScriptApp.newTrigger('retryFailed').timeBased().everyHours(1).create();
}

/* ---------- a report is submitted ---------- */
function onFormSubmit(e) {
  const form = e.source;
  const level = levelOf_(form.getId());
  if (level === 'followup') return onFollowUpSubmit_(e);
  if (INSTRUMENTS[level]) return onInstrumentSubmit_(e, level);
  if (level === 'register') return onRegisterSubmit_(e);
  const t = TEMPLATES[level];
  const answers = {};
  var routeLabel = '', name = '', phone = '', cohort = '', phaseLabel = '';
  e.response.getItemResponses().forEach(function (ir) {
    const title = ir.getItem().getTitle();
    const v = Array.isArray(ir.getResponse()) ? ir.getResponse().join(', ') : String(ir.getResponse());
    if (title === ROUTE_Q) routeLabel = v;
    else if (title === NAME_Q) name = v;
    else if (title === PHONE_Q) phone = v;
    else if (title === COHORT_Q) cohort = v;
    else if (title === PHASE_Q) phaseLabel = v;
    else answers[title] = v;
  });
  const lists = JSON.parse(PropertiesService.getScriptProperties().getProperty('LISTS') || '{"leaders":[]}');
  const leader = lists.leaders.filter(function (x) { return x.label === routeLabel; })[0];
  const phase = (PHASES.filter(function (p) { return p[1] === phaseLabel; })[0] || ['training'])[0];
  const payload = { level: Number(level), response_id: e.response.getId(), respondent_name: name, respondent_phone: phone, cohort: cohort,
    routed_email: leader ? leader.email : '', phase: phase, answers: answers };

  if (!post_(payload)) {
    PropertiesService.getScriptProperties().setProperty('F_' + payload.response_id, JSON.stringify(payload).slice(0, 8500));
  }
  if (leader && leader.email) {
    const concern = String(answers[concernLabel_(t)] || '');
    const urgent = /^Urgent/i.test(concern);
    MailApp.sendEmail({
      to: leader.email,
      subject: (urgent ? 'URGENT: ' : '') + 'Elimu+ ' + t.short + ' report from ' + name + (cohort ? ' (' + cohort.replace(/ \\[.*\\]$/, '') + ')' : ''),
      body: [name + ' (' + t.name + ', ' + phone + ') sent a report about ' + phaseLabel + '.', 'Cohort: ' + cohort, '']
        .concat(Object.keys(answers).map(function (k) { return k + '\\n   ' + answers[k]; })).join('\\n')
        + '\\n\\nOpen it in the portal to mark it seen: ' + PORTAL_URL + '/portal/reports?show=queue'
    });
  }
}

/* ---------- Day 30, 60 and 90 follow-up visits: one form, the stage is chosen first ---------- */
function createFollowUpForm() {
  const props = PropertiesService.getScriptProperties();
  const ids = JSON.parse(props.getProperty('FORM_IDS') || '{}');
  if (ids.followup) { Logger.log('Follow-up form already created: ' + FormApp.openById(ids.followup).getPublishedUrl()); return; }
  const lists = fetchLists_();
  const form = FormApp.create('Elimu+ Follow-up Visit: Day 30, 60 and 90');
  form.setDescription('Complete this at the business. Part A is the same at every visit so progress can be compared; Part B changes by stage; Part C closes the visit. Start with her story and her stock, and ask about money last.\\n\\nTell her that her answers will not reduce her support and may increase it.');
  form.setCollectEmail(false).setProgressBar(true).setAllowResponseEdits(false).setShowLinkToRespondAgain(true);
  form.setConfirmationMessage('Thank you. The visit has been recorded.');

  form.addListItem().setTitle(ROUTE_Q).setHelpText('The person who should read this first.').setChoiceValues(routeLabels_(lists)).setRequired(true);
  form.addTextItem().setTitle(NAME_Q).setHelpText('The officer doing the visit.').setRequired(true);
  form.addTextItem().setTitle(PHONE_Q).setRequired(true);
  form.addListItem().setTitle(COHORT_Q).setChoiceValues(cohortLabels_(lists)).setRequired(true);
  form.addTextItem().setTitle(P_NAME_Q).setRequired(true);
  form.addTextItem().setTitle(P_PHONE_Q).setHelpText('The number she is registered with in Elimu+, so the visit links to her record.').setRequired(true);
  FOLLOWUP.identity.forEach(function (f) { addQuestion_(form, f); });
  const stageItem = form.addMultipleChoiceItem().setTitle(STAGE_Q).setRequired(true);

  const firstPage = {};
  ['30', '60', '90'].forEach(function (k) {
    const st = FOLLOWUP.stages[k];
    var last;
    [['A', 'Part A: every visit', st.a, 'Same questions at 30, 60 and 90 days, so progress can be compared.'],
     ['B', 'Part B: ' + st.name + ' only, ' + st.title, st.b, st.question],
     ['C', 'Part C: close the visit', st.c, '']].forEach(function (sec) {
      const pb = form.addPageBreakItem().setTitle(st.name + ' follow-up. ' + sec[1]);
      if (sec[3]) pb.setHelpText(sec[3]);
      if (sec[0] === 'A') firstPage[k] = pb;
      last = pb;
      sec[2].forEach(function (f) { addQuestion_(form, f); });
    });
    last.setGoToPage(FormApp.PageNavigationType.SUBMIT);
  });
  stageItem.setChoices(['30', '60', '90'].map(function (k) { return stageItem.createChoice('Day ' + k, firstPage[k]); }));

  const sheet = SpreadsheetApp.create('Elimu+ Follow-up Visits (responses)');
  form.setDestination(FormApp.DestinationType.SPREADSHEET, sheet.getId());
  ScriptApp.newTrigger('onFormSubmit').forForm(form).onFormSubmit().create();
  ids.followup = form.getId();
  props.setProperty('FORM_IDS', JSON.stringify(ids));
  installTimers_();
  const msg = 'FOLLOW-UP FORM READY\\n' + form.getPublishedUrl() + '\\n(edit: ' + form.getEditUrl() + ')\\nresponses: ' + sheet.getUrl();
  Logger.log(msg);
  MailApp.sendEmail(Session.getEffectiveUser().getEmail(), 'Elimu+ follow-up form is ready', msg);
}

function onFollowUpSubmit_(e) {
  const answers = {};
  var routeLabel = '', officer = '', ophone = '', cohort = '', pname = '', pphone = '', stageLabel = '';
  e.response.getItemResponses().forEach(function (ir) {
    const title = ir.getItem().getTitle();
    const v = Array.isArray(ir.getResponse()) ? ir.getResponse().join(', ') : String(ir.getResponse());
    if (title === ROUTE_Q) routeLabel = v;
    else if (title === NAME_Q) officer = v;
    else if (title === PHONE_Q) ophone = v;
    else if (title === COHORT_Q) cohort = v;
    else if (title === P_NAME_Q) pname = v;
    else if (title === P_PHONE_Q) pphone = v;
    else if (title === STAGE_Q) stageLabel = v;
    else answers[title] = v;
  });
  const stage = Number((/\\d+/.exec(stageLabel) || ['0'])[0]);
  const lists = JSON.parse(PropertiesService.getScriptProperties().getProperty('LISTS') || '{"leaders":[]}');
  const leader = lists.leaders.filter(function (x) { return x.label === routeLabel; })[0];
  const payload = { kind: 'followup', stage: stage, response_id: e.response.getId(), officer_name: officer, officer_phone: ophone,
    participant_name: pname, participant_phone: pphone, cohort: cohort, routed_email: leader ? leader.email : '', answers: answers };
  if (!post_(payload)) PropertiesService.getScriptProperties().setProperty('F_' + payload.response_id, JSON.stringify(payload).slice(0, 8500));

  if (leader && leader.email) {
    const st = FOLLOWUP.stages[String(stage)];
    const label = function (key) { const f = st.a.concat(st.b, st.c).filter(function (x) { return x.key === key; })[0]; return f ? answers[f.label] : ''; };
    const urgent = label('c_urgent') === 'Yes';
    MailApp.sendEmail({
      to: leader.email,
      subject: (urgent ? 'URGENT: ' : '') + 'Elimu+ Day ' + stage + ' follow-up: ' + pname + (label('c_status') ? ' (' + label('c_status') + ')' : ''),
      body: [officer + ' (' + ophone + ') visited ' + pname + ' for the Day ' + stage + ' follow-up.', 'Cohort: ' + cohort,
        'Business is: ' + (label('c_status') || 'not stated'), 'Biggest challenge: ' + (label('a7_words') || 'not stated'), 'Support to give: ' + (label('c_support') || 'not stated'), '',
        'Everything she and the officer answered is in the portal under the cohort: ' + PORTAL_URL + '/portal/cohorts'].join('\\n')
    });
  }
}

/* ---------- Day 0 baseline, learning check, exit feedback and youth follow-up ---------- */
/** Creates one form from the definition in INSTRUMENTS: who it is about, the questions, and (when there is a branch) the pages each choice leads to. */
function createInstrumentForm_(key) {
  const props = PropertiesService.getScriptProperties();
  const ids = JSON.parse(props.getProperty('FORM_IDS') || '{}');
  const inst = INSTRUMENTS[key];
  if (ids[key]) { Logger.log(inst.title + ' already created: ' + FormApp.openById(ids[key]).getPublishedUrl()); return ''; }
  const lists = fetchLists_();
  const form = FormApp.create(inst.title);
  form.setDescription(inst.description);
  form.setCollectEmail(false).setProgressBar(true).setAllowResponseEdits(false).setShowLinkToRespondAgain(true);
  form.setConfirmationMessage('Thank you. Your answers have been recorded.');
  if (!inst.self) {
    form.addTextItem().setTitle(NAME_Q).setHelpText('The officer or facilitator filling this in.').setRequired(true);
    form.addTextItem().setTitle(PHONE_Q).setRequired(true);
  }
  form.addListItem().setTitle(COHORT_Q).setChoiceValues(cohortLabels_(lists)).setRequired(true);
  form.addTextItem().setTitle(P_NAME_Q).setHelpText(inst.self ? 'Your full name.' : 'Full name, as registered.').setRequired(true);
  form.addTextItem().setTitle(P_PHONE_Q).setHelpText('The number registered in Elimu+, so this links to the right record.').setRequired(true);
  inst.common.forEach(function (f) { addQuestion_(form, f); });
  if (inst.branch) {
    const choice = form.addMultipleChoiceItem().setTitle(inst.branch.label).setRequired(true);
    const firstPage = {};
    inst.branch.options.forEach(function (opt) {
      var last;
      opt.sections.forEach(function (sec, i) {
        const pb = form.addPageBreakItem().setTitle(sec.title);
        if (sec.help) pb.setHelpText(sec.help);
        if (i === 0) firstPage[opt.value] = pb;
        last = pb;
        sec.fields.forEach(function (f) { addQuestion_(form, f); });
      });
      last.setGoToPage(FormApp.PageNavigationType.SUBMIT);
    });
    choice.setChoices(inst.branch.options.map(function (opt) { return choice.createChoice(opt.label, firstPage[opt.value]); }));
  }
  const sheet = SpreadsheetApp.create(inst.title + ' (responses)');
  form.setDestination(FormApp.DestinationType.SPREADSHEET, sheet.getId());
  ScriptApp.newTrigger('onFormSubmit').forForm(form).onFormSubmit().create();
  ids[key] = form.getId();
  props.setProperty('FORM_IDS', JSON.stringify(ids));
  installTimers_();
  const msg = inst.title.toUpperCase() + ' READY\\n' + form.getPublishedUrl() + '\\n(edit: ' + form.getEditUrl() + ')\\nresponses: ' + sheet.getUrl();
  Logger.log(msg);
  return msg;
}

/** Run once: creates the Day 0 baseline, learning check, exit feedback and youth follow-up forms and emails the links. */
function createAllInstruments() {
  const made = Object.keys(INSTRUMENTS).map(createInstrumentForm_).filter(function (m) { return m; });
  if (made.length) MailApp.sendEmail(Session.getEffectiveUser().getEmail(), 'Elimu+ baseline, learning, exit and youth forms are ready', made.join('\\n\\n'));
}
function createBaselineForm() { createInstrumentForm_('baseline'); }
function createLearningForm() { createInstrumentForm_('learning'); }
function createExitForm() { createInstrumentForm_('exit'); }
function createYouthFollowUpForm() { createInstrumentForm_('youth_followup'); }

/** The adult follow-up gained questions (sold in 14 days, break-even, records and more). Run this once to replace the old form with the new one; old responses stay in the portal. */
function recreateFollowUpForm() {
  const props = PropertiesService.getScriptProperties();
  const ids = JSON.parse(props.getProperty('FORM_IDS') || '{}');
  if (ids.followup) {
    const oldId = ids.followup;
    const old = FormApp.openById(oldId);
    old.setTitle('OLD ' + old.getTitle()).setAcceptingResponses(false);
    ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getTriggerSourceId && t.getTriggerSourceId() === oldId) ScriptApp.deleteTrigger(t); });
    delete ids.followup;
    props.setProperty('FORM_IDS', JSON.stringify(ids));
  }
  createFollowUpForm();
}

/** The learning-check questions were changed. Run this once to close the old learning form and build the new one; past answers stay in the portal. */
function recreateLearningForm() {
  const props = PropertiesService.getScriptProperties();
  const ids = JSON.parse(props.getProperty('FORM_IDS') || '{}');
  if (ids.learning) {
    const oldId = ids.learning;
    const old = FormApp.openById(oldId);
    old.setTitle('OLD ' + old.getTitle()).setAcceptingResponses(false);
    ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getTriggerSourceId && t.getTriggerSourceId() === oldId) ScriptApp.deleteTrigger(t); });
    delete ids.learning;
    props.setProperty('FORM_IDS', JSON.stringify(ids));
  }
  createInstrumentForm_('learning');
}

/** One submitted baseline, learning check, exit form or youth visit goes to the portal as: the instrument, the chosen branch, and the answers by question text. */
function onInstrumentSubmit_(e, key) {
  const inst = INSTRUMENTS[key];
  const answers = {};
  var officer = '', ophone = '', cohort = '', pname = '', pphone = '', branch = '';
  e.response.getItemResponses().forEach(function (ir) {
    const title = ir.getItem().getTitle();
    const v = Array.isArray(ir.getResponse()) ? ir.getResponse().join(', ') : String(ir.getResponse());
    if (title === NAME_Q) officer = v;
    else if (title === PHONE_Q) ophone = v;
    else if (title === COHORT_Q) cohort = v;
    else if (title === P_NAME_Q) pname = v;
    else if (title === P_PHONE_Q) pphone = v;
    else if (inst.branch && title === inst.branch.label) branch = v;
    else answers[title] = v;
  });
  postRoster_({ kind: 'instrument', instrument: key, branch: branch, response_id: e.response.getId(), officer_name: officer, officer_phone: ophone,
    participant_name: pname, participant_phone: pphone, cohort: cohort, answers: answers }, inst.title + ' for ' + pname);
}

/* ---------- cohort roster, attendance and two-observer notes ---------- */
const REG_BUSINESS = ['I already run a business', 'I want to start one', 'Not sure yet'];
const REG_CONSENT = 'The participant agrees that Elimu+ and the partner organisation may hold these details to run the programme and follow up afterwards';
const NOT_LISTED = 'Not listed here (type its name below)';
const TYPED_COHORT_Q = 'If the cohort is not in the list above, type its name';
const EMAIL_Q = 'Participant email (only if they have one)';
const BUS_Q = 'Business status';
const NOTE_Q = 'What is the business, or the idea they want to start?';
const DAY_Q = 'Which day of the programme is this?';
const DATE_Q = 'Date of this session';
const PRESENT_Q = 'Who was present today?';
const EXTRA_Q = 'Did anyone come today who is not on this list?';
const EXTRA_NAMES_Q = 'Name and phone number of each person who was not listed (one person per line)';
const TOPIC_Q = 'What was taught today?';
const WELFARE_Q = 'Any welfare or safety concern about a participant?';
const WELFARE_WHO_Q = 'If yes, who and what did you see?';
const WELFARE_CHOICES = ['No concern', 'Yes, but it can wait', 'Yes, urgent: someone needs help today'];
const OBS_COLS = ['1 Low', '2', '3', '4', '5 High'];
const OBS_GRIDS = [
  ['Engagement (1 = switched off, 5 = fully engaged)', 'Engagement'],
  ['Understanding (1 = lost, 5 = could teach it back)', 'Understanding'],
  ['Participation (1 = silent, 5 = contributed strongly)', 'Participation']
];
const OBS_TEXT = [
  ['How did the group take in the content today? What did they grasp quickly and where did they get stuck?', true],
  ['How was the group as a whole: energy, teamwork, mood, who they listened to?', true],
  ['Who stood out today, and what exactly did you see?', false],
  ['Who seemed to struggle or may need extra support, and why do you think so?', false],
  ['What should the facilitator repeat, change or watch for tomorrow?', false],
  ['Anything else the founders or the partner organisation should know?', false]
];

function J_(k, d) { const v = PropertiesService.getScriptProperties().getProperty(k); return v ? JSON.parse(v) : d; }
function setJ_(k, v) { PropertiesService.getScriptProperties().setProperty(k, JSON.stringify(v)); }
function ownerEmail_() { return Session.getEffectiveUser().getEmail(); }
function slug_(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 24) || 'unnamed'; }
function cohortKey_(label, typed) {
  const m = /\\[([0-9a-f]{8})\\]\\s*$/.exec(String(label || ''));
  return m ? m[1] : 'x' + slug_(typed || label);
}
function cohortTitle_(label) { return String(label).replace(/\\s*\\[[0-9a-f]{8}\\]\\s*$/, ''); }
function lastNine_(p) { return String(p || '').replace(/\\D/g, '').slice(-9); }
function dayOf_(v) { return Number((/\\d+/.exec(String(v)) || ['0'])[0]); }
function dayChoices_() { const a = []; for (var i = 1; i <= 12; i++) a.push('Day ' + i); return a; }
function rosterOf_(key) { return J_('R_' + key, { l: '', p: [] }); }

function addToRoster_(key, label, name, phone) {
  const r = rosterOf_(key);
  r.l = r.l || label;
  const id = lastNine_(phone);
  const hit = r.p.filter(function (x) { return id ? lastNine_(x[1]) === id : String(x[0]).toLowerCase() === String(name).toLowerCase(); })[0];
  if (hit) { if (name) hit[0] = name; if (id) hit[1] = phone; } else r.p.push([name, phone]);
  const text = JSON.stringify(r);
  if (text.length > 8800) throw new Error('This cohort roster is too large for one list. Split it into two cohorts.');
  PropertiesService.getScriptProperties().setProperty('R_' + key, text);
}

/** One entry per person with a label that is unique, so ticks and grid rows map back to a phone number. */
function labelsOf_(key) {
  const seen = {};
  return rosterOf_(key).p.map(function (x) {
    var lab = x[0] + (lastNine_(x[1]) ? ' (ends ' + lastNine_(x[1]).slice(-3) + ')' : '');
    if (seen[lab]) { seen[lab]++; lab += ' #' + seen[lab]; } else seen[lab] = 1;
    return { label: lab, name: x[0], phone: x[1] };
  });
}
function choiceLabels_(key) {
  const a = labelsOf_(key).map(function (x) { return x.label; });
  return a.length ? a : ['(no one is registered yet)'];
}

function createRegistrationForm() {
  const props = PropertiesService.getScriptProperties();
  const ids = J_('FORM_IDS', {});
  if (ids.register) { Logger.log('Registration form already created: ' + FormApp.openById(ids.register).getPublishedUrl()); return; }
  const lists = fetchLists_();
  const form = FormApp.create('Elimu+ Cohort Registration');
  form.setDescription('Fill this once for every participant when a cohort starts. It records who is in the room, how to reach them, and the business they run or want to start. After you submit, choose "Submit another response" for the next person.');
  form.setCollectEmail(false).setProgressBar(false).setAllowResponseEdits(false).setShowLinkToRespondAgain(true);
  form.setConfirmationMessage('Registered. Choose "Submit another response" to add the next participant.');
  form.addListItem().setTitle(COHORT_Q).setChoiceValues(cohortLabels_(lists).slice(0, -1).concat([NOT_LISTED])).setRequired(true);
  form.addTextItem().setTitle(TYPED_COHORT_Q).setHelpText('Leave blank when the cohort is in the list.');
  form.addTextItem().setTitle(NAME_Q).setHelpText('The person entering the registrations.').setRequired(true);
  form.addTextItem().setTitle(PHONE_Q).setRequired(true);
  form.addTextItem().setTitle(P_NAME_Q).setHelpText('Full name as they want it on their certificate.').setRequired(true);
  form.addTextItem().setTitle(P_PHONE_Q).setHelpText('A number that reaches them directly. It becomes their record and follow-up contact.').setRequired(true);
  form.addTextItem().setTitle(EMAIL_Q).setValidation(FormApp.createTextValidation().requireTextIsEmail().build());
  form.addMultipleChoiceItem().setTitle(BUS_Q).setChoiceValues(REG_BUSINESS).setRequired(true);
  form.addParagraphTextItem().setTitle(NOTE_Q).setHelpText('A few words are enough, for example: sells vegetables at the roadside, or wants to open a salon.');
  form.addCheckboxItem().setTitle('Consent').setChoiceValues([REG_CONSENT]).setRequired(true);
  const sheet = SpreadsheetApp.create('Elimu+ Cohort Registration (responses)');
  form.setDestination(FormApp.DestinationType.SPREADSHEET, sheet.getId());
  ScriptApp.newTrigger('onFormSubmit').forForm(form).onFormSubmit().create();
  ids.register = form.getId();
  setJ_('FORM_IDS', ids);
  installTimers_();
  const msg = 'REGISTRATION FORM READY\\n' + form.getPublishedUrl() + '\\n(edit: ' + form.getEditUrl() + ')\\nresponses: ' + sheet.getUrl();
  Logger.log(msg);
  MailApp.sendEmail(ownerEmail_(), 'Elimu+ registration form is ready', msg);
}

function onRegisterSubmit_(e) {
  const a = {};
  e.response.getItemResponses().forEach(function (ir) { a[ir.getItem().getTitle()] = Array.isArray(ir.getResponse()) ? ir.getResponse().join(', ') : String(ir.getResponse()); });
  const listed = a[COHORT_Q] && !/^Not listed/.test(a[COHORT_Q]) ? a[COHORT_Q] : '';
  const typed = String(a[TYPED_COHORT_Q] || '').trim();
  const label = listed || typed || 'Unnamed cohort';
  const key = cohortKey_(listed, typed);
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    addToRoster_(key, label, String(a[P_NAME_Q] || '').trim(), String(a[P_PHONE_Q] || '').trim());
    ensureCohortForms_(key, label);
  } finally { lock.releaseLock(); }
  if (!listed) {
    MailApp.sendEmail(ownerEmail_(), 'Elimu+ registration: cohort not in the portal', String(a[P_NAME_Q]) + ' was registered for "' + label + '", which is not in the portal list. They are on the Google roster and attendance forms, but not in the portal until that cohort is added under Cohorts in the portal.');
    return;
  }
  postRoster_({ kind: 'register', response_id: e.response.getId(), officer_name: a[NAME_Q], officer_phone: a[PHONE_Q], cohort: listed,
    participant_name: a[P_NAME_Q], participant_phone: a[P_PHONE_Q], email: a[EMAIL_Q] || '', business_status: a[BUS_Q] || '', business_note: a[NOTE_Q] || '' },
    'Registration of ' + a[P_NAME_Q]);
}

/** Sends to the portal; a network failure queues the post for the hourly retry, a rejection is reported to the owner. */
function postRoster_(payload, what) {
  const res = postJson_(payload);
  if (!res) { PropertiesService.getScriptProperties().setProperty('F_' + payload.response_id, JSON.stringify(payload).slice(0, 8500)); return; }
  if (res.ok === false) MailApp.sendEmail(ownerEmail_(), 'Elimu+ could not save to the portal: ' + what, String(res.rejected || 'Unknown reason') + '\\n\\nThe Google form response itself is safe in its response sheet.');
}

function ensureCohortForms_(key, label) {
  const ids = J_('FORM_IDS', {});
  const made = [];
  if (!ids['att_' + key]) { ids['att_' + key] = makeAttendanceForm_(key, label, made); }
  if (!ids['obs_' + key]) { ids['obs_' + key] = makeObserverForm_(key, label, made); }
  setJ_('FORM_IDS', ids);
  if (made.length) {
    installTimers_();
    MailApp.sendEmail(ownerEmail_(), 'Elimu+ forms ready for ' + cohortTitle_(label), made.join('\\n\\n') + '\\n\\nShare the attendance link with whoever takes the register. Give the observer link to two different observers; each fills it alone.');
  } else refreshRosterForms_(key);
}

function sheetFor_(form, title) {
  const sheet = SpreadsheetApp.create(title);
  form.setDestination(FormApp.DestinationType.SPREADSHEET, sheet.getId());
  return sheet;
}

function makeAttendanceForm_(key, label, made) {
  const form = FormApp.create('Elimu+ Attendance: ' + cohortTitle_(label));
  form.setDescription('Tick everyone who is in the room today. Submit once per session. If someone came who is not on the list, say so on the next page and they will be added to the cohort.');
  form.setCollectEmail(false).setProgressBar(false).setAllowResponseEdits(false).setShowLinkToRespondAgain(false);
  form.setConfirmationMessage('Attendance recorded. Thank you.');
  form.addTextItem().setTitle(NAME_Q).setHelpText('The person taking the register.').setRequired(true);
  form.addTextItem().setTitle(PHONE_Q).setRequired(true);
  form.addListItem().setTitle(DAY_Q).setChoiceValues(dayChoices_()).setRequired(true);
  form.addDateItem().setTitle(DATE_Q).setRequired(true);
  form.addCheckboxItem().setTitle(PRESENT_Q).setChoiceValues(choiceLabels_(key));
  const extra = form.addMultipleChoiceItem().setTitle(EXTRA_Q).setRequired(true);
  const pb = form.addPageBreakItem().setTitle('People who came but were not on the list');
  form.addParagraphTextItem().setTitle(EXTRA_NAMES_Q).setHelpText('Example: Mary Wanjiru 0712345678').setRequired(true);
  extra.setChoices([extra.createChoice('No, everyone who came was listed', FormApp.PageNavigationType.SUBMIT), extra.createChoice('Yes, someone was not listed', pb)]);
  const sheet = sheetFor_(form, 'Elimu+ Attendance: ' + cohortTitle_(label) + ' (responses)');
  made.push('ATTENDANCE: ' + form.getPublishedUrl() + '\\n(edit: ' + form.getEditUrl() + ')\\nresponses: ' + sheet.getUrl());
  return form.getId();
}

function makeObserverForm_(key, label, made) {
  const form = FormApp.create('Elimu+ Observer Notes: ' + cohortTitle_(label));
  form.setDescription('Fill this on your own, straight after the session and before you compare notes with the other observer. Two observers fill the same form separately so that the view is not shaped by one person. Rate what you saw, not what you hoped to see. Leave a participant blank if you did not see enough.');
  form.setCollectEmail(false).setProgressBar(true).setAllowResponseEdits(false).setShowLinkToRespondAgain(false);
  form.setConfirmationMessage('Thank you. Your notes have been recorded.');
  form.addTextItem().setTitle(NAME_Q).setHelpText('You, the observer.').setRequired(true);
  form.addTextItem().setTitle(PHONE_Q).setRequired(true);
  form.addListItem().setTitle(DAY_Q).setChoiceValues(dayChoices_()).setRequired(true);
  form.addTextItem().setTitle(TOPIC_Q).setRequired(true);
  const names = choiceLabels_(key);
  OBS_GRIDS.forEach(function (g) { form.addGridItem().setTitle(g[0]).setRows(names).setColumns(OBS_COLS).setRequired(false); });
  OBS_TEXT.forEach(function (q) { form.addParagraphTextItem().setTitle(q[0]).setRequired(q[1]); });
  form.addMultipleChoiceItem().setTitle(WELFARE_Q).setChoiceValues(WELFARE_CHOICES).setRequired(true);
  form.addParagraphTextItem().setTitle(WELFARE_WHO_Q);
  const sheet = sheetFor_(form, 'Elimu+ Observer Notes: ' + cohortTitle_(label) + ' (responses)');
  made.push('OBSERVER NOTES: ' + form.getPublishedUrl() + '\\n(edit: ' + form.getEditUrl() + ')\\nresponses: ' + sheet.getUrl());
  return form.getId();
}

/** Keeps the tick list and the observer grids in step with the roster. */
function refreshRosterForms_(key) {
  const ids = J_('FORM_IDS', {});
  const names = choiceLabels_(key);
  if (ids['att_' + key]) {
    FormApp.openById(ids['att_' + key]).getItems(FormApp.ItemType.CHECKBOX).forEach(function (it) { if (it.getTitle() === PRESENT_Q) it.asCheckboxItem().setChoiceValues(names); });
  }
  if (ids['obs_' + key]) {
    FormApp.openById(ids['obs_' + key]).getItems(FormApp.ItemType.GRID).forEach(function (it) {
      if (OBS_GRIDS.some(function (g) { return g[0] === it.getTitle(); })) it.asGridItem().setRows(names);
    });
  }
}
function refreshRosters() {
  const ids = J_('FORM_IDS', {});
  const keys = {};
  Object.keys(ids).forEach(function (k) { if (/^(att|obs)_/.test(k)) keys[k.slice(4)] = 1; });
  Object.keys(keys).forEach(refreshRosterForms_);
}

/** Per-cohort forms are read on a timer instead of a trigger each, because a script may only hold twenty triggers. */
function pollCohortForms() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) return;
  try {
    const props = PropertiesService.getScriptProperties();
    const ids = J_('FORM_IDS', {});
    Object.keys(ids).filter(function (k) { return /^(att|obs)_/.test(k); }).forEach(function (k) {
      const form = FormApp.openById(ids[k]);
      const last = props.getProperty('LP_' + k);
      const key = k.slice(4);
      (last ? form.getResponses(new Date(last)) : form.getResponses()).forEach(function (r) {
        try {
          if (k.indexOf('att_') === 0) onAttendanceSubmit_(r, key); else onObserverSubmit_(r, key);
          props.setProperty('LP_' + k, r.getTimestamp().toISOString());
        } catch (err) { Logger.log('Could not process a response on ' + k + ': ' + err); }
      });
    });
  } finally { lock.releaseLock(); }
}

function onAttendanceSubmit_(r, key) {
  const meta = rosterOf_(key);
  const labels = labelsOf_(key);
  const a = {};
  var ticked = [];
  r.getItemResponses().forEach(function (ir) {
    const t = ir.getItem().getTitle();
    if (t === PRESENT_Q) ticked = [].concat(ir.getResponse());
    else a[t] = Array.isArray(ir.getResponse()) ? ir.getResponse().join(', ') : String(ir.getResponse());
  });
  const present = ticked.map(function (l) { return labels.filter(function (x) { return x.label === l; })[0]; })
    .filter(function (x) { return x; }).map(function (x) { return { name: x.name, phone: x.phone }; });
  const day = dayOf_(a[DAY_Q]);
  const newcomers = a[EXTRA_NAMES_Q] || '';
  const hasCohort = /\\[[0-9a-f]{8}\\]\\s*$/.test(meta.l);
  if (hasCohort) {
    postRoster_({ kind: 'attendance', response_id: r.getId(), officer_name: a[NAME_Q], officer_phone: a[PHONE_Q], cohort: meta.l, day: day,
      session_date: a[DATE_Q] || '', present: present, newcomers: newcomers }, 'Attendance for ' + cohortTitle_(meta.l) + ' day ' + day);
  }
  String(newcomers).split(/\\r?\\n/).forEach(function (line) {
    const t = line.trim();
    if (!t) return;
    const ph = (/(\\+?\\d[\\d\\s-]{7,}\\d)/.exec(t) || [''])[0];
    const nm = t.replace(ph, '').replace(/[,;|:()-]+\\s*$/, '').replace(/^[,;|:()-]+/, '').trim();
    if (nm) addToRoster_(key, meta.l, nm, ph);
  });
  const total = rosterOf_(key).p.length;
  setJ_('LAST_' + key, { day: day, date: a[DATE_Q] || '', n: present.length, total: total });
  const ids = J_('FORM_IDS', {});
  if (ids['att_' + key]) {
    FormApp.openById(ids['att_' + key]).setDescription('Tick everyone who is in the room today. Submit once per session. If someone came who is not on the list, say so on the next page and they will be added to the cohort.\\n\\nLast register: Day ' + day + ', ' + present.length + ' of ' + total + ' present.');
  }
  refreshRosterForms_(key);
}

function onObserverSubmit_(r, key) {
  const meta = rosterOf_(key);
  const a = {};
  const grid = {};
  const written = [];
  r.getItemResponses().forEach(function (ir) {
    const it = ir.getItem();
    const t = it.getTitle();
    if (it.getType() === FormApp.ItemType.GRID) {
      const gi = OBS_GRIDS.map(function (g) { return g[0]; }).indexOf(t);
      const rows = it.asGridItem().getRows();
      const vals = ir.getResponse() || [];
      rows.forEach(function (row, i) {
        const n = vals[i] ? Number(String(vals[i]).charAt(0)) : 0;
        if (gi >= 0 && n) { grid[row] = grid[row] || [0, 0, 0]; grid[row][gi] = n; }
      });
    } else {
      const v = Array.isArray(ir.getResponse()) ? ir.getResponse().join(', ') : String(ir.getResponse());
      a[t] = v;
      if (t !== NAME_Q && t !== PHONE_Q && t !== DAY_Q && t !== TOPIC_Q) written.push(t + '\\n   ' + v);
    }
  });
  const day = dayOf_(a[DAY_Q]);
  const who = String(a[NAME_Q] || 'Observer');
  const title = cohortTitle_(meta.l || key);
  MailApp.sendEmail(ownerEmail_(), 'Elimu+ observer notes: ' + title + ', Day ' + day + ' (' + who + ')',
    who + ' (' + a[PHONE_Q] + ') observed Day ' + day + '. Topic: ' + (a[TOPIC_Q] || '') + '\\n\\n' + written.join('\\n\\n') +
    '\\n\\nRatings are in the response sheet. Paste this into Claude to review the session.');
  if (String(a[WELFARE_Q] || '').indexOf('urgent') >= 0) {
    MailApp.sendEmail(ownerEmail_(), 'URGENT welfare concern: ' + title + ', Day ' + day, who + ' flagged an urgent welfare concern.\\n\\n' + (a[WELFARE_WHO_Q] || 'No detail given. Phone the observer: ' + a[PHONE_Q]));
  }
  const k = 'O_' + key + '_' + day;
  const all = J_(k, []).filter(function (x) { return x.o.toLowerCase() !== who.toLowerCase(); });
  all.push({ o: who, m: grid });
  setJ_(k, all);
  if (all.length >= 2) compareObservers_(title, day, all[0], all[all.length - 1]);
}

function compareObservers_(title, day, A, B) {
  const dims = OBS_GRIDS.map(function (g) { return g[1]; });
  var same = 0, close = 0, count = 0;
  const flags = [];
  Object.keys(A.m).forEach(function (name) {
    if (!B.m[name]) return;
    dims.forEach(function (d, i) {
      const x = A.m[name][i], y = B.m[name][i];
      if (!x || !y) return;
      count++;
      const diff = Math.abs(x - y);
      if (diff === 0) same++;
      if (diff <= 1) close++;
      if (diff >= 2) flags.push(name + ': ' + d + ' ' + A.o + ' ' + x + ', ' + B.o + ' ' + y);
    });
  });
  const only = function (p, q) { return Object.keys(p.m).filter(function (n) { return !q.m[n]; }); };
  const body = [A.o + ' and ' + B.o + ' both observed ' + title + ', Day ' + day + '.',
    count ? 'Ratings compared: ' + count + '. Same score: ' + Math.round(100 * same / count) + '%. Within one point: ' + Math.round(100 * close / count) + '%.' : 'No participants were rated by both observers.',
    '', flags.length ? 'Where they differ by two points or more (worth talking about):\\n' + flags.join('\\n') : 'No ratings differ by two points or more.',
    only(A, B).length ? '\\nRated only by ' + A.o + ': ' + only(A, B).join(', ') : '', only(B, A).length ? '\\nRated only by ' + B.o + ': ' + only(B, A).join(', ') : ''].join('\\n');
  MailApp.sendEmail(ownerEmail_(), 'Elimu+ two observers compared: ' + title + ', Day ' + day, body);
}

function allFormLinks() {
  const ids = J_('FORM_IDS', {});
  const out = Object.keys(ids).map(function (k) { return k + ': ' + FormApp.openById(ids[k]).getPublishedUrl(); });
  Logger.log(out.join('\\n'));
  return out.join('\\n');
}

function levelOf_(formId) {
  const ids = JSON.parse(PropertiesService.getScriptProperties().getProperty('FORM_IDS') || '{}');
  return Object.keys(ids).filter(function (k) { return ids[k] === formId; })[0];
}
function concernLabel_(t) { return t.fields.filter(function (f) { return f.key === 'concern'; })[0].label; }

function postJson_(payload) {
  const path = payload.kind === 'links' ? '/api/forms/links' : payload.kind === 'followup' ? '/api/forms/followup' : payload.kind === 'instrument' ? '/api/forms/instrument' : (payload.kind === 'register' || payload.kind === 'attendance') ? '/api/forms/roster' : '/api/forms/report';
  try {
    const r = UrlFetchApp.fetch(PORTAL_URL + path, { method: 'post', contentType: 'application/json', headers: { 'x-forms-secret': WEBHOOK_SECRET }, payload: JSON.stringify(payload), muteHttpExceptions: true });
    if (r.getResponseCode() !== 200) return null;
    try { return JSON.parse(r.getContentText()); } catch (x) { return { ok: true }; }
  } catch (e) { Logger.log('Post failed: ' + e); return null; }
}
function post_(payload) { return !!postJson_(payload); }

/** Reports that could not reach the portal (it was down, or not live yet) are tried again every hour. */
function retryFailed() {
  const props = PropertiesService.getScriptProperties();
  const all = props.getProperties();
  Object.keys(all).filter(function (k) { return k.indexOf('F_') === 0; }).forEach(function (k) {
    try { if (post_(JSON.parse(all[k]))) props.deleteProperty(k); } catch (err) { Logger.log('Skipped an unreadable queued report ' + k + ': ' + err); }
  });
  try { publishFormLinks(); } catch (err) { Logger.log('Could not report form links: ' + err); }
}

/** Tells the portal where every form and its response sheet live and how many responses Google holds, so the portal's Forms and responses page is always current. Runs every hour. */
function publishFormLinks() {
  const ids = J_('FORM_IDS', {});
  const forms = [];
  Object.keys(ids).forEach(function (key) {
    try {
      const form = FormApp.openById(ids[key]);
      const rs = form.getResponses();
      var sheet = '';
      try { sheet = 'https://docs.google.com/spreadsheets/d/' + form.getDestinationId() + '/edit'; } catch (x) { sheet = ''; }
      const kind = key === 'followup' || key === 'youth_followup' ? 'followup' : (key === 'baseline' || key === 'learning' || key === 'exit') ? 'start_end'
        : (key === 'register' || key.indexOf('att_') === 0 || key.indexOf('obs_') === 0) ? 'cohort' : /^[0-9]$/.test(key) ? 'report' : 'other';
      forms.push({ key: key, title: form.getTitle(), kind: kind, fill_url: form.getPublishedUrl(), edit_url: form.getEditUrl(), sheet_url: sheet,
        google_responses: rs.length, last_response_at: rs.length ? rs[rs.length - 1].getTimestamp().toISOString() : null });
    } catch (err) { Logger.log('Could not read form ' + key + ': ' + err); }
  });
  if (forms.length) postJson_({ kind: 'links', forms: forms });
  return forms.length;
}

`;
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, code);
console.log(`wrote ${out} (${code.length} bytes), secret ${secret === 'PASTE_THE_SECRET_HERE' ? 'placeholder' : 'embedded'}`);
