#!/usr/bin/env node
/**
 * Tells Bing (and other search engines that support IndexNow) which pages changed, so they are crawled
 * within minutes instead of days. Run it after a deploy:   node indexnow.js
 * It sends every address in sitemap.xml, or only the addresses you pass:   node indexnow.js https://elimuplus.com/join.html
 * The key file c4f0f06e94c9d648ec5def4bb98169aa.txt in this folder proves the site is ours. The key is public by design.
 */
const fs = require('fs');
const HOST = 'elimuplus.com';
const KEY = 'c4f0f06e94c9d648ec5def4bb98169aa';
const urls = process.argv.length > 2
  ? process.argv.slice(2)
  : [...fs.readFileSync(__dirname + '/sitemap.xml', 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ host: HOST, key: KEY, keyLocation: `https://${HOST}/${KEY}.txt`, urlList: urls }),
}).then((r) => console.log(`IndexNow answered ${r.status} for ${urls.length} addresses (200 or 202 means accepted)`))
  .catch((e) => { console.error('IndexNow failed:', e.message); process.exit(1); });
