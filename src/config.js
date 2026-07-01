// ── Traxent shared site config — SINGLE SOURCE OF TRUTH ──────────────────────
// Centralises the small set of values that repeat across the site and change
// over time. Update them HERE and they propagate to every element that opts in
// with a `data-tx="<key>"` attribute.
//
// How it works (static-site friendly, no build step):
//   <span data-tx="firmCount">16</span>
//   ...the number between the tags is the FALLBACK shown if JS is slow/blocked.
//   On load, this script overwrites it with TRAXENT_CONFIG[key]. Because the
//   fallback is the current correct value, the page is correct either way —
//   content never blanks out.
//
// Only textContent is injected (never HTML), so this can't introduce markup/XSS.
// Loaded via: <script src="/config.js" defer></script>  (allowed by CSP 'self').
//
// NOTE: SEO/meta tags, <title>, JSON-LD and mailto: hrefs intentionally keep
// literal values (crawlers must see them without JS); treat the values below as
// the canonical source and update those literals in step when they change.
(function () {
  'use strict';

  var CONFIG = {
    companyName: 'Akpan Holdings Limited',
    productName: 'Traxent',
    moduleCount: '10',  // 3 free foundational (Trading 101/201/301) + 7 core modules (src/learn-module-*.html)
    firmCount: '16',    // prop firms with a rules page (count of src/firm-*.html)
    contactEmail: 'hello@traxent.io',
    securityEmail: 'security@traxent.io',
    copyrightYear: '2026'
  };

  // Expose for any inline/other script that wants a value programmatically.
  window.TRAXENT_CONFIG = CONFIG;

  function apply() {
    var nodes = document.querySelectorAll('[data-tx]');
    for (var i = 0; i < nodes.length; i++) {
      var key = nodes[i].getAttribute('data-tx');
      if (key && Object.prototype.hasOwnProperty.call(CONFIG, key)) {
        var val = CONFIG[key];
        if (val !== '' && val != null) nodes[i].textContent = val;
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', apply);
  } else {
    apply();
  }
})();
