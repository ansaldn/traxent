// ── Traxent launch state ────────────────────────────────────────────────────
// One place that answers "which phase is the site in right now?", so pages
// don't each re-implement flag checks and drift apart.
//
// Three states, each a superset of the last:
//
//   'preview'    nothing open — the pre-prelaunch holding state
//   'prelaunch'  email capture → instant invite email → /signup
//   'launched'   accounts front and centre; the nav CTA is Sign up
//
// Driven by /flags.json via flags.js, so the 24 August transition happens on
// its own with nothing deployed that morning. Fails CLOSED: if flags.json
// can't be fetched we report 'preview', which shows the most conservative
// copy rather than promising something that isn't live.
//
// Usage:
//   <script src="/flags.js?v=__BUILD_SHA__"></script>
//   <script src="/launch-state.js?v=__BUILD_SHA__"></script>
//   TraxentLaunch.ready().then(function (state) { ... });
//
// Or declaratively, with no JS per page:
//   <div data-launch="prelaunch">…shown only during prelaunch…</div>
//   <div data-launch="launched">…shown only after launch…</div>
//   <div data-launch="prelaunch launched">…shown in either…</div>
//
// Elements carrying data-launch start hidden via the CSS below, so there is no
// flash of the wrong state before the flags land.

(function (global) {
  'use strict';

  var _state = null;
  var _promise = null;

  // Everything goes through `global.` rather than the bare identifier. Both
  // resolve to the same thing in a browser, but mixing the two is how you get
  // a ReferenceError the moment this runs anywhere else — a test harness, a
  // module scope, a future bundler.
  function compute() {
    var flags = global.TraxentFlags;
    if (!flags) return 'preview';
    if (flags.isEnabled('fullLaunch')) return 'launched';
    // waitlistOpen is the deprecated predecessor of prelaunchOpen; honoured so
    // a stale cached flags.json can't drop the site back to 'preview'.
    if (flags.isEnabled('prelaunchOpen') || flags.isEnabled('waitlistOpen')) return 'prelaunch';
    return 'preview';
  }

  /** Reveal every [data-launch] element whose list includes the current state. */
  function apply(state) {
    var nodes = document.querySelectorAll('[data-launch]');
    for (var i = 0; i < nodes.length; i++) {
      var want = (nodes[i].getAttribute('data-launch') || '').split(/\s+/);
      var show = want.indexOf(state) !== -1;
      nodes[i].style.display = show ? '' : 'none';
      // Belt and braces: hidden content is also removed from the a11y tree and
      // from tab order, so a screen reader never announces the wrong phase.
      if (show) nodes[i].removeAttribute('aria-hidden');
      else nodes[i].setAttribute('aria-hidden', 'true');
    }
    document.documentElement.setAttribute('data-launch-state', state);
  }

  var TraxentLaunch = {
    /** Resolves to the current state once flags have loaded. */
    ready: function () {
      if (_promise) return _promise;
      _promise = Promise.resolve(global.TraxentFlags ? global.TraxentFlags.load() : null)
        .then(function () {
          _state = compute();
          if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', function () { apply(_state); });
          } else {
            apply(_state);
          }
          return _state;
        })
        .catch(function () {
          _state = 'preview';
          apply(_state);
          return _state;
        });
      return _promise;
    },

    /** Current state, or null before ready() resolves. */
    state: function () { return _state; },

    is: function (name) { return _state === name; },

    /** True once accounts are the primary call to action. */
    launched: function () { return _state === 'launched'; },

    /**
     * Whether paid plans can actually be bought.
     *
     * Separate from the launch state on purpose. The site goes live on 24 Aug
     * with free accounts; the paid tiers open when real-trade sync exists,
     * because that feature is what Challenger and Funded Trader are sold on.
     * Selling a plan whose headline feature doesn't work is worse than not
     * selling it yet.
     */
    paidPlansOpen: function () {
      var flags = global.TraxentFlags;
      return !!(flags && flags.isEnabled('paidPlansOpen'));
    },
  };

  // Hide gated content until we know the state — prevents a flash of the wrong
  // phase. Injected rather than living in each page's stylesheet so a page can
  // never forget it.
  var style = document.createElement('style');
  style.textContent = '[data-launch]{display:none}';
  (document.head || document.documentElement).appendChild(style);

  global.TraxentLaunch = TraxentLaunch;
  TraxentLaunch.ready();
})(typeof window !== 'undefined' ? window : this);
