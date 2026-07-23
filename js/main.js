/* =============================================================
   ELIMU+ — MAIN SCRIPT
   Maintainer note (for Musa): This file has no dependencies —
   no jQuery, no libraries. Each numbered block below is
   independent, so you can read them one at a time.
   ============================================================= */

document.addEventListener('DOMContentLoaded', function () {
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
   slightly and gain a shadow — see .navbar.scrolled in styles.css
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

      var successEl = form.querySelector('.form-feedback--success');
      var errorEl = form.querySelector('.form-feedback--error');
      var submitBtn = form.querySelector('button[type="submit"]');

      // Honeypot check — if the hidden field has a value, silently
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
  var currentPage = window.location.pathname.split('/').pop() || 'index.html';

  document.querySelectorAll('.navbar__links a, .navbar__mobile-panel a').forEach(function (link) {
    var linkPage = link.getAttribute('href').split('#')[0];
    if (linkPage === currentPage) {
      link.classList.add('active');
    }
  });
}

// <!-- PHASE 2: Add CRM webhook on form success -->
// <!-- PHASE 2: Add WhatsApp notification trigger on lead capture -->
// <!-- PHASE 3: Add auth check for trainer portal link in navbar -->
