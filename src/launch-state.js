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
// its own with nothing deployed that morning.
//
// Fails SAFE, not closed: if flags can't be read we show 'prelaunch', because
// hiding the email capture form costs every visitor in that window while
// showing it costs nothing. 'launched' is the one state that is strictly
// gated — it only ever comes from a flag we genuinely read.
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
  var _realState = null;   // the flag-derived state, so preview() can restore it

  // The default when we can't tell.
  //
  // Originally 'preview', which hides everything — chosen so the site could
  // never promise something that wasn't live. That was the wrong trade and it
  // took the signup form off the homepage: any hiccup loading flags.js or
  // flags.json, a stale service-worker entry, an offline moment, and every
  // [data-launch] block stayed hidden.
  //
  // The two failure costs are not symmetric. Showing an email capture box when
  // we're unsure costs nothing — the address is still valid and the API still
  // stores it. Hiding it costs every visitor in that window, silently.
  //
  // 'launched' remains strictly gated: it is only ever reached by a real,
  // successfully-read flag, because that state does make promises (buyable
  // plans, a live product) that must not appear early.
  var FALLBACK = 'prelaunch';

  function compute(loaded) {
    var flags = global.TraxentFlags;
    if (!flags) return FALLBACK;

    // flags.js swallows a failed fetch and resolves with an EMPTY map, so a
    // network failure is indistinguishable from "every flag is off" unless we
    // look at the map itself. This is what actually took the signup form off
    // the homepage: flags.json didn't load, every isEnabled() answered false,
    // and compute() confidently returned 'preview'.
    //
    // An empty map is never a real answer here — flags.json always ships with
    // flags in it — so treat it as no data rather than as all-off.
    if (!loaded || typeof loaded !== 'object' || Object.keys(loaded).length === 0) {
      if (global.console && console.warn) {
        console.warn('[TraxentLaunch] flags.json unreadable or empty — showing ' + FALLBACK);
      }
      return FALLBACK;
    }

    if (flags.isEnabled('fullLaunch')) return 'launched';
    // waitlistOpen is the deprecated predecessor of prelaunchOpen; honoured so
    // a stale cached flags.json can't change what's on screen.
    if (flags.isEnabled('prelaunchOpen') || flags.isEnabled('waitlistOpen')) return 'prelaunch';
    // Every flag explicitly off is a real answer, not a failure — respect it.
    return 'preview';
  }

  /**
   * Reveal every [data-launch] element whose list includes the current state.
   *
   * Shows by setting data-launch-show, NOT by clearing style.display.
   *
   * The first version did `style.display = show ? '' : 'none'`. Setting it to
   * '' removes the inline declaration — which hands the cascade straight back
   * to the injected `[data-launch]{display:none}` rule below, so the element
   * stayed hidden. That silently removed the signup form from the homepage.
   *
   * An attribute works where an inline style can't, because the element then
   * uses its own natural display value (flex, block, inline-block) rather than
   * one this code has to guess.
   */
  function apply(state) {
    var nodes = document.querySelectorAll('[data-launch]');
    for (var i = 0; i < nodes.length; i++) {
      var want = (nodes[i].getAttribute('data-launch') || '').split(/\s+/);
      var show = want.indexOf(state) !== -1;
      if (show) nodes[i].setAttribute('data-launch-show', '');
      else nodes[i].removeAttribute('data-launch-show');
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
        .then(function (loaded) {
          _state = _realState = compute(loaded);
          if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', function () { apply(_state); });
          } else {
            apply(_state);
          }
          return _state;
        })
        .catch(function () {
          // Same reasoning as FALLBACK: a failed fetch is not evidence that
          // prelaunch is closed, so don't behave as though it is.
          _state = FALLBACK;
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

    /**
     * Test hook: render the page as a given state, without touching flags.json.
     *
     *   TraxentLaunch.preview('launched')   // see 24 August today
     *   TraxentLaunch.preview()             // back to the real state
     *
     * Purely visual and purely local — it changes nothing on the server and
     * survives only until reload. The point is to check the launch morning
     * looks right well before the launch morning, without deploying a flag
     * change to the live site and hoping you remember to put it back.
     */
    preview: function (state) {
      // No argument restores the REAL state, cached when the flags resolved.
      // Recomputing here can't work — flags.js keeps its map private, so
      // compute() would see undefined and answer FALLBACK, which only looks
      // correct while FALLBACK happens to match reality.
      var next = state || _realState;
      _state = next || FALLBACK;
      apply(_state);
      return _state;
    },
  };

  // Hide gated content until we know the state — prevents a flash of the wrong
  // phase. Injected rather than living in each page's stylesheet so a page can
  // never forget it.
  var style = document.createElement('style');
  style.textContent = '[data-launch]:not([data-launch-show]){display:none}';
  (document.head || document.documentElement).appendChild(style);

  global.TraxentLaunch = TraxentLaunch;
  TraxentLaunch.ready();

  // Watchdog. ready() covers a fetch that fails; this covers one that never
  // settles — a hung connection, a blocked script, an extension eating the
  // request. Without it the injected [data-launch]{display:none} keeps the page
  // blank indefinitely, which is exactly how the homepage lost its signup form.
  //
  // 2s is past a normal load and well inside how long someone will wait.
  setTimeout(function () {
    if (_state === null) {
      if (global.console && console.warn) {
        console.warn('[TraxentLaunch] flags did not resolve in 2s — showing ' + FALLBACK);
      }
      _state = FALLBACK;
      apply(_state);
    }
  }, 2000);
})(typeof window !== 'undefined' ? window : this);
