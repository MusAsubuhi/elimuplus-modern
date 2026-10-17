// Generates the Google Apps Script that creates one Google Form per facilitator level.
// The questions come from src/lib/report-templates.json, the same file the portal uses, so the two never drift apart.
// Usage: FORMS_WEBHOOK_SECRET=... PORTAL_URL=https://elimuplus.com node scripts/build-forms-script.mjs [outfile]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const tpl = JSON.parse(readFileSync(new URL('../src/lib/report-templates.json', import.meta.url), 'utf8'));
const out = process.argv[2] || 'forms-kit/ElimuPlusForms.gs';
const secret = process.env.FORMS_WEBHOOK_SECRET || 'PASTE_THE_SECRET_HERE';
const portal = process.env.PORTAL_URL || 'https://elimuplus.com';
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

const ROUTE_Q = 'Send this report to';
const NAME_Q = 'Your full name';
const PHONE_Q = 'Your phone number (the one you sign in to Elimu+ with)';
const COHORT_Q = 'Which cohort is this about';
const PHASE_Q = 'This report is about';

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
}

function installTimers_() {
  const have = ScriptApp.getProjectTriggers().map(function (t) { return t.getHandlerFunction(); });
  if (have.indexOf('refreshChoices') < 0) ScriptApp.newTrigger('refreshChoices').timeBased().everyDays(1).atHour(5).create();
  if (have.indexOf('retryFailed') < 0) ScriptApp.newTrigger('retryFailed').timeBased().everyHours(1).create();
}

/* ---------- a report is submitted ---------- */
function onFormSubmit(e) {
  const form = e.source;
  const level = levelOf_(form.getId());
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

function levelOf_(formId) {
  const ids = JSON.parse(PropertiesService.getScriptProperties().getProperty('FORM_IDS') || '{}');
  return Object.keys(ids).filter(function (k) { return ids[k] === formId; })[0];
}
function concernLabel_(t) { return t.fields.filter(function (f) { return f.key === 'concern'; })[0].label; }

function post_(payload) {
  try {
    const r = UrlFetchApp.fetch(PORTAL_URL + '/api/forms/report', { method: 'post', contentType: 'application/json', headers: { 'x-forms-secret': WEBHOOK_SECRET }, payload: JSON.stringify(payload), muteHttpExceptions: true });
    return r.getResponseCode() === 200;
  } catch (e) { Logger.log('Post failed: ' + e); return false; }
}

/** Reports that could not reach the portal (it was down, or not live yet) are tried again every hour. */
function retryFailed() {
  const props = PropertiesService.getScriptProperties();
  const all = props.getProperties();
  Object.keys(all).filter(function (k) { return k.indexOf('F_') === 0; }).forEach(function (k) {
    if (post_(JSON.parse(all[k]))) props.deleteProperty(k);
  });
}
`;
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, code);
console.log(`wrote ${out} (${code.length} bytes), secret ${secret === 'PASTE_THE_SECRET_HERE' ? 'placeholder' : 'embedded'}`);
