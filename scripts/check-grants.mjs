// Supabase stops granting Data API access to new public tables on 30 Oct 2026. Every table a migration creates must be granted to
// `authenticated` in a migration too, or a fresh project, preview branch or `supabase db reset` would hit "permission denied".
// Run: node scripts/check-grants.mjs
import { readdirSync, readFileSync } from 'node:fs';
const dir = new URL('../supabase/migrations/', import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
const sql = files.map((f) => readFileSync(new URL(f, dir), 'utf8').replace(/--.*$/gm, '')).join('\n');
const created = [...sql.matchAll(/create\s+(?:table|view)\s+(?:if\s+not\s+exists\s+)?public\.([a-z_0-9]+)/gi)].map((m) => m[1].toLowerCase());
const granted = new Set();
for (const m of sql.matchAll(/grant\s+[a-z, ]+?\s+on\s+([\s\S]+?)\s+to\s+authenticated/gi))
  for (const t of m[1].matchAll(/public\.([a-z_0-9]+)/gi)) granted.add(t[1].toLowerCase());
// A sequence used as a column default must be usable by `authenticated` too, or inserts made as a signed-in person fail with "permission denied for sequence".
const seqs = [...sql.matchAll(/nextval\(\s*'(?:public\.)?([a-z_0-9]+)'/gi)].map((m) => m[1].toLowerCase());
const seqGranted = new Set([...sql.matchAll(/grant\s+[a-z, ]+?\s+on\s+sequence\s+(?:public\.)?([a-z_0-9]+)\s+to\s+authenticated/gi)].map((m) => m[1].toLowerCase()));
const seqMissing = [...new Set(seqs)].filter((x) => !seqGranted.has(x));
if (seqMissing.length) { console.log('Sequences used as defaults without a grant to authenticated:\n  ' + seqMissing.join('\n  ')); process.exit(1); }
const missing = [...new Set(created)].filter((t) => !granted.has(t));
if (missing.length) { console.log('Created without a grant to authenticated:\n  ' + missing.join('\n  ')); process.exit(1); }
console.log(`ok: all ${new Set(created).size} tables and views created by migrations are granted to authenticated`);
