#!/usr/bin/env node
/* Builds directory.html (Biashara za Elimu+) from directory-data/entries.json.
   Run:  node build-directory.js
   English first, like the rest of the site. Swahili is used for names and for owners' own quotes.
   While any entry is marked "sample": true the page shows a coming-soon banner and is set to noindex. */
const fs = require('fs');
const path = require('path');
const ROOT = __dirname;
const SITE = 'https://elimuplus.com';
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'directory-data', 'entries.json'), 'utf8'));
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const B = data.businesses || [], N = data.needs || [], Y = data.youth || [];
const hasSample = [...B, ...N, ...Y].some((e) => e.sample);
const bizById = Object.fromEntries(B.map((b) => [b.id, b]));

const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const header = indexHtml.match(/<header>[\s\S]*?<\/header>/)[0].replace(/ class="active" aria-current="page"/g, '').replace(/ class="active"/g, '');
const footer = indexHtml.match(/<footer[\s\S]*?<\/footer>/)[0];

const initials = (n) => n.replace(/\(.*?\)/g, '').trim().split(/\s+/).filter((w) => !/^(ya|za|la|wa)$/i.test(w)).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
const sampleTag = (e) => (e.sample ? '<span class="chip chip--sample">Sample</span>' : '');
const STATUS = { open: ['chip chip--open', 'Open'], talking: ['chip chip--talk', 'In conversation'], done: ['chip chip--done', 'Supported'] };
const statusChip = (s) => { const x = STATUS[s] || STATUS.open; return `<span class="${x[0]}">${x[1]}</span>`; };
const wa = (b) => (b.whatsapp ? `<a class="card-link" href="https://wa.me/${esc(b.whatsapp)}?text=${encodeURIComponent('Habari, I saw your business on Biashara za Elimu+.')}" target="_blank" rel="noopener">Message on WhatsApp →</a>` : '<span class="biz-nocontact">The WhatsApp link appears once the owner consents.</span>');

function bizCard(b) {
  return `          <article class="card biz-card" data-cat="${esc(b.category)}">
            <div class="biz-head"><span class="biz-avatar" aria-hidden="true">${esc(initials(b.name))}</span>
              <div><h3>${esc(b.name)}</h3><p class="biz-meta">${esc(b.category_en)} · ${esc(b.area)}</p></div></div>
            ${sampleTag(b)}
            <p>${esc(b.blurb_en)}</p>
            ${b.quote_sw ? `<blockquote class="biz-quote"><p lang="sw">${esc(b.quote_sw)}</p><p class="en">${esc(b.quote_en)}</p></blockquote>` : ''}
            <p class="biz-foot">${esc(b.cohort_en)}<br>Last confirmed: ${esc(b.confirmed_en)}</p>
            ${wa(b)}
          </article>`;
}
function needCard(n) {
  const b = bizById[n.business];
  return `          <article class="card need-card" id="${esc(n.id)}">
            <div class="need-top"><span class="card__badge">${esc(n.type_en)}</span>${statusChip(n.status)}</div>
            ${sampleTag(n)}
            <h3>${esc(n.title_en)}</h3>
            ${b ? `<p class="biz-meta">${esc(b.name)} · ${esc(b.area)}</p>` : ''}
            <p>${esc(n.detail_en)}</p>
            <p><strong>What it unlocks:</strong> ${esc(n.unlock_en)}</p>
            ${n.estimate ? `<p><strong>Estimate:</strong> ${esc(n.estimate.replace(/\s*\(mfano \/ sample\)/, ' (sample figure)'))}</p>` : ''}
            <p><strong>How help is given:</strong> ${esc(n.how_en)}</p>
            ${n.status === 'done' ? '' : `<a class="card-link" href="#help" data-need="${esc(n.id)}">I want to help →</a>`}
          </article>`;
}
function youthCard(y) {
  return `          <article class="card youth-card">
            <div class="need-top"><span class="card__badge">Youth concept</span>${statusChip(y.status)}</div>
            ${sampleTag(y)}
            <h3>${esc(y.who_en)}</h3>
            <p>${esc(y.concept_en)}</p>
            <p><strong>Looking for:</strong> ${esc(y.seeks_en)}</p>
            <a class="card-link" href="#help">I want to help through the organisation →</a>
          </article>`;
}

const featured = B.find((b) => b.featured);
const cats = [...new Map(B.map((b) => [b.category, b])).values()];
const needOptions = N.filter((n) => n.status !== 'done').map((n) => `<option value="${esc(n.id)}">${esc(n.title_en)} (${esc((bizById[n.business] || {}).name || '')})</option>`).join('');
const youthOptions = Y.map((y) => `<option value="${esc(y.id)}">Youth concept: ${esc(y.who_en)}</option>`).join('');

const TITLE = 'Biashara za Elimu+ | Coming soon: directory of Elimu+ graduate businesses';
const DESC = 'Coming soon: Biashara za Elimu+, a directory of businesses run by Elimu+ graduates, with their growth needs and ways to help them grow.';
const IMG = SITE + '/images/og/og-directory.jpg';

const body = `
  <main id="main">

    <section class="hero hero--short text-white" style="background-image: url('images/home-follow-up-visit.jpg');">
      <div class="hero__inner">
        <p class="eyebrow">Coming soon</p>
        <h1>Biashara za Elimu+</h1>
        <p class="lede">The Elimu+ directory: businesses run by Elimu+ graduates who have been operating for at least 90 days. Get to know them, buy from them, and see how you can help them grow.</p>
      </div>
      <div class="diagonal-stripe diagonal-stripe--hero" aria-hidden="true"></div>
    </section>
${hasSample ? `
    <section class="sample-banner" role="note">
      <div class="container">
        <p><strong>Coming soon.</strong> Biashara za Elimu+ is not open yet. The people and businesses you see here are imaginary, shown so you can see how the directory will look. Real listings appear only after the owner's consent and the host organisation's approval.</p>
      </div>
    </section>
` : ''}
${featured ? `
    <section class="section bg-white" id="month">
      <div class="container" style="max-width: 920px;">
        <div class="section-heading text-center">
          <h2>Business of the Month</h2>
          <p>Biashara ya Mwezi</p>
        </div>
        <div class="motm">
          <div class="motm__badge" aria-hidden="true">${esc(initials(featured.name))}</div>
          <div>
            ${sampleTag(featured)}
            <h3>${esc(featured.name)}</h3>
            <p class="biz-meta">${esc(featured.category_en)} · ${esc(featured.area)}</p>
            <p>${esc(featured.blurb_en)}</p>
            ${featured.quote_sw ? `<blockquote class="biz-quote"><p lang="sw">${esc(featured.quote_sw)}</p><p class="en">${esc(featured.quote_en)}</p></blockquote>` : ''}
          </div>
        </div>
        <p class="text-center" style="max-width: 680px; margin: var(--space-md) auto 0;">We do not pick the biggest business. We pick the one that shows resilience, growth against its own starting point and benefit to the community. The Business of the Month is announced at the monthly Elimu+ forum and on social media.</p>
      </div>
    </section>
` : ''}
    <section class="section bg-mist" id="businesses">
      <div class="container">
        <div class="section-heading text-center">
          <h2>Businesses</h2>
          <p>Businesses confirmed at the 90-day visit, with the owner's consent and the host organisation's approval.</p>
        </div>
        <div class="filter-bar" role="group" aria-label="Filter by category">
          <button type="button" class="filter-btn is-active" data-filter="all">All</button>
${cats.map((c) => `          <button type="button" class="filter-btn" data-filter="${esc(c.category)}">${esc(c.category_en)}</button>`).join('\n')}
        </div>
        <div class="grid grid-2" id="biz-grid">
${B.map(bizCard).join('\n')}
        </div>
      </div>
    </section>

    <section class="section bg-white" id="needs">
      <div class="container">
        <div class="section-heading text-center">
          <h2>Growth Needs</h2>
          <p>Mahitaji ya Ukuaji</p>
        </div>
        <div class="prose" style="margin: 0 auto var(--space-lg);">
          <p>Each need is written by the business owner with our team at the 90-day visit, and is backed by her own numbers (Uchumi wa Bidhaa) and her follow-up record. For now, help is given as goods, introductions and mentorship, not as cash in hand: a stall is built, stock is bought from a supplier, a mentor is found.</p>
        </div>
        <div class="grid grid-2">
${N.map(needCard).join('\n')}
        </div>
      </div>
    </section>

    <section class="section bg-mist" id="youth">
      <div class="container">
        <div class="section-heading text-center">
          <h2>Youth Business Concepts</h2>
        </div>
        <div class="prose" style="margin: 0 auto var(--space-lg);">
          <p>Young people who have not yet started a business can show their concept once they have completed a SEE Canvas. There are no photos or phone numbers. A mentor or funder never contacts a young person directly: everything goes through their organisation, and a written plan is agreed by everyone. For anyone under 18, a parent's or guardian's consent is required.</p>
        </div>
        <div class="grid grid-2">
${Y.map(youthCard).join('\n')}
        </div>
      </div>
    </section>

    <section class="section bg-white" id="how">
      <div class="container" style="max-width: 860px;">
        <h2>How a business gets listed</h2>
        <ol class="steps">
          <li><strong>Training and 90 days of trading.</strong> The graduate completed Elimu+ training and the business has operated for at least 90 days, confirmed at the 90-day visit.</li>
          <li><strong>The owner consents.</strong> With written consent, the owner chooses what appears here (business name, what she sells, neighbourhood, WhatsApp link, photo) and can be removed at any time.</li>
          <li><strong>The host organisation approves.</strong> The church, organisation or institution that hosted the training reviews and approves every listing and every need.</li>
          <li><strong>Listed and re-confirmed.</strong> We re-confirm at each follow-up visit, and every business shows the month it was last confirmed.</li>
        </ol>
        <p>Does your organisation have Elimu+ graduates? <a href="join.html">Get in touch</a> and we will start the listing process.</p>
      </div>
    </section>

    <section class="section bg-teal text-white" id="help">
      <div class="container">
        <div class="section-heading text-center">
          <h2>I want to help</h2>
          <p class="lede">Tell us what you can offer: a stall, stock, a supplier introduction, mentorship or a market. Your message goes to Elimu+ and the host organisation, never directly to the business owner or young person.</p>
        </div>
        <form class="form js-form" action="https://formspree.io/f/mljgjbnj" method="POST" novalidate>
          <input type="hidden" name="_subject" value="Elimu+ directory: Offer of support">
          <div class="form-row form-row--2">
            <div class="field"><label for="s-name">Your name or organisation</label><input type="text" id="s-name" name="name" required autocomplete="name"></div>
            <div class="field"><label for="s-type">Who are you?</label>
              <select id="s-type" name="supporter_type" required><option value="">Select one</option><option>Individual</option><option>Business or company</option><option>Church or faith organisation</option><option>NGO or community organisation</option><option>Funder or financial institution</option></select></div>
          </div>
          <div class="form-row form-row--2">
            <div class="field"><label for="s-email">Email</label><input type="email" id="s-email" name="email" required autocomplete="email"></div>
            <div class="field"><label for="s-wa">Phone (WhatsApp if possible)</label><input type="tel" id="s-wa" name="whatsapp" required autocomplete="tel" placeholder="07XX XXX XXX"></div>
          </div>
          <div class="form-row form-row--2">
            <div class="field"><label for="s-kind">Kind of help</label>
              <select id="s-kind" name="kind_of_help" required><option value="">Select one</option><option>Stall or equipment</option><option>Stock</option><option>Premises</option><option>Supplier or buyer introduction</option><option>Mentorship</option><option>Market access</option><option>Other</option></select></div>
            <div class="field"><label for="s-need">Need you want to help with</label>
              <select id="s-need" name="need_reference" required><option value="">Select one</option>${needOptions}${youthOptions}<option value="general">Not sure yet, I would like to talk</option></select></div>
          </div>
          <div class="form-row"><div class="field"><label for="s-msg">Your message</label><textarea id="s-msg" name="message" required placeholder="What can you offer, and when?"></textarea></div></div>
          <div class="field field--honeypot" aria-hidden="true"><label for="s-gotcha">Leave this blank</label><input type="text" id="s-gotcha" name="_gotcha" tabindex="-1" autocomplete="off"></div>
          <div class="field field--check"><label for="s-agree"><input type="checkbox" id="s-agree" name="agreed_route" value="Yes" required> I understand that help goes through the host organisation and Elimu+, and that I will not contact the business owner or young person directly.</label></div>
          <p class="form-privacy">We use these details only to contact you. Read our <a href="privacy.html">privacy notice</a>.</p>
          <button type="submit" class="btn btn--primary btn--block">Send My Offer</button>
          <div class="form-feedback form-feedback--success" role="status">Asante. We have your offer and will be in touch soon.</div>
          <div class="form-feedback form-feedback--error" role="alert">Something went wrong. Please message us on WhatsApp instead.</div>
        </form>
        <p class="form-direct-contact" style="max-width: 720px; margin-left: auto; margin-right: auto;">Elimu+ lists graduates who have chosen to appear here; we do not guarantee any business's goods or services.</p>
      </div>
    </section>

  </main>
`;

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <!-- GENERATED by build-directory.js from directory-data/entries.json. Edit the data file and re-run the builder. -->
  <title>${esc(TITLE)}</title>
  <meta name="description" content="${esc(DESC)}">
${hasSample ? '  <meta name="robots" content="noindex, follow">\n' : ''}  <link rel="canonical" href="${SITE}/directory.html">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Elimu+">
  <meta property="og:title" content="${esc(TITLE)}">
  <meta property="og:description" content="${esc(DESC)}">
  <meta property="og:url" content="${SITE}/directory.html">
  <meta property="og:image" content="${IMG}">
  <meta property="og:image:type" content="image/jpeg">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:locale" content="en_KE">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(TITLE)}">
  <meta name="twitter:description" content="${esc(DESC)}">
  <meta name="twitter:image" content="${IMG}">
  <link rel="icon" href="images/favicon.png" type="image/png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Lato:wght@400;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="css/styles.css">
  <script defer data-domain="elimuplus.com" src="https://plausible.io/js/script.js"></script>
</head>
<body>

  <a class="skip-link" href="#main">Skip to content</a>

  ${header}
${body}
  ${footer}

  <script src="js/main.js"></script>
  <script>
    (function () {
      var btns = document.querySelectorAll('.filter-btn'), cards = document.querySelectorAll('#biz-grid .biz-card');
      btns.forEach(function (b) { b.addEventListener('click', function () {
        btns.forEach(function (x) { x.classList.remove('is-active'); }); b.classList.add('is-active');
        var f = b.getAttribute('data-filter');
        cards.forEach(function (c) { c.style.display = (f === 'all' || c.getAttribute('data-cat') === f) ? '' : 'none'; });
      }); });
      document.querySelectorAll('a[data-need]').forEach(function (a) { a.addEventListener('click', function () {
        var s = document.getElementById('s-need'); if (s) s.value = a.getAttribute('data-need');
      }); });
    })();
  </script>
</body>
</html>
`;
fs.writeFileSync(path.join(ROOT, 'directory.html'), html);
console.log('Built directory.html: ' + B.length + ' business(es), ' + N.length + ' need(s), ' + Y.length + ' youth concept(s)' + (hasSample ? ' [coming-soon preview: sample entries, noindex]' : ''));
