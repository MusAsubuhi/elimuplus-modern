#!/usr/bin/env node
/* =============================================================
   ELIMU+ BLOG BUILDER  (no dependencies; needs Node 16+)
   Run from this folder:   node build-blog.js
   Reads    blog/posts/*.md   (files starting with _ are ignored)
   Writes   blog.html, blog/<slug>.html, rss.xml, sitemap.xml
   The nav and footer are copied from index.html, so a change
   there flows into every blog page on the next build.
   See BLOG-GUIDE.md for the weekly routine.
   ============================================================= */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SITE = 'https://elimuplus.com';
const POSTS_DIR = path.join(ROOT, 'blog', 'posts');
const OUT_DIR = path.join(ROOT, 'blog');
const DEFAULT_OG = SITE + '/images/og-image.jpg';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const xml = esc;

/* ---------- front matter + markdown ---------- */
function parsePost(file) {
  const raw = fs.readFileSync(path.join(POSTS_DIR, file), 'utf8').replace(/\r\n/g, '\n');
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) throw new Error(file + ': missing front matter block (--- ... ---) at the top');
  const meta = {};
  m[1].split('\n').forEach((line) => {
    const i = line.indexOf(':');
    if (i > 0) meta[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  });
  ['title', 'date', 'summary'].forEach((k) => {
    if (!meta[k]) throw new Error(file + ': front matter needs "' + k + '"');
  });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(meta.date)) throw new Error(file + ': date must look like 2026-10-14');
  const base = file.replace(/\.md$/, '');
  meta.slug = (meta.slug || base.replace(/^\d{4}-\d{2}-\d{2}-/, '')).toLowerCase().replace(/[^a-z0-9-]+/g, '-');
  meta.author = meta.author || 'The Elimu+ team';
  meta.category = meta.category || 'Field notes';
  meta.draft = /^(true|yes)$/i.test(meta.draft || '');
  meta.body = m[2].trim();
  meta.words = meta.body.split(/\s+/).length;
  meta.minutes = Math.max(1, Math.round(meta.words / 200));
  return meta;
}

function inline(t) {
  t = esc(t);
  t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,;:!?]|$)/g, '$1<em>$2</em>');
  t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, a, u) => {
    const ext = /^https?:\/\//.test(u);
    return '<a href="' + u + '"' + (ext ? ' target="_blank" rel="noopener"' : '') + '>' + a + '</a>';
  });
  return t;
}

function markdown(src) {
  const lines = src.split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    let m;
    if ((m = line.match(/^(#{2,4})\s+(.*)$/))) {
      const lvl = m[1].length;
      out.push('<h' + lvl + '>' + inline(m[2]) + '</h' + lvl + '>'); i++; continue;
    }
    if (/^(-{3,}|\*{3,})$/.test(line.trim())) { out.push('<hr>'); i++; continue; }
    if ((m = line.match(/^!\[([^\]]*)\]\(([^)\s]+)\)$/))) {
      out.push('<figure class="post-figure"><img src="' + m[2] + '" alt="' + esc(m[1]) + '" loading="lazy" decoding="async">' +
        (m[1] ? '<figcaption>' + esc(m[1]) + '</figcaption>' : '') + '</figure>'); i++; continue;
    }
    if (/^>\s?/.test(line)) {
      const q = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) { q.push(lines[i].replace(/^>\s?/, '')); i++; }
      out.push('<blockquote><p>' + inline(q.join(' ')) + '</p></blockquote>'); continue;
    }
    if (/^[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) { items.push('<li>' + inline(lines[i].replace(/^[-*]\s+/, '')) + '</li>'); i++; }
      out.push('<ul>' + items.join('') + '</ul>'); continue;
    }
    if (/^\d+[.)]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+[.)]\s+/.test(lines[i])) { items.push('<li>' + inline(lines[i].replace(/^\d+[.)]\s+/, '')) + '</li>'); i++; }
      out.push('<ol>' + items.join('') + '</ol>'); continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^(#{2,4}\s|>|[-*]\s|\d+[.)]\s|!\[)/.test(lines[i])) { para.push(lines[i]); i++; }
    out.push('<p>' + inline(para.join(' ')) + '</p>');
  }
  return out.join('\n');
}

/* ---------- shared header / footer ---------- */
const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const header = indexHtml.match(/<header>[\s\S]*?<\/header>/)[0]
  .replace(/ class="active"/g, '')
  .replace(/<a href="blog\.html">/g, '<a href="blog.html" class="active" aria-current="page">');
const footer = indexHtml.match(/<footer[\s\S]*?<\/footer>/)[0];

function rel(html, depth) {
  if (!depth) return html;
  const pre = '../'.repeat(depth);
  return html.replace(/(href|src)="(?!https?:|\/\/|#|mailto:|tel:|\.\.\/)([^"]*)"/g, '$1="' + pre + '$2"');
}

function page({ title, desc, canonical, image, body, depth, type, ld }) {
  const css = rel('<link rel="stylesheet" href="css/styles.css">', depth);
  const fav = rel('<link rel="icon" href="images/favicon.png" type="image/png">', depth);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <!-- GENERATED by build-blog.js. Edit blog/posts/*.md and re-run the builder instead of editing this file. -->
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(desc)}">
  <link rel="canonical" href="${canonical}">
  <link rel="alternate" type="application/rss+xml" title="Elimu+ blog" href="${SITE}/rss.xml">
  <meta property="og:type" content="${type}">
  <meta property="og:site_name" content="Elimu+">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(desc)}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:image" content="${image}">
  <meta property="og:locale" content="en_KE">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(title)}">
  <meta name="twitter:description" content="${esc(desc)}">
  <meta name="twitter:image" content="${image}">
  ${fav}
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Lato:wght@400;700&display=swap" rel="stylesheet">
  ${css}
${ld ? '  <script type="application/ld+json">' + JSON.stringify(ld) + '</script>\n' : ''}</head>
<body>

  <a class="skip-link" href="#main">Skip to content</a>

  ${rel(header, depth)}

${body}

  ${rel(footer, depth)}

  <script src="${'../'.repeat(depth)}js/main.js"></script>
</body>
</html>
`;
}

const fmtDate = (d) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const imgUrl = (p) => (p ? (/^https?:/.test(p) ? p : SITE + '/' + p.replace(/^\//, '')) : DEFAULT_OG);

/* ---------- build ---------- */
const files = fs.existsSync(POSTS_DIR) ? fs.readdirSync(POSTS_DIR).filter((f) => f.endsWith('.md') && !f.startsWith('_')) : [];
const all = files.map(parsePost).sort((a, b) => (a.date < b.date ? 1 : -1));
const posts = all.filter((p) => !p.draft);

// remove stale generated posts
const keep = new Set(posts.map((p) => p.slug + '.html'));
fs.readdirSync(OUT_DIR).filter((f) => f.endsWith('.html') && !keep.has(f)).forEach((f) => {
  try { fs.unlinkSync(path.join(OUT_DIR, f)); } catch (e) { console.warn('Could not remove stale file blog/' + f + ': delete it by hand'); }
});

function card(p, depthPrefix) {
  const img = p.image
    ? `<img class="blog-card__img" src="${depthPrefix}${p.image}" alt="${esc(p.imagealt || '')}" loading="lazy" decoding="async">`
    : `<div class="blog-card__img blog-card__img--none" aria-hidden="true"><span>Elimu<b>+</b></span></div>`;
  return `<article class="blog-card">
  <a class="blog-card__media" href="${depthPrefix}blog/${p.slug}.html" tabindex="-1" aria-hidden="true">${img}</a>
  <div class="blog-card__body">
    <p class="blog-card__meta"><span class="card__badge">${esc(p.category)}</span> <time datetime="${p.date}">${fmtDate(p.date)}</time> · ${p.minutes} min read</p>
    <h3><a href="${depthPrefix}blog/${p.slug}.html">${esc(p.title)}</a></h3>
    <p>${esc(p.summary)}</p>
    <a class="card-link" href="${depthPrefix}blog/${p.slug}.html">Read the post →</a>
  </div>
</article>`;
}

posts.forEach((p) => {
  const url = `${SITE}/blog/${p.slug}.html`;
  const others = posts.filter((o) => o.slug !== p.slug).slice(0, 2);
  const cover = p.image ? `<figure class="post-cover"><img src="../${p.image}" alt="${esc(p.imagealt || '')}" decoding="async"></figure>` : '';
  const body = `  <main id="main">
    <section class="hero hero--short text-white">
      <div class="hero__inner">
        <p class="eyebrow"><a href="../blog.html" style="color:inherit">The Elimu+ blog</a> · ${esc(p.category)}</p>
        <h1>${esc(p.title)}</h1>
        <p class="lede">${esc(p.summary)}</p>
        <p class="post-meta"><time datetime="${p.date}">${fmtDate(p.date)}</time> · ${esc(p.author)} · ${p.minutes} min read</p>
      </div>
      <div class="diagonal-stripe diagonal-stripe--hero" aria-hidden="true"></div>
    </section>

    <article class="section">
      <div class="container post">
        ${cover}
        <div class="post__body">
${markdown(p.body).replace(/src="images\//g, 'src="../images/')}
        </div>
        <aside class="post-cta">
          <h2>Want Elimu+ in your community?</h2>
          <p>We train through churches, NGOs and colleges, then follow up at 30, 60 and 90 days.</p>
          <p><a class="btn btn--primary" href="../partner.html">Partner With Us</a> <a class="btn btn--outline-teal" href="https://wa.me/254798639546" target="_blank" rel="noopener">WhatsApp Us</a></p>
        </aside>
      </div>
    </article>
${others.length ? `
    <section class="section bg-mist">
      <div class="container">
        <div class="section-heading"><h2>More from the blog</h2></div>
        <div class="grid grid-2">
${others.map((o) => card(o, '../')).join('\n')}
        </div>
      </div>
    </section>` : ''}
  </main>`;
  const ld = {
    '@context': 'https://schema.org', '@type': 'BlogPosting', headline: p.title, description: p.summary,
    datePublished: p.date, dateModified: p.date, author: { '@type': 'Organization', name: 'Elimu+' },
    publisher: { '@type': 'Organization', name: 'Elimu+', logo: { '@type': 'ImageObject', url: SITE + '/images/favicon.png' } },
    image: imgUrl(p.image), mainEntityOfPage: url,
  };
  fs.writeFileSync(path.join(OUT_DIR, p.slug + '.html'),
    page({ title: p.title + ' | Elimu+ blog', desc: p.summary, canonical: url, image: imgUrl(p.image), body, depth: 1, type: 'article', ld }));
});

// listing page
const listBody = `  <main id="main">
    <section class="hero hero--short text-white">
      <div class="hero__inner">
        <p class="eyebrow">Likoni · Mombasa · Kenya</p>
        <h1>Notes from the field</h1>
        <p class="lede">What we see, learn and change as we train entrepreneurs and follow them into their businesses. A new post most weeks.</p>
        <p class="sw">Tunaandika tunachojifunza.</p>
      </div>
      <div class="diagonal-stripe diagonal-stripe--hero" aria-hidden="true"></div>
    </section>

    <section class="section">
      <div class="container">
${posts.length ? `        <div class="grid grid-3 blog-grid">\n${posts.map((p) => card(p, '')).join('\n')}\n        </div>` : '        <p>The first post is on its way.</p>'}
        <p class="blog-feed"><a href="rss.xml">Subscribe via RSS</a> · <a href="https://wa.me/254798639546" target="_blank" rel="noopener">Ask us to message you each new post on WhatsApp</a></p>
      </div>
    </section>
  </main>`;
fs.writeFileSync(path.join(ROOT, 'blog.html'), page({
  title: 'Blog | Elimu+ field notes from Likoni',
  desc: 'Weekly notes from Elimu+ on training entrepreneurs in Likoni, Mombasa and following up until their businesses stand.',
  canonical: SITE + '/blog.html', image: DEFAULT_OG, body: listBody, depth: 0, type: 'website',
}));

// RSS
const rfc = (d) => new Date(d + 'T06:00:00Z').toUTCString();
fs.writeFileSync(path.join(ROOT, 'rss.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
<title>Elimu+ blog</title><link>${SITE}/blog.html</link>
<description>Weekly notes from Elimu+ on entrepreneurship training and follow-through in Likoni, Mombasa.</description><language>en-ke</language>
${posts.map((p) => `<item><title>${xml(p.title)}</title><link>${SITE}/blog/${p.slug}.html</link><guid>${SITE}/blog/${p.slug}.html</guid><pubDate>${rfc(p.date)}</pubDate><description>${xml(p.summary)}</description></item>`).join('\n')}
</channel></rss>
`);

// sitemap
const stat = ['index', 'programme', 'calculator', 'partner', 'trainer', 'about', 'blog'];
const today = new Date().toISOString().slice(0, 10);
fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${stat.map((s) => `<url><loc>${SITE}/${s === 'index' ? '' : s + '.html'}</loc><lastmod>${today}</lastmod></url>`).join('\n')}
${posts.map((p) => `<url><loc>${SITE}/blog/${p.slug}.html</loc><lastmod>${p.date}</lastmod></url>`).join('\n')}
</urlset>
`);
fs.writeFileSync(path.join(ROOT, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${SITE}/sitemap.xml\n`);

console.log(`Built ${posts.length} post(s)` + (all.length - posts.length ? ` (${all.length - posts.length} draft skipped)` : '') + '. Files: blog.html, blog/*.html, rss.xml, sitemap.xml, robots.txt');
