/* =============================================================
   ELIMU+, MAIN SCRIPT
   Maintainer note (for Musa): This file has no dependencies -
   no jQuery, no libraries. Each numbered block below is
   independent, so you can read them one at a time.
   ============================================================= */

document.addEventListener('DOMContentLoaded', function () {
  /* Cohort cards on the Join page come from the portal: only listings a founder has published. If the portal cannot be reached,
     or has nothing published, the cards already in the page stay as they are. */
  (function () {
    var box = document.getElementById('cohort-cards');
    if (!box || !window.fetch) return;
    fetch('https://portal.elimuplus.com/api/website/cohorts', { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        var nf = data && data.next_forum, nfEl = document.getElementById('next-forum');
        if (nf && nfEl) nfEl.textContent = 'Our next forum is on ' + String(nf) + '. Partner organisations and past participants will also be told directly.';
        var list = data && data.cohorts;
        if (!list || !list.length) return;
        var frag = document.createDocumentFragment();
        list.forEach(function (c) {
          var card = document.createElement('article'); card.className = 'card';
          [['span', 'card__badge', c.badge], ['h3', '', c.heading], ['p', '', c.blurb], ['p', 'cohort-date', c.date_note]].forEach(function (x) {
            var el = document.createElement(x[0]); if (x[1]) el.className = x[1]; el.textContent = String(x[2] || ''); card.appendChild(el);
          });
          frag.appendChild(card);
        });
        box.textContent = ''; box.appendChild(frag);
      })
      .catch(function () {});
  })();


  /* Count-up numbers: the big figures (home, programme, partner, blog) count up to their real value the first time they scroll into view.
     Only the first number in each figure moves ("8 of 10" counts the 8; "KES 213,190" counts the 213,190). Without JavaScript, or with
     "reduce motion" switched on, the real figure is shown straight away. */
  (function () {
    if (!('IntersectionObserver' in window) || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)) return;
    var items = [];
    document.querySelectorAll('.proof-stat__number, .fx-stat b').forEach(function (el) {
      var w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT), n;
      while ((n = w.nextNode())) {
        var m = /\d[\d,]*/.exec(n.nodeValue);
        if (m) { items.push({ el: el, node: n, pre: n.nodeValue.slice(0, m.index), post: n.nodeValue.slice(m.index + m[0].length), target: parseInt(m[0].replace(/,/g, ''), 10), commas: m[0].indexOf(',') > -1 }); break; }
      }
    });
    if (!items.length) return;
    var fmt = function (it, v) { return it.pre + (it.commas ? v.toLocaleString('en-US') : String(v)) + it.post; };
    items.forEach(function (it) { it.el.style.fontVariantNumeric = 'tabular-nums'; it.node.nodeValue = fmt(it, 0); });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        io.unobserve(e.target);
        var it = items.filter(function (x) { return x.el === e.target; })[0], t0 = null, dur = 1600;
        if (!it) return;
        (function step(ts) {
          if (t0 === null) t0 = ts;
          var p = Math.min((ts - t0) / dur, 1), eased = 1 - Math.pow(1 - p, 3);
          it.node.nodeValue = fmt(it, Math.round(it.target * eased));
          if (p < 1) requestAnimationFrame(step);
        })(performance.now());
      });
    }, { threshold: 0.4 });
    items.forEach(function (it) { io.observe(it.el); });
  })();

  initMobileNav();
  initStickyNavbar();
  initFormspreeForms();
  initSmoothScroll();
  initLazyLoadFallback();
  initActiveNavLink();
});

/* -------------------------------------------------------------
   1. MOBILE NAVIGATION TOGGLE
   Opens/closes the hamburger menu on small screens.
   ------------------------------------------------------------- */
function initMobileNav() {
  var toggle = document.querySelector('.navbar__toggle');
  var panel = document.querySelector('.navbar__mobile-panel');

  if (!toggle || !panel) return;

  toggle.addEventListener('click', function () {
    var isOpen = panel.classList.toggle('open');
    toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  });

  // Close the menu automatically when a link inside it is tapped
  panel.querySelectorAll('a').forEach(function (link) {
    link.addEventListener('click', function () {
      panel.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
    });
  });
}

/* -------------------------------------------------------------
   2. STICKY NAVBAR ON SCROLL
   Adds a "scrolled" class after 80px so the bar can shrink
   slightly and gain a shadow, see .navbar.scrolled in styles.css
   ------------------------------------------------------------- */
function initStickyNavbar() {
  var navbar = document.querySelector('.navbar');
  if (!navbar) return;

  function updateNavbarState() {
    if (window.scrollY > 80) {
      navbar.classList.add('scrolled');
    } else {
      navbar.classList.remove('scrolled');
    }
  }

  updateNavbarState();
  window.addEventListener('scroll', updateNavbarState, { passive: true });
}

/* -------------------------------------------------------------
   3. FORMSPREE FORM SUBMISSION HANDLER
   Applies to every <form class="js-form"> on the site: partner
   enquiry, trainer expression of interest, and the about-page
   contact form. Intercepts submit, posts to Formspree via fetch,
   and shows a success/error message without reloading the page.
   ------------------------------------------------------------- */
function initFormspreeForms() {
  var forms = document.querySelectorAll('.js-form');

  forms.forEach(function (form) {
    form.addEventListener('submit', function (event) {
      event.preventDefault();

      // novalidate is on the <form> so the browser won't block submission
      // on its own; enforce required fields ourselves before sending.
      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }

      var successEl = form.querySelector('.form-feedback--success');
      var errorEl = form.querySelector('.form-feedback--error');
      var submitBtn = form.querySelector('button[type="submit"]');

      // Honeypot check, if the hidden field has a value, silently
      // pretend success and stop. Real visitors never fill this in.
      var honeypot = form.querySelector('input[name="_gotcha"]');
      if (honeypot && honeypot.value) {
        if (successEl) successEl.classList.add('visible');
        form.reset();
        return;
      }

      if (successEl) successEl.classList.remove('visible');
      if (errorEl) errorEl.classList.remove('visible');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.dataset.originalText = submitBtn.textContent;
        submitBtn.textContent = 'Sending…';
      }

      fetch(form.action, {
        method: 'POST',
        body: new FormData(form),
        headers: { Accept: 'application/json' }
      })
        .then(function (response) {
          if (response.ok) {
            /* Newsletter list: only with explicit consent (the newsletter form's required
               checkbox, or the optional opt-in tick on registration forms). Fire and forget. */
            var optEl = form.querySelector('input[name="consent"], input[name="newsletter_optin"]');
            var subEmail = form.querySelector('input[name="email"]');
            if (optEl && optEl.checked && subEmail && subEmail.value) {
              var subName = form.querySelector('input[name="name"], input[name="contact_person"], input[name="full_name"]');
              var src = form.getAttribute('data-confirm') || (form.getAttribute('data-source') || 'newsletter');
              fetch('/api/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: subEmail.value, name: subName ? subName.value : '', consent: 'yes', source: src })
              }).catch(function () {});
            }
            /* Copy of the form for the portal's Website enquiries list (trainer, organisation, partner and quote forms). Fire and forget. */
            var subj = form.querySelector('input[name="_subject"]');
            if (subj && /Trainer expression|Organisation registration|Partner enquiry|Quote request|Mentor application/.test(subj.value)) {
              fetch('https://portal.elimuplus.com/api/enquiries', { method: 'POST', body: new FormData(form) }).catch(function () {});
            }
            var kind = form.getAttribute('data-confirm');
            if (kind) {
              /* Fire-and-forget acknowledgement email; the form itself has already succeeded. */
              var emailEl = form.querySelector('input[name="email"]');
              var nameEl = form.querySelector('input[name="contact_person"], input[name="full_name"]');
              var orgEl = form.querySelector('input[name="organisation_name"]');
              if (emailEl && emailEl.value) {
                var c = new FormData();
                c.append('kind', kind);
                c.append('email', emailEl.value);
                c.append('name', nameEl ? nameEl.value : '');
                c.append('organisation', orgEl ? orgEl.value : '');
                fetch('https://portal.elimuplus.com/api/notify/confirm', { method: 'POST', body: c }).catch(function () {});
              }
            }
            if (successEl) successEl.classList.add('visible');
            form.reset();
          } else {
            if (errorEl) errorEl.classList.add('visible');
          }
        })
        .catch(function () {
          if (errorEl) errorEl.classList.add('visible');
        })
        .finally(function () {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = submitBtn.dataset.originalText;
          }
        });
    });
  });
}

/* -------------------------------------------------------------
   4. SMOOTH SCROLL FOR ANCHOR LINKS
   Handles links like href="about.html#contact" when already on
   the target page (href="#contact").
   ------------------------------------------------------------- */
function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach(function (link) {
    link.addEventListener('click', function (event) {
      var targetId = link.getAttribute('href').slice(1);
      var target = document.getElementById(targetId);
      if (!target) return;
      event.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
}

/* -------------------------------------------------------------
   5. LAZY LOAD FALLBACK
   Modern browsers honour loading="lazy" natively. This is a
   light fallback for older browsers using IntersectionObserver.
   ------------------------------------------------------------- */
function initLazyLoadFallback() {
  var supportsNativeLazy = 'loading' in HTMLImageElement.prototype;
  if (supportsNativeLazy) return;

  var lazyImages = document.querySelectorAll('img[loading="lazy"]');
  if (!('IntersectionObserver' in window)) return;

  var observer = new IntersectionObserver(function (entries, obs) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        var img = entry.target;
        if (img.dataset.src) {
          img.src = img.dataset.src;
        }
        obs.unobserve(img);
      }
    });
  });

  lazyImages.forEach(function (img) {
    observer.observe(img);
  });
}

/* -------------------------------------------------------------
   6. ACTIVE NAV LINK DETECTION
   Highlights the link matching the current page in both the
   desktop nav and the mobile panel.
   ------------------------------------------------------------- */
function initActiveNavLink() {
  // Addresses carry no .html (clean URLs); compare pages by name, with the home page as an empty name.
  var norm = function (p) { return p.replace(/^(\.\.\/|\.\/|\/)+/, '').replace(/\.html$/, '').replace(/\/$/, '').replace(/^index$/, ''); };
  var currentPage = norm(window.location.pathname.split('/').pop() || '');

  document.querySelectorAll('.navbar__links a, .navbar__mobile-panel a').forEach(function (link) {
    var linkPage = norm(link.getAttribute('href').split('#')[0]);
    if (linkPage === currentPage) {
      link.classList.add('active');
    }
  });
}

// <!-- PHASE 2: Add CRM webhook on form success -->
// <!-- PHASE 2: Add WhatsApp notification trigger on lead capture -->
// <!-- PHASE 3: Add auth check for trainer portal link in navbar -->
