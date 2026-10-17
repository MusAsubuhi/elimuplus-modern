// Copies the existing static marketing site (repo root) into ./public so Next serves it unchanged.
// The static site stays the source of truth on this branch; nothing in public/ (except /portal assets) is committed.
import { cpSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const skip = new Set(['node_modules', '.git', '.next', 'public', 'app', 'src', 'scripts', 'supabase', '_to_delete', 'platform', 'out']);
const keepExt = /\.(html|xml|txt|css|js|json|png|jpe?g|webp|svg|ico|pdf|docx|xlsx|pptx|zip)$/i;
const rootSkipFiles = new Set(['package.json', 'package-lock.json', 'vercel.json', 'tsconfig.json', 'next.config.mjs', 'postcss.config.mjs', 'tailwind.config.ts', 'next-env.d.ts', 'build-blog.js', 'build-directory.js']);
mkdirSync('public', { recursive: true });
let n = 0;
function copy(src, dst, top) {
  for (const name of readdirSync(src)) {
    if (top && (skip.has(name) || rootSkipFiles.has(name) || name.startsWith('.'))) continue;
    const s = join(src, name), d = join(dst, name);
    if (statSync(s).isDirectory()) { mkdirSync(d, { recursive: true }); copy(s, d, false); }
    else if (keepExt.test(name)) { cpSync(s, d); n++; }
  }
}
// Only when the static site is present (the repo root has index.html next to this app).
if (existsSync('index.html')) { copy('.', 'public', true); console.log(`sync-static: copied ${n} files into public/`); }
else console.log('sync-static: no index.html at repo root; skipping (portal-only checkout)');
