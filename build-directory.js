#!/usr/bin/env node
/* Builds directory.html (Biashara za Elimu+) from directory-data/entries.json.
   Run:  node build-directory.js
   While any entry is marked "sample": true the page shows a "preview" banner and is set to noindex. */
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
const sampleTag = (e) => (e.sample ? '<span class="chip chip--sample">Mfano / Sample</span>' : '');
const STATUS = {
  open: ['chip chip--open', 'Wazi', 'Open'],
  talking: ['chip chip--talk', 'Mazungumzo yanaendelea', 'In conversation'],
  done: ['chip chip--done', 'Imesaidiwa', 'Supported']
};
const statusChip = (s) => { const x = STATUS[s] || STATUS.open; return `<span class="${x[0]}">${x[1]} <span lang="en">/ ${x[2]}</span></span>`; };
const wa = (b) => (b.whatsapp ? `<a class="card-link" href="https://wa.me/${esc(b.whatsapp)}?text=${encodeURIComponent('Habari, nimeona biashara yako kwenye Biashara za Elimu+.')}" target="_blank" rel="noopener">Wasiliana kwa WhatsApp <span lang="en">/ Message on WhatsApp</span> →</a>` : '<span class="biz-nocontact">Kiungo cha WhatsApp kitaonekana baada ya ridhaa. <span lang="en">/ The WhatsApp link appears once the owner consents.</span></span>');

function bizCard(b) {
  return `          <article class="card biz-card" data-cat="${esc(b.category)}">
            <div class="biz-head"><span class="biz-avatar" aria-hidden="true">${esc(initials(b.name))}</span>
              <div><h3>${esc(b.name)}</h3><p class="biz-meta">${esc(b.category_sw)} <span lang="en">/ ${esc(b.category_en)}</span> · ${esc(b.area)}</p></div></div>
            ${sampleTag(b)}
            <p>${esc(b.blurb_sw)}</p>
            <p class="en" lang="en">${esc(b.blurb_en)}</p>
            ${b.quote_sw ? `<blockquote class="biz-quote"><p>${esc(b.quote_sw)}</p><p class="en" lang="en">${esc(b.quote_en)}</p></blockquote>` : ''}
            <p class="biz-foot">${esc(b.cohort)} <span lang="en">/ ${esc(b.cohort_en)}</span><br>Imethibitishwa: ${esc(b.confirmed)} <span lang="en">/ Last confirmed: ${esc(b.confirmed_en)}</span></p>
            ${wa(b)}
          </article>`;
}
function needCard(n) {
  const b = bizById[n.business];
  const ref = b ? b.name : '';
  return `          <article class="card need-card" id="${esc(n.id)}">
            <div class="need-top"><span class="card__badge">${esc(n.type_sw)} <span lang="en">/ ${esc(n.type_en)}</span></span>${statusChip(n.status)}</div>
            ${sampleTag(n)}
            <h3>${esc(n.title_sw)}</h3>
            <p class="en need-title-en" lang="en">${esc(n.title_en)}</p>
            ${b ? `<p class="biz-meta">${esc(b.name)} · ${esc(b.area)}</p>` : ''}
            <p>${esc(n.detail_sw)}</p>
            <p class="en" lang="en">${esc(n.detail_en)}</p>
            <p><strong>Kinachofunguliwa:</strong> ${esc(n.unlock_sw)}<br><span class="en" lang="en"><strong>What it unlocks:</strong> ${esc(n.unlock_en)}</span></p>
            ${n.estimate ? `<p><strong>Makadirio:</strong> ${esc(n.estimate)}</p>` : ''}
            <p><strong>Jinsi msaada unavyotolewa:</strong> ${esc(n.how_sw)}<br><span class="en" lang="en"><strong>How help is given:</strong> ${esc(n.how_en)}</span></p>
            ${n.status === 'done' ? '' : `<a class="card-link" href="#saidia" data-need="${esc(n.id)}">Nataka kusaidia <span lang="en">/ I want to help</span> →</a>`}
          </article>`;
}
function youthCard(y) {
  return `          <article class="card youth-card">
            <div class="need-top"><span class="card__badge">Wazo la kijana <span lang="en">/ Youth concept</span></span>${statusChip(y.status)}</div>
            ${sampleTag(y)}
            <h3>${esc(y.who)}</h3>
            <p class="en need-title-en" lang="en">${esc(y.who_en)}</p>
            <p>${esc(y.concept_sw)}</p>
            <p class="en" lang="en">${esc(y.concept_en)}</p>
            <p><strong>Anatafuta:</strong> ${esc(y.seeks_sw)}<br><span class="en" lang="en"><strong>Looking for:</strong> ${esc(y.seeks_en)}</span></p>
            <a class="card-link" href="#saidia">Nataka kusaidia kupitia shirika <span lang="en">/ I want to help through the organisation</span> →</a>
          </article>`;
}

const featured = B.find((b) => b.featured);
const cats = [...new Map(B.map((b) => [b.category, b])).values()];
const needOptions = N.filter((n) => n.status !== 'done').map((n) => `<option value="${esc(n.id)}">${esc(n.title_sw)} (${esc((bizById[n.business] || {}).name || '')})</option>`).join('');
const youthOptions = Y.map((y) => `<option value="${esc(y.id)}">Wazo la kijana: ${esc(y.who)}</option>`).join('');

const TITLE = 'Biashara za Elimu+ | Elimu+ directory of graduate businesses';
const DESC = 'Biashara za wahitimu wa Elimu+ waliofanya kazi kwa siku 90 au zaidi, mahitaji yao ya ukuaji na jinsi ya kusaidia. Businesses run by Elimu+ graduates, their growth needs and how to help.';
const IMG = SITE + '/images/og/og-home.jpg';

const body = `
  <main id="main">

    <section class="hero hero--short text-white" style="background-image: url('images/home-follow-up-visit.jpg');">
      <div class="hero__inner">
        <p class="eyebrow">Wahitimu wa Elimu+ <span lang="en">/ Elimu+ graduates</span></p>
        <h1>Biashara za Elimu+</h1>
        <p class="lede">Biashara za wahitimu wa Elimu+ ambao wameziendesha kwa siku 90 au zaidi. Zijue, zinunulie, na uone jinsi ya kusaidia zikue.</p>
        <p class="lede en" lang="en">Businesses run by Elimu+ graduates who have been operating for at least 90 days. Get to know them, buy from them, and see how you can help them grow.</p>
      </div>
      <div class="diagonal-stripe diagonal-stripe--hero" aria-hidden="true"></div>
    </section>
${hasSample ? `
    <section class="sample-banner" role="note">
      <div class="container">
        <p><strong>Muonekano wa mfano tu.</strong> Watu na biashara zilizo kwenye ukurasa huu ni za kubuni, zimeonyeshwa ili uone jinsi orodha itakavyoonekana. Orodha halisi itaonekana baada ya ridhaa ya mmiliki na idhini ya shirika mwenyeji.</p>
        <p class="en" lang="en"><strong>Preview only.</strong> The people and businesses on this page are imaginary, shown so you can see how the directory will look. Real listings appear only after the owner's consent and the host organisation's approval.</p>
      </div>
    </section>
` : ''}
${featured ? `
    <section class="section bg-white" id="mwezi">
      <div class="container" style="max-width: 920px;">
        <div class="section-heading text-center">
          <h2>Biashara ya Mwezi</h2>
          <p class="en" lang="en">Business of the month</p>
        </div>
        <div class="motm">
          <div class="motm__badge" aria-hidden="true">${esc(initials(featured.name))}</div>
          <div>
            ${sampleTag(featured)}
            <h3>${esc(featured.name)}</h3>
            <p class="biz-meta">${esc(featured.category_sw)} <span lang="en">/ ${esc(featured.category_en)}</span> · ${esc(featured.area)}</p>
            <p>${esc(featured.blurb_sw)}</p>
            <p class="en" lang="en">${esc(featured.blurb_en)}</p>
            ${featured.quote_sw ? `<blockquote class="biz-quote"><p>${esc(featured.quote_sw)}</p><p class="en" lang="en">${esc(featured.quote_en)}</p></blockquote>` : ''}
          </div>
        </div>
        <p class="text-center" style="max-width: 680px; margin: var(--space-md) auto 0;">Hatuchagui biashara kubwa zaidi, bali ile iliyoonyesha uimara, ukuaji ikilinganishwa na mwanzo wake, na manufaa kwa jamii. Biashara ya Mwezi hutangazwa kwenye mkutano wa kila mwezi wa Elimu+ na mitandaoni.</p>
        <p class="en text-center" lang="en" style="max-width: 680px; margin: 0.5rem auto 0;">We do not pick the biggest business. We pick the one that shows resilience, growth against its own starting point and benefit to the community. It is announced at the monthly Elimu+ forum and on social media.</p>
      </div>
    </section>
` : ''}
    <section class="section bg-mist" id="biashara">
      <div class="container">
        <div class="section-heading text-center">
          <h2>Biashara</h2>
          <p>Biashara zilizothibitishwa katika ziara ya siku 90, zikiwa na ridhaa ya mmiliki na idhini ya shirika mwenyeji.</p>
          <p class="en" lang="en">Businesses confirmed at the 90-day visit, with the owner's consent and the host organisation's approval.</p>
        </div>
        <div class="filter-bar" role="group" aria-label="Chuja kwa aina / Filter by category">
          <button type="button" class="filter-btn is-active" data-filter="all">Zote <span lang="en">/ All</span></button>
${cats.map((c) => `          <button type="button" class="filter-btn" data-filter="${esc(c.category)}">${esc(c.category_sw)} <span lang="en">/ ${esc(c.category_en)}</span></button>`).join('\n')}
        </div>
        <div class="grid grid-2" id="biz-grid">
${B.map(bizCard).join('\n')}
        </div>
      </div>
    </section>

    <section class="section bg-white" id="mahitaji">
      <div class="container">
        <div class="section-heading text-center">
          <h2>Mahitaji ya Ukuaji</h2>
          <p class="en" lang="en">Growth needs</p>
        </div>
        <div class="prose" style="margin: 0 auto var(--space-lg);">
          <p>Kila hitaji limeandikwa na mmiliki wa biashara akishirikiana na timu yetu katika ziara ya siku 90, na linaungwa mkono na hesabu zake (Uchumi wa Bidhaa) na rekodi ya ufuatiliaji. Kwa sasa msaada hutolewa kwa vitu, utambulisho na ushauri, si pesa taslimu mkononi: kibanda kijengwe, bidhaa zinunuliwe kutoka kwa msambazaji, mshauri apatikane.</p>
          <p class="en" lang="en">Each need is written by the business owner with our team at the 90-day visit, and is backed by her own numbers (Uchumi wa Bidhaa) and her follow-up record. For now, help is given as goods, introductions and mentorship, not as cash in hand: a stall is built, stock is bought from a supplier, a mentor is found.</p>
        </div>
        <div class="grid grid-2">
${N.map(needCard).join('\n')}
        </div>
      </div>
    </section>

    <section class="section bg-mist" id="vijana">
      <div class="container">
        <div class="section-heading text-center">
          <h2>Mawazo ya Biashara ya Vijana</h2>
          <p class="en" lang="en">Youth business concepts</p>
        </div>
        <div class="prose" style="margin: 0 auto var(--space-lg);">
          <p>Vijana ambao hawajaanza biashara wanaweza kuonyesha wazo lao baada ya kukamilisha SEE Canvas. Hakuna picha wala namba za simu. Mwezeshaji, mshauri au mfadhili hawasiliani na kijana moja kwa moja: kila kitu kinapitia shirika lake, na mpango wa maandishi unakubaliwa na pande zote. Kwa walio chini ya miaka 18, idhini ya mzazi au mlezi inahitajika.</p>
          <p class="en" lang="en">Young people who have not yet started a business can show their concept once they have completed a SEE Canvas. There are no photos or phone numbers. A mentor or funder never contacts a young person directly: everything goes through their organisation, and a written plan is agreed by everyone. For anyone under 18, a parent's or guardian's consent is required.</p>
        </div>
        <div class="grid grid-2">
${Y.map(youthCard).join('\n')}
        </div>
      </div>
    </section>

    <section class="section bg-white" id="jinsi">
      <div class="container" style="max-width: 860px;">
        <h2>Jinsi biashara inavyoorodheshwa</h2>
        <p class="en" lang="en">How a business gets listed</p>
        <ol class="steps">
          <li><strong>Mafunzo na siku 90 za biashara.</strong> Mhitimu amekamilisha mafunzo ya Elimu+ na biashara yake imefanya kazi kwa angalau siku 90, tulipothibitisha katika ziara ya siku 90.<br><span class="en" lang="en">The graduate completed Elimu+ training and the business has operated for at least 90 days, confirmed at the 90-day visit.</span></li>
          <li><strong>Mmiliki anakubali.</strong> Kwa ridhaa ya maandishi, mmiliki anachagua kinachoonekana hapa (jina la biashara, anachouza, mtaa, kiungo cha WhatsApp, picha) na anaweza kuondolewa wakati wowote.<br><span class="en" lang="en">With written consent, the owner chooses what appears here (business name, what she sells, neighbourhood, WhatsApp link, photo) and can be removed at any time.</span></li>
          <li><strong>Shirika mwenyeji linaidhinisha.</strong> Kanisa, shirika au taasisi iliyoandaa mafunzo inakagua na kuidhinisha kila orodha na kila hitaji.<br><span class="en" lang="en">The church, organisation or institution that hosted the training reviews and approves every listing and every need.</span></li>
          <li><strong>Inaorodheshwa na kuthibitishwa upya.</strong> Tunathibitisha upya kila ziara ya ufuatiliaji, na kila biashara inaonyesha mwezi ilipothibitishwa mwisho.<br><span class="en" lang="en">We re-confirm at each follow-up visit, and every business shows the month it was last confirmed.</span></li>
        </ol>
        <p>Shirika lako lina wahitimu wa Elimu+? <a href="join.html">Wasiliana nasi</a> ili tuanze mchakato wa kuorodhesha. <span class="en" lang="en">Does your organisation have Elimu+ graduates? <a href="join.html">Get in touch</a> and we will start the listing process.</span></p>
      </div>
    </section>

    <section class="section bg-teal text-white" id="saidia">
      <div class="container">
        <div class="section-heading text-center">
          <h2>Nataka kusaidia</h2>
          <p class="lede">Sema unachoweza kutoa: kibanda, bidhaa, utambulisho kwa msambazaji, ushauri au soko. Ujumbe wako unakwenda kwa Elimu+ na shirika mwenyeji, si kwa mmiliki wa biashara au kijana.</p>
          <p class="lede en" lang="en">Tell us what you can offer: a stall, stock, a supplier introduction, mentorship or a market. Your message goes to Elimu+ and the host organisation, never directly to the business owner or young person.</p>
        </div>
        <form class="form js-form" action="https://formspree.io/f/mljgjbnj" method="POST" novalidate>
          <input type="hidden" name="_subject" value="Elimu+ directory: Offer of support">
          <div class="form-row form-row--2">
            <div class="field"><label for="s-name">Jina lako au la shirika <span lang="en">/ Your name or organisation</span></label><input type="text" id="s-name" name="name" required autocomplete="name"></div>
            <div class="field"><label for="s-type">Wewe ni nani? <span lang="en">/ Who are you?</span></label>
              <select id="s-type" name="supporter_type" required><option value="">Chagua / Select one</option><option>Mtu binafsi / Individual</option><option>Biashara au kampuni / Business or company</option><option>Kanisa au shirika la imani / Church or faith organisation</option><option>NGO au shirika la kijamii / NGO or community organisation</option><option>Taasisi ya fedha au mfadhili / Funder or financial institution</option></select></div>
          </div>
          <div class="form-row form-row--2">
            <div class="field"><label for="s-email">Barua pepe <span lang="en">/ Email</span></label><input type="email" id="s-email" name="email" required autocomplete="email"></div>
            <div class="field"><label for="s-wa">Simu (WhatsApp) <span lang="en">/ Phone (WhatsApp)</span></label><input type="tel" id="s-wa" name="whatsapp" required autocomplete="tel" placeholder="07XX XXX XXX"></div>
          </div>
          <div class="form-row form-row--2">
            <div class="field"><label for="s-kind">Aina ya msaada <span lang="en">/ Kind of help</span></label>
              <select id="s-kind" name="kind_of_help" required><option value="">Chagua / Select one</option><option>Kibanda au vifaa / Stall or equipment</option><option>Bidhaa au mtaji wa bidhaa / Stock</option><option>Mahali pa biashara / Premises</option><option>Utambulisho kwa msambazaji au mnunuzi / Supplier or buyer introduction</option><option>Ushauri / Mentorship</option><option>Soko / Market access</option><option>Nyingine / Other</option></select></div>
            <div class="field"><label for="s-need">Hitaji unalotaka kusaidia <span lang="en">/ Need you want to help with</span></label>
              <select id="s-need" name="need_reference" required><option value="">Chagua / Select one</option>${needOptions}${youthOptions}<option value="general">Sijachagua, naomba kuzungumza / Not sure yet, I would like to talk</option></select></div>
          </div>
          <div class="form-row"><div class="field"><label for="s-msg">Ujumbe wako <span lang="en">/ Your message</span></label><textarea id="s-msg" name="message" required placeholder="Unaweza kutoa nini, na lini? / What can you offer, and when?"></textarea></div></div>
          <div class="field field--honeypot" aria-hidden="true"><label for="s-gotcha">Leave this blank</label><input type="text" id="s-gotcha" name="_gotcha" tabindex="-1" autocomplete="off"></div>
          <div class="field field--check"><label for="s-agree"><input type="checkbox" id="s-agree" name="agreed_route" value="Yes" required> Naelewa kwamba msaada utapitia shirika mwenyeji na Elimu+, na sitawasiliana moja kwa moja na mmiliki wa biashara au kijana. <span lang="en">/ I understand that help goes through the host organisation and Elimu+, and that I will not contact the business owner or young person directly.</span></label></div>
          <p class="form-privacy">Tunatumia maelezo haya kuwasiliana nawe tu. Soma <a href="privacy.html">taarifa ya faragha</a>. <span lang="en">/ We use these details only to contact you. Read our privacy notice.</span></p>
          <button type="submit" class="btn btn--primary btn--block">Tuma Ofa Yangu <span lang="en">/ Send My Offer</span></button>
          <div class="form-feedback form-feedback--success" role="status">Asante. Tumepokea ofa yako na tutawasiliana nawe hivi karibuni. <span lang="en">/ Thank you. We have your offer and will be in touch soon.</span></div>
          <div class="form-feedback form-feedback--error" role="alert">Hitilafu imetokea. Tafadhali tutumie ujumbe kwa WhatsApp. <span lang="en">/ Something went wrong. Please message us on WhatsApp instead.</span></div>
        </form>
        <p class="form-direct-contact" style="max-width: 720px; margin-left: auto; margin-right: auto;">Elimu+ huorodhesha wahitimu waliochagua kuonekana hapa; hatuhakikishi bidhaa wala huduma za biashara yoyote. <span lang="en">/ Elimu+ lists graduates who have chosen to appear here; we do not guarantee any business's goods or services.</span></p>
      </div>
    </section>

  </main>
`;

const html = `<!DOCTYPE html>
<html lang="sw">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <!-- GENERATED by build-directory.js from directory-data/entries.json. Edit the data file and re-run the builder. -->
  <title>${esc(TITLE)}</title>
  <meta name="description" content="${esc(DESC)}">
${hasSample ? '  <meta name="robots" content="noindex, nofollow">\n' : ''}  <link rel="canonical" href="${SITE}/directory.html">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Elimu+">
  <meta property="og:title" content="${esc(TITLE)}">
  <meta property="og:description" content="${esc(DESC)}">
  <meta property="og:url" content="${SITE}/directory.html">
  <meta property="og:image" content="${IMG}">
  <meta property="og:image:type" content="image/jpeg">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:locale" content="sw_KE">
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
console.log('Built directory.html: ' + B.length + ' business(es), ' + N.length + ' need(s), ' + Y.length + ' youth concept(s)' + (hasSample ? ' [PREVIEW: contains sample entries, noindex]' : ''));
