// ── Traxent cookie / storage consent ────────────────────────────────────────
// A lightweight, accessible consent + transparency banner.
//
// What Traxent actually stores:
//   • Essential (no consent needed): Auth0 login session, the `tx_session`
//     routing hint, PWA/service-worker cache. Required for the site to work.
//   • Analytics: privacy-first and COOKIELESS (no personal data, no cross-site
//     tracking) — so it's consent-exempt under UK GDPR/PECR. We still disclose it.
//
// Because we use no non-essential cookies today, this is a NOTICE (not a hard
// opt-in wall). But it records the choice and exposes TraxentConsent.allowed(cat)
// so we can gate any future non-essential cookies (e.g. ads) behind real consent.
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
    saveChoice(choice);
    if (el && el.parentNode) el.parentNode.removeChild(el);
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
    txt.innerHTML = 'We use <strong>essential</strong> storage to keep you signed in and the site secure, '
      + 'plus <strong>privacy-friendly, cookieless analytics</strong> (no personal data, no cross-site tracking). '
      + 'See our <a href="/privacy#cookies" style="color:#4ade80;text-decoration:underline">Privacy &amp; Cookies</a>.';

    var btns = document.createElement('div');
    btns.style.cssText = 'display:flex;gap:8px;flex-shrink:0';

    var manage = document.createElement('a');
    manage.href = '/privacy#cookies';
    manage.textContent = 'Manage';
    manage.style.cssText = 'padding:9px 16px;border-radius:8px;border:1px solid rgba(255,255,255,.2);color:#fff;text-decoration:none;font-weight:500;font-size:13px';

    var ok = document.createElement('button');
    ok.type = 'button';
    ok.textContent = 'Got it';
    ok.style.cssText = 'padding:9px 18px;border-radius:8px;border:none;background:#0a6e4f;color:#fff;font-weight:500;font-size:13px;cursor:pointer;font-family:inherit';
    ok.addEventListener('click', function () { dismiss('accepted', bar); });

    btns.appendChild(manage);
    btns.appendChild(ok);
    bar.appendChild(txt);
    bar.appendChild(btns);

    function attach() { if (document.body) document.body.appendChild(bar); }
    if (document.body) attach(); else document.addEventListener('DOMContentLoaded', attach);
  }

  render(false);
})();
