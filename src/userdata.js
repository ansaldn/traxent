// ── Traxent user-data client ────────────────────────────────────────────────
// A thin data layer over the user-data API (backend/user-data). It persists
// lesson progress, paper trades, and firm selections to the cloud so they
// follow the user across devices — while ALWAYS falling back to localStorage,
// so every page keeps working even before the API is deployed or if the user
// is offline.
//
// SETUP: after the first `sam deploy` of the user-data stack, copy the
// `ApiBaseUrl` stack output into USERDATA_API below (no trailing slash), e.g.
//   const USERDATA_API = 'https://abc123def.execute-api.eu-west-2.amazonaws.com';
// While it is empty, this layer behaves exactly like localStorage.
//
// Depends on authBearerToken() from auth.js (load auth.js first).

const USERDATA_API = ''; // ← set to the deployed user-data ApiBaseUrl

const LS_PROGRESS = 'traxent_progress';
const LS_TRADES   = 'traxent_trades';
const LS_FIRMS    = 'traxent_selected_firms';

function lsGet(k, def) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? def : v; } catch { return def; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } }

async function apiFetch(path, opts) {
  if (!USERDATA_API) throw new Error('userdata-api-not-configured');
  if (typeof authBearerToken !== 'function') throw new Error('auth-not-loaded');
  const token = await authBearerToken();
  const res = await fetch(USERDATA_API + '/user' + path, Object.assign({}, opts, {
    headers: Object.assign(
      { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      (opts && opts.headers) || {}
    ),
  }));
  if (!res.ok) throw new Error('userdata-api-' + res.status);
  return res.status === 204 ? null : res.json();
}

window.TraxentData = {
  apiEnabled() { return !!USERDATA_API; },

  // Pull the full cloud state and mirror it into localStorage. Returns the
  // state object, or null if the API is unavailable (callers then use local).
  async sync() {
    try {
      const s = await apiFetch('', { method: 'GET' });
      if (s && typeof s === 'object') {
        lsSet(LS_PROGRESS, s.progress || {});
        lsSet(LS_FIRMS, s.firms || []);
        lsSet(LS_TRADES, s.trades || []);
      }
      return s;
    } catch { return null; }
  },

  // ── Lesson / quiz progress ──
  getProgress() { return lsGet(LS_PROGRESS, {}); },
  async setProgress(progress) {
    lsSet(LS_PROGRESS, progress);
    try { await apiFetch('/progress', { method: 'PUT', body: JSON.stringify({ progress }) }); } catch {}
  },
  async markLesson(key) { const p = this.getProgress(); p[key] = true; await this.setProgress(p); },

  // ── Firm selection ──
  getFirms() { return lsGet(LS_FIRMS, []); },
  async setFirms(firms) {
    lsSet(LS_FIRMS, firms);
    try { await apiFetch('/firms', { method: 'PUT', body: JSON.stringify({ firms }) }); } catch {}
  },

  // ── Paper trades ──
  getTrades() { return lsGet(LS_TRADES, []); },
  async addTrade(trade) {
    const local = this.getTrades();
    try {
      const saved = await apiFetch('/trades', { method: 'POST', body: JSON.stringify(trade) });
      local.unshift(saved); lsSet(LS_TRADES, local); return saved;
    } catch {
      const saved = Object.assign({ id: 'local-' + Date.now(), createdAt: new Date().toISOString() }, trade);
      local.unshift(saved); lsSet(LS_TRADES, local); return saved;
    }
  },
  async deleteTrade(id) {
    lsSet(LS_TRADES, this.getTrades().filter(t => t.id !== id));
    try { await apiFetch('/trades/' + encodeURIComponent(id), { method: 'DELETE' }); } catch {}
  },

  // ── Account deletion (irreversible) ──
  // Cancels billing, purges all stored data, and deletes the Auth0 user.
  // Requires USERDATA_API to be set and the user authenticated. Resolves on
  // success (HTTP 204); throws on failure so the UI can keep the user signed in.
  async deleteAccount() {
    if (!USERDATA_API) throw new Error('userdata-api-not-configured');
    await apiFetch('/account', { method: 'DELETE' });
    try { localStorage.removeItem(LS_PROGRESS); localStorage.removeItem(LS_TRADES); localStorage.removeItem(LS_FIRMS); } catch {}
  },
};
