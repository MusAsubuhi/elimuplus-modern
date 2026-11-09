#!/usr/bin/env node
// Fills <!--f:key-->value<!--/f--> markers in the HTML pages from site-facts.json.
//   node build-facts.js            fill markers (writes changed pages)
//   node build-facts.js --check    write nothing; exit 1 if any page disagrees with the facts
// No dependencies.
const fs = require('fs'), path = require('path');
const root = __dirname;
const facts = JSON.parse(fs.readFileSync(path.join(root, 'site-facts.json'), 'utf8'));
const check = process.argv.includes('--check');
const pages = fs.readdirSync(root).filter(f => f.endsWith('.html') && f !== 'google05fe066311fb984b.html')
  .concat(fs.existsSync(path.join(root, 'blog')) ? fs.readdirSync(path.join(root, 'blog')).filter(f => f.endsWith('.html')).map(f => 'blog/' + f) : []);
const RE = /<!--f:([a-z0-9_]+)(?::(cap))?-->([\s\S]*?)<!--\/f-->/g;
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
let problems = [], changed = 0, total = 0, placeholders = 0;
for (const f of pages) {
  const p = path.join(root, f);
  const src = fs.readFileSync(p, 'utf8');
  const out = src.replace(RE, (m, key, mod, cur) => {
    if (!(key in facts)) { problems.push(`${f}: unknown fact key "${key}"`); return m; }
    total++;
    let v = String(facts[key]); if (mod === 'cap') v = cap(v);
    if (cur !== v) problems.push(`${f}: "${key}" shows "${cur}" but facts say "${v}"`);
    return `<!--f:${key}${mod ? ':' + mod : ''}-->${v}<!--/f-->`;
  });
  if (out !== src) { changed++; if (!check) fs.writeFileSync(p, out); }
  // stale phrases and placeholder links
  const bare = src.replace(RE, '');
  for (const ph of facts._stale_phrases || []) if (bare.includes(ph)) problems.push(`${f}: contains stale phrase "${ph}"`);
  placeholders += (src.match(/href="#"/g) || []).length;
}
if (placeholders) console.log(`note: ${placeholders} placeholder link(s) href="#" remain (social links not live yet)`);
console.log(`${total} fact markers across ${pages.length} pages.`);
if (check) {
  if (problems.length) { console.log('DISAGREEMENTS:\n - ' + problems.join('\n - ')); process.exit(1); }
  console.log('All pages agree with site-facts.json.');
} else {
  console.log(changed ? `Updated ${changed} page(s).` : 'No changes needed.');
  const stale = problems.filter(x => x.includes('stale') || x.includes('unknown'));
  if (stale.length) { console.log('WARNINGS:\n - ' + stale.join('\n - ')); process.exit(1); }
}
