/* flags.js — tiny client-side feature-flag helper for the Traxent site.
 * -----------------------------------------------------------------------------
 * Dependency-free. Exposes a global `TraxentFlags`.
 *
 * Usage:
 *   <script src="/flags.js"></script>
 *   <script>
 *     (async () => {
 *       await TraxentFlags.load();                  // fetch + cache /flags.json
 *       if (TraxentFlags.isEnabled('newDashboardBanner')) {
 *         // reveal the gated UI
 *       }
 *     })();
 *   </script>
 *
 * A flag is ON when:
 *   - its `enabled` is exactly true, OR
 *   - its `launchAt` is set and that UTC time is now in the past.
 *
 * IMPORTANT: flags.json is public (it ships in src/). Use flags for SOFT
 * reveals only — never gate secret content on a client flag, since the JSON
 * (including future launchAt times) is visible to anyone.
 *
 * Failure behavior: if /flags.json can't be fetched or is malformed, every
 * flag is treated as OFF (fail-closed), and load() resolves without throwing.
 * -----------------------------------------------------------------------------
 */
(function (global) {
  "use strict";

  var _flags = null; // cached map once load() succeeds
  var _loadPromise = null; // de-dupes concurrent load() calls

  function _doLoad(url) {
    return fetch(url, { cache: "no-cache" })
      .then(function (res) {
        if (!res.ok) {
          throw new Error("flags fetch failed: HTTP " + res.status);
        }
        return res.json();
      })
      .then(function (data) {
        // Guard: must be a non-null object map.
        if (data && typeof data === "object" && !Array.isArray(data)) {
          _flags = data;
        } else {
          _flags = {};
        }
        return _flags;
      })
      .catch(function (err) {
        // Fail-closed: treat all flags as off, but don't reject the caller.
        if (global.console && console.warn) {
          console.warn("[TraxentFlags] could not load flags, treating all as off:", err);
        }
        _flags = {};
        return _flags;
      });
  }

  var TraxentFlags = {
    /**
     * Fetch and cache /flags.json (idempotent). Resolves to the flags map.
     * @param {string} [url="/flags.json"] override for testing.
     */
    load: function (url) {
      if (_loadPromise) return _loadPromise;
      _loadPromise = _doLoad(url || "/flags.json");
      return _loadPromise;
    },

    /**
     * Returns true if the named flag is currently on. Safe to call before
     * load() (returns false until flags are loaded).
     * @param {string} name
     * @returns {boolean}
     */
    isEnabled: function (name) {
      if (!_flags) return false; // not loaded yet -> off
      var flag = _flags[name];
      if (!flag || typeof flag !== "object") return false;
      if (flag.enabled === true) return true;
      if (flag.launchAt) {
        var t = Date.parse(flag.launchAt);
        if (!Number.isNaN(t) && Date.now() >= t) return true;
      }
      return false;
    },

    /** Test/util hook: clear the cache so the next load() refetches. */
    _reset: function () {
      _flags = null;
      _loadPromise = null;
    }
  };

  global.TraxentFlags = TraxentFlags;
})(typeof window !== "undefined" ? window : this);
