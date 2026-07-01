// ── Traxent cookie / storage consent ────────────────────────────────────────
// A lightweight, accessible consent + transparency banner.
//
// What Traxent actually stores:
//   • Essential (no consent needed): Auth0 login session, the `tx_session`
//     routing hint, PWA/service-worker cache. Required for the site to work.
//   • Analytics: privacy-first and COOKIELESS (no personal data, no cross-site
//     tracking) — so it's consent-exempt under UK GDPR/PECR. We still disclose it.
//
// Marketing cookies (Meta Pixel) ARE used now, gated behind real consent — so this
// is an opt-in: Accept loads the pixel, Reject keeps TraxentConsent.allowed('marketing')
// false so it never loads. Essential storage + cookieless analytics are always on.
//
// Load on every page: <script src="/consent.js" defer></script>

(function () {
  'use strict';
  var KEY = 'tx_consent_v1';

  function readChoice() {
    try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; }
  }
  function saveChoice(c) {
    try { localStorage.setItem(KEY, JSON.stringify({ choice: c, ts: new Date().toISOString() })); } catch (e) {}
  }

  // Public API for future non-essential categories (e.g. 'marketing').
  window.TraxentConsent = {
    allowed: function (category) {
      if (category === 'essential' || category === 'analytics') return true; // exempt
      var c = readChoice();
      return !!(c && c.choice === 'accepted');
    },
    reopen: function () { render(true); }
  };

  function dismiss(choice, el) {
    var prev = readChoice();
    saveChoice(choice);
    if (el && el.parentNode) el.parentNode.removeChild(el);
    // Withdrawing consent after the pixel had loaded: reload so Meta's pixel
    // stops immediately (it can't be fully torn down in-page once initialised).
    if (choice === 'rejected' && prev && prev.choice === 'accepted' && window.fbq) {
      try { location.reload(); } catch (e) {}
    }
  }

  function render(force) {
    if (!force && readChoice()) return; // already decided
    if (document.getElementById('tx-consent')) return;

    var bar = document.createElement('div');
    bar.id = 'tx-consent';
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', 'Cookie notice');
    bar.style.cssText = [
      'position:fixed', 'left:16px', 'right:16px', 'bottom:16px', 'z-index:2147483000',
      'max-width:760px', 'margin:0 auto', 'background:#0e0e0c', 'color:#fff',
      'border:1px solid rgba(255,255,255,.12)', 'border-radius:14px',
      'box-shadow:0 16px 48px rgba(0,0,0,.35)', 'padding:18px 20px',
      'font-family:Geist,system-ui,sans-serif', 'font-size:13.5px', 'line-height:1.55',
      'display:flex', 'gap:16px', 'align-items:center', 'flex-wrap:wrap'
    ].join(';');

    var txt = document.createElement('div');
    txt.style.cssText = 'flex:1;min-width:240px;color:rgba(255,255,255,.82)';
    txt.innerHTML = 'We use <strong>essential</strong> storage to keep you signed in, plus <strong>cookieless analytics</strong>. '
      + 'With your consent we also use <strong>advertising cookies</strong> (Meta Pixel) to measure our marketing, which involves cross-site tracking. '
      + 'Reject and we won\'t load them. See our <a href="/privacy#cookies" style="color:#4ade80;text-decoration:underline">Privacy &amp; Cookies</a>.';

    var btns = document.createElement('div');
    btns.style.cssText = 'display:flex;gap:8px;flex-shrink:0';

    var reject = document.createElement('button');
    reject.type = 'button';
    reject.textContent = 'Reject';
    reject.style.cssText = 'padding:9px 18px;border-radius:8px;border:1px solid rgba(255,255,255,.28);background:transparent;color:#fff;font-weight:500;font-size:13px;cursor:pointer;font-family:inherit';
    reject.addEventListener('click', function () { dismiss('rejected', bar); });

    var accept = document.createElement('button');
    accept.type = 'button';
    accept.textContent = 'Accept';
    accept.style.cssText = 'padding:9px 18px;border-radius:8px;border:none;background:#0a6e4f;color:#fff;font-weight:500;font-size:13px;cursor:pointer;font-family:inherit';
    accept.addEventListener('click', function () { dismiss('accepted', bar); loadMetaPixel(); });

    btns.appendChild(reject);
    btns.appendChild(accept);
    bar.appendChild(txt);
    bar.appendChild(btns);

    function attach() { if (document.body) document.body.appendChild(bar); }
    if (document.body) attach(); else document.addEventListener('DOMContentLoaded', attach);
  }

  // ── Meta Pixel (marketing — consent-gated) ────────────────────────────────
  // Loads ONLY after the visitor allows the 'marketing' category, so it can
  // never fire before consent. Deliberately NO <noscript> fallback: without JS
  // we can't obtain consent, so we must not track. Disclose at /privacy#cookies.
  var META_PIXEL_ID = '1383366740521692';
  function loadMetaPixel() {
    if (window.fbq || !window.TraxentConsent.allowed('marketing')) return;
    !function (f, b, e, v, n, t, s) {
      if (f.fbq) return;
      n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
      if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = [];
      t = b.createElement(e); t.async = !0; t.src = v;
      s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
    }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
    window.fbq('init', META_PIXEL_ID);
    window.fbq('track', 'PageView');
  }

  // Let any "Cookie settings" control reopen the banner so visitors can change
  // or withdraw consent at any time (as the privacy policy promises). Add a
  // trigger anywhere: <a href="#cookie-settings">Cookie settings</a> or any
  // element with a [data-cookie-settings] attribute.
  document.addEventListener('click', function (e) {
    var t = (e.target && e.target.closest) ? e.target.closest('a[href="#cookie-settings"],[data-cookie-settings]') : null;
    if (t) { e.preventDefault(); render(true); }
  });

  render(false);
  loadMetaPixel(); // returning visitors who already consented
})();
