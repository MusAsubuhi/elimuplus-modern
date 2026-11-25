#!/usr/bin/env node
// Pulls the headline totals from the portal and writes them into site-facts.json, then fills the pages.
//   node sync-facts.js          update site-facts.json (people_total, cohorts_word, ke358_cohorts_word) and run build-facts.js
// If the portal cannot be reached, or sends something odd, nothing changes and the script exits 0.
// Follow-up results (res_*), forum dates and partner names stay hand-edited in site-facts.json until the portal records them.
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const FILE = path.join(__dirname, 'site-facts.json');
const URL_ = 'https://portal.elimuplus.com/api/website/totals';
const WORDS = ['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen','twenty'];
const ok = (n) => Number.isInteger(n) && n >= 0 && n <= 20;
(async () => {
  let t;
  try { const r = await fetch(URL_, { headers: { Accept: 'application/json' } }); t = r.ok ? await r.json() : null; } catch { t = null; }
  const facts = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  if (!t || !Number.isInteger(t.people) || !ok(t.cohorts) || !ok(t.ke358_cohorts) || t.people < Number(facts.people_total)) {
    console.log('Portal totals unavailable or lower than the site; leaving site-facts.json as it is.'); return;
  }
  const next = { ...facts, people_total: String(t.people), cohorts_word: WORDS[t.cohorts], ke358_cohorts_word: WORDS[t.ke358_cohorts] };
  if (JSON.stringify(next) === JSON.stringify(facts)) { console.log('Totals already match the portal.'); return; }
  next._updated = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(FILE, JSON.stringify(next, null, 2) + '\n');
  console.log(`Updated from portal: ${t.people} people, ${t.cohorts} cohorts, ${t.ke358_cohorts} at KE358.`);
  execFileSync('node', [path.join(__dirname, 'build-facts.js')], { stdio: 'inherit' });
})();
