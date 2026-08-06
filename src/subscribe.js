// ── Traxent waitlist signup — shared client ─────────────────────────────────
// One module behind every signup form on the site. Replaces the four separate
// copies of the old Formspree fetch (waitlist page, home hero, home launch
// banner, /open).
//
// Posts to our own API (backend/user-data/functions/subscribe), which owns the
// subscriber record in DynamoDB and mirrors the contact into Resend.
//
// The important behavioural change: this NEVER shows success unless the server
// actually confirmed it. The old code did `.catch(() => showSuccess())` with a
// comment reading "show success anyway for demo" — so if the request failed,
// the person was told they were on the list and their address was lost. Every
// one of those was a subscriber we'd never know we didn't have.
//
// Loaded via: <script src="/subscribe.js?v=__BUILD_SHA__"></script>

(function () {
  'use strict';

  // Same HTTP API as userdata.js. Kept independent so the signup forms work on
  // pages that don't load the (larger, auth-aware) userdata module.
  var API = 'https://gqway1e53f.execute-api.eu-west-2.amazonaws.com';

  // Mirrors the server-side check in functions/subscribe/email.mjs. This is a
  // convenience so people get instant feedback — the server still validates.
  var EMAIL_RE = /^[^\s@,;:<>()[\]\\"]+@[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;

  function isValidEmail(email) {
    return typeof email === 'string' && email.length <= 254 && EMAIL_RE.test(email);
  }

  /** Traffic-source attribution, captured on every signup. */
  function attribution() {
    var q = new URLSearchParams(location.search);
    return {
      utm_source: q.get('utm_source') || '',
      utm_medium: q.get('utm_medium') || '',
      utm_campaign: q.get('utm_campaign') || '',
      utm_content: q.get('utm_content') || '',
      referrer: document.referrer || '',
      landing_path: location.pathname
    };
  }

  /**
   * Submit a signup.
   * @param {string} email
   * @param {string} source   which form this came from, e.g. 'waitlist-page'
   * @param {string} [honeypot]  value of the hidden bot-trap field
   * @returns {Promise<{ok: boolean, message: string, retryable: boolean}>}
   *          Resolves — never rejects. `ok` is true only if the server stored it.
   */
  function submit(email, source, honeypot) {
    var payload = { email: email, source: source, website: honeypot || '' };
    var attr = attribution();
    for (var k in attr) payload[k] = attr[k];

    return fetch(API + '/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (body) {
        if (r.ok && body && body.ok) {
          return { ok: true, message: "You're on the list — we'll be in touch soon", retryable: false };
        }
        if (r.status === 429) {
          return { ok: false, retryable: true, message: body.message || 'Too many attempts. Please try again shortly.' };
        }
        if (r.status === 400) {
          return { ok: false, retryable: false, message: body.message || 'Please enter a valid email address.' };
        }
        return { ok: false, retryable: true, message: "Couldn't save your details just then. Please try again." };
      });
    }).catch(function () {
      // Network failure, offline, blocked by an extension. Say so — do not
      // pretend it worked.
      return {
        ok: false,
        retryable: true,
        message: "Couldn't reach us — check your connection and try again."
      };
    });
  }

  /**
   * Wire up a form. Handles validation, the in-flight state, success reveal
   * and error reporting, so each page only has to name its elements.
   *
   * @param {object} o
   * @param {string} o.formId       element hidden on success
   * @param {string} o.inputId      the email <input>
   * @param {string} o.successId    element revealed on success
   * @param {string} o.source       label recorded against the signup
   * @param {string} [o.honeypotId] hidden bot-trap input
   * @param {string[]} [o.alsoHide] extra element selectors to hide on success
   * @param {function} o.toast      (message, isSuccess) => void
   */
  function wire(o) {
    var input = document.getElementById(o.inputId);
    if (!input) return;
    var form = document.getElementById(o.formId);
    var success = document.getElementById(o.successId);
    var button = form ? form.querySelector('button[type="submit"], button') : null;
    var busy = false;

    function finish(result) {
      busy = false;
      if (button) { button.disabled = false; button.textContent = button.dataset.label || button.textContent; }
      if (!result.ok) { o.toast(result.message, false); return; }
      if (form) form.style.display = 'none';
      (o.alsoHide || []).forEach(function (sel) {
        var el = document.querySelector(sel);
        if (el) el.style.display = 'none';
      });
      if (success) success.style.display = 'block';
      o.toast(result.message, true);
    }

    function go(e) {
      if (e && e.preventDefault) e.preventDefault();
      if (busy) return;
      var email = (input.value || '').trim();
      if (!isValidEmail(email)) { o.toast('Please enter a valid email address', false); return; }

      busy = true;
      if (button) {
        button.dataset.label = button.dataset.label || button.textContent;
        button.disabled = true;
        button.textContent = 'Joining…';
      }

      var hp = o.honeypotId ? (document.getElementById(o.honeypotId) || {}).value : '';
      submit(email, o.source, hp).then(finish);
    }

    if (form) form.addEventListener('submit', go);
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(e); });
    if (button && (!form || form.tagName !== 'FORM')) button.addEventListener('click', go);
    return go;
  }

  window.TraxentSubscribe = { submit: submit, wire: wire, isValidEmail: isValidEmail, apiBase: function () { return API; } };
})();
