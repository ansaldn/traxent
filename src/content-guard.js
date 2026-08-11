// ── Traxent content guard ───────────────────────────────────────────────────
// DETERRENCE, NOT PREVENTION — an honest note for future maintainers:
// browsers cannot block or detect OS-level screenshots/recordings (no API
// exists). What this file does, mirroring what Udemy/Coursera do for their
// non-video content:
//   1. FORENSIC WATERMARK (the piece with real teeth): a faint, repeating
//      overlay of the signed-in user's email + date across paid content, so
//      any leaked capture identifies the leaking account. Re-injected if
//      removed from the DOM.
//   2. Friction: text selection/copy/right-click/drag disabled on content,
//      print blanked, save-page and print shortcuts blocked.
// All of #2 is bypassable by anyone determined; the watermark is why this is
// still worth shipping. Load ONLY on paid-content pages:
//   <script src="/content-guard.js?v=__BUILD_SHA__" defer></script>
(function () {
  'use strict';

  var WM_ID = 'tx-guard-wm';
  var label = 'Licensed to a Traxent member';

  // ── 1. Forensic watermark ────────────────────────────────────────────────
  function watermarkURL(text) {
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="420" height="260">'
      + '<text x="10" y="140" font-family="monospace" font-size="13" fill="#0e0e0c" fill-opacity="0.055" transform="rotate(-28 210 130)">'
      + text.replace(/&/g, '&amp;').replace(/</g, '&lt;')
      + '</text></svg>';
    return 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '")';
  }

  function mountWatermark() {
    if (document.getElementById(WM_ID)) return;
    var el = document.createElement('div');
    el.id = WM_ID;
    el.setAttribute('aria-hidden', 'true');
    el.style.cssText = 'position:fixed;inset:0;z-index:2147483000;pointer-events:none;'
      + 'background-image:' + watermarkURL(label) + ';background-repeat:repeat;';
    document.body.appendChild(el);
  }

  function refreshWatermark() {
    var el = document.getElementById(WM_ID);
    if (el) el.style.backgroundImage = watermarkURL(label);
  }

  // Personalise as soon as the page's Auth0 client can say who this is.
  function personalise() {
    try {
      if (typeof auth0Client === 'undefined' || !auth0Client) return false;
      auth0Client.getUser().then(function (u) {
        if (u && (u.email || u.sub)) {
          label = (u.email || u.sub) + ' · ' + new Date().toISOString().slice(0, 10) + ' · traxent.io';
          refreshWatermark();
        }
      }).catch(function () {});
      return true;
    } catch (e) { return true; }
  }

  // ── 2. Copy / selection / print friction ────────────────────────────────
  function isFormField(el) {
    return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
  }

  function mountFriction() {
    var style = document.createElement('style');
    style.textContent =
      'body{-webkit-user-select:none;user-select:none}'
      + 'input,textarea,[contenteditable]{-webkit-user-select:text;user-select:text}'
      + '@media print{body>*{display:none !important}body::after{content:"This content is licensed to a single Traxent member and may not be printed or redistributed.";display:block;padding:40px;font-family:sans-serif}}';
    document.head.appendChild(style);

    ['contextmenu', 'copy', 'cut', 'dragstart'].forEach(function (evt) {
      document.addEventListener(evt, function (e) {
        if (!isFormField(e.target)) e.preventDefault();
      });
    });

    document.addEventListener('keydown', function (e) {
      var k = (e.key || '').toLowerCase();
      if ((e.ctrlKey || e.metaKey) && (k === 'p' || k === 's')) e.preventDefault();
    });
  }

  // ── boot ─────────────────────────────────────────────────────────────────
  function init() {
    mountWatermark();
    mountFriction();

    // Keep the watermark alive if someone deletes it via devtools.
    new MutationObserver(function () {
      if (!document.getElementById(WM_ID)) mountWatermark();
    }).observe(document.body, { childList: true });

    // Auth0 may not be ready yet — retry briefly until we can personalise.
    var tries = 0;
    var t = setInterval(function () {
      if (personalise() || ++tries > 40) clearInterval(t);
    }, 500);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
