import { existsSync, readdirSync } from 'node:fs';

// Pretty URLs for the static marketing site: /about -> /about.html (what vercel cleanUrls did).
const pages = existsSync('public') ? readdirSync('public').filter((f) => f.endsWith('.html') && f !== 'index.html').map((f) => f.slice(0, -5)) : [];
const hasSite = existsSync('public/index.html');

/** @type {import('next').NextConfig} */
export default {
  serverExternalPackages: ['@electric-sql/pglite', 'pg'],
  outputFileTracingIncludes: { '/**': ['./node_modules/@electric-sql/pglite/dist/**', './supabase/**'] },
  async rewrites() {
    return {
      beforeFiles: [
        ...(hasSite ? [{ source: '/', destination: '/index.html' }] : []),
        ...pages.map((p) => ({ source: `/${p}`, destination: `/${p}.html` })),
      ],
    };
  },
};
