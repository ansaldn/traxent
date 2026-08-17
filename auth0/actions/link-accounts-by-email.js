/**
 * Traxent — post-login: link accounts by verified email + stamp the plan tier.
 * ─────────────────────────────────────────────────────────────────────────────
 * ONE action doing both jobs, deliberately. They used to be separate
 * ("Link accounts by verified email" + "Stamp plan tier on login") — but
 * event.authorization.roles is SNAPSHOTTED at transaction start for the
 * ORIGINAL user, and api.authentication.setPrimaryUser() does not refresh it.
 * So on the very login where an account link happened, the separate stamp
 * action saw the pre-link user's (empty) roles and issued plan='free' — a paid
 * member "lost" their subscription until the next sign-in (observed live,
 * 2026-08-17). Merging the two lets the linking path stamp from the PRIMARY
 * user's real roles, fetched with the Management API token it already holds.
 *
 * WHY LINKING EXISTS (do not remove): all DynamoDB user data is keyed by the
 * Auth0 `sub`. Sign in with Apple/Google creates a SEPARATE identity from an
 * email signup. Without linking, the same human gets an empty second account.
 * Identities sharing a VERIFIED email are linked, keeping the OLDEST identity
 * as primary so the original `sub` (and every row keyed by it) survives.
 *
 * INSTALL (Auth0 Dashboard):
 *   1. Actions → Library → open "Link accounts by verified email" → replace
 *      the code with this file → Deploy.
 *   2. Actions → Flows → Login: REMOVE the old "Stamp plan tier on login"
 *      action from the canvas (this action now stamps) → Apply. Do step 1
 *      BEFORE step 2, or logins will briefly carry no plan claim.
 *   3. Secrets: DOMAIN = the CANONICAL tenant domain
 *      `dev-djbalapbvi8f3av2.us.auth0.com` — NOT auth.traxent.io (the custom
 *      domain cannot mint Management API tokens; it fails silently).
 *      CLIENT_ID / CLIENT_SECRET = the existing M2M app (read:users,
 *      update:users, read:roles — all already granted).
 *      After changing any secret you MUST click Deploy again.
 *
 * BEHAVIOUR MATRIX:
 *   email signup first, Apple/Google later (same verified email) → linked,
 *     oldest stays primary, THIS login's tokens carry the correct plan.
 *   Apple/Google first, email signup later → linked, social identity primary.
 *   Apple private-relay email → NOT auto-linked (relay never matches).
 *   unverified email on either side → NOT linked (spoof-safety).
 *   every login, linked or not → plan + roles claims stamped.
 */
exports.onExecutePostLogin = async (event, api) => {
  const { user } = event;
  const NAMESPACE = 'https://traxent.io';
  const log = (msg) => console.log(`[link-accounts] ${user.user_id}: ${msg}`);

  // ── Stamp helper: roles → plan claim on both tokens ───────────────────────
  const stamp = (roles) => {
    let plan = 'free';
    if (roles.includes('funded_ready')) plan = 'funded_ready';
    else if (roles.includes('challenger')) plan = 'challenger';
    else if (roles.includes('observer')) plan = 'observer';
    api.idToken.setCustomClaim(`${NAMESPACE}/plan`, plan);
    api.accessToken.setCustomClaim(`${NAMESPACE}/plan`, plan);
    api.idToken.setCustomClaim(`${NAMESPACE}/roles`, roles);
    return plan;
  };

  // ── Linking (returns {primaryId, token} when a link happened) ─────────────
  const tryLink = async () => {
    if (!user.email || !user.email_verified) { log('link skip: email missing or unverified'); return null; }
    if (user.email.endsWith('@privaterelay.appleid.com')) { log('link skip: private relay email'); return null; }
    if ((user.identities || []).length > 1) { log('link skip: already linked'); return null; }

    const domain = event.secrets.DOMAIN;
    if (!domain || domain.includes('://')) { log('MISCONFIG: DOMAIN secret must be a bare hostname'); return null; }

    let token;
    try {
      const res = await fetch(`https://${domain}/oauth/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          client_id: event.secrets.CLIENT_ID,
          client_secret: event.secrets.CLIENT_SECRET,
          audience: `https://${domain}/api/v2/`,
          grant_type: 'client_credentials',
        }),
      });
      const body = await res.json();
      token = body.access_token;
      if (!token) {
        log(`link FAIL: no mgmt token (HTTP ${res.status} ${body.error || ''}) — is DOMAIN the canonical tenant domain?`);
        return null; // never block login on a linking failure
      }
    } catch (e) { log('link FAIL: token request threw — ' + e.message); return null; }

    let candidates;
    try {
      const res = await fetch(
        `https://${domain}/api/v2/users-by-email?email=${encodeURIComponent(user.email.toLowerCase())}`,
        { headers: { authorization: `Bearer ${token}` } },
      );
      const all = await res.json();
      if (!Array.isArray(all)) { log(`link FAIL: users-by-email returned ${res.status} non-array`); return null; }
      candidates = all.filter(u => u.user_id !== user.user_id && u.email_verified);
    } catch (e) { log('link FAIL: users-by-email threw — ' + e.message); return null; }
    if (!candidates.length) { log('link skip: no other verified user with this email'); return null; }
    log(`linking with ${candidates.map(c => c.user_id).join(', ')}`);

    // Oldest identity wins as primary, so the longest-lived `sub` — and all
    // the DynamoDB data keyed by it — survives the merge.
    const everyone = [...candidates, { user_id: user.user_id, created_at: user.created_at }];
    everyone.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    const primary = everyone[0];
    const secondaries = everyone.slice(1);

    try {
      for (const sec of secondaries) {
        const [provider, ...rest] = sec.user_id.split('|');
        await fetch(`https://${domain}/api/v2/users/${encodeURIComponent(primary.user_id)}/identities`, {
          method: 'POST',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          body: JSON.stringify({ provider, user_id: rest.join('|') }),
        });
      }
      // Continue THIS login as the primary user, so tokens carry the
      // surviving sub immediately (no logout/login needed).
      if (primary.user_id !== user.user_id) {
        api.authentication.setPrimaryUser(primary.user_id);
      }
      log(`link SUCCESS: primary=${primary.user_id}`);
      return { primaryId: primary.user_id, domain, token };
    } catch (e) {
      log('link FAIL: link call threw (non-blocking) — ' + e.message);
      return null;
    }
  };

  const linked = await tryLink();

  // ── Plan stamping ─────────────────────────────────────────────────────────
  // Normal logins (the overwhelming majority): the fast snapshot is correct.
  // A login where a link JUST happened: the snapshot belongs to the pre-link
  // user, so fetch the primary's real roles instead — this is the fix for the
  // "paid member looked free until re-login" bug.
  let roles = event.authorization?.roles || [];
  if (linked) {
    try {
      const res = await fetch(
        `https://${linked.domain}/api/v2/users/${encodeURIComponent(linked.primaryId)}/roles`,
        { headers: { authorization: `Bearer ${linked.token}` } },
      );
      const list = await res.json();
      if (Array.isArray(list)) {
        roles = list.map(r => r.name).filter(Boolean);
        log(`stamping from primary's live roles: [${roles.join(', ')}]`);
      } else {
        log(`stamp WARN: roles fetch returned ${res.status} non-array — falling back to snapshot`);
      }
    } catch (e) { log('stamp WARN: roles fetch threw — falling back to snapshot — ' + e.message); }
  }
  const plan = stamp(roles);
  log(`stamped plan=${plan}`);
};
