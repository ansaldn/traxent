/**
 * Traxent — post-login account linking by verified email.
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS (do not remove): all DynamoDB user data is keyed by the
 * Auth0 `sub`. Sign in with Apple creates a SEPARATE identity (`apple|xxx`)
 * from an email signup (`auth0|xxx`). Without linking, the same human gets an
 * empty second account — progress, trades and firm selections "gone", plus a
 * duplicate marketing row. This Action links identities that share a VERIFIED
 * email, keeping the OLDEST identity as primary so the original `sub` (and
 * every row keyed by it) survives.
 *
 * INSTALL (Auth0 Dashboard):
 *   1. Actions → Library → Create Action → "Link accounts by verified email",
 *      trigger: Login / Post Login, runtime: Node 18+.
 *   2. Paste this file.
 *   3. Secrets (left panel): DOMAIN (auth.traxent.io custom domain is fine),
 *      CLIENT_ID / CLIENT_SECRET of the existing M2M app (needs read:users,
 *      update:users — both already granted; linking uses update:users).
 *   4. Dependencies: none (uses fetch, available in Node 18 runtime).
 *   5. Deploy, then drag the Action into the Login flow
 *      (Actions → Flows → Login), BEFORE any Action that reads roles/plan.
 *
 * BEHAVIOUR MATRIX (tested paths):
 *   email signup first, Apple later (same real email)   → linked, auth0| stays primary
 *   Apple first, email signup later                     → linked, apple| stays primary (it's oldest)
 *   Apple with private-relay email                      → NOT auto-linked (relay never matches);
 *                                                         event continues as a separate account.
 *   unverified email on either side                     → NOT linked (spoof-safety), continues.
 */
exports.onExecutePostLogin = async (event, api) => {
  const { user } = event;

  // Only link on verified emails — an unverified email is an attacker's claim.
  if (!user.email || !user.email_verified) return;

  // Apple private relay can never match the user's real email; skip quietly.
  // (The /account page offers manual linking guidance for this case.)
  if (user.email.endsWith('@privaterelay.appleid.com')) return;

  // Already linked? A user with >1 identity has been through this.
  if ((user.identities || []).length > 1) return;

  const domain = event.secrets.DOMAIN;

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
    token = (await res.json()).access_token;
    if (!token) return; // never block login on a linking failure
  } catch { return; }

  // Find other users with the same email; keep only verified matches.
  let candidates;
  try {
    const res = await fetch(
      `https://${domain}/api/v2/users-by-email?email=${encodeURIComponent(user.email.toLowerCase())}`,
      { headers: { authorization: `Bearer ${token}` } },
    );
    const all = await res.json();
    if (!Array.isArray(all)) return;
    candidates = all.filter(u => u.user_id !== user.user_id && u.email_verified);
  } catch { return; }
  if (!candidates.length) return;

  // Oldest identity wins as primary, so the longest-lived `sub` — and all the
  // DynamoDB data keyed by it — survives the merge.
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
    // Continue THIS login as the primary user, so tokens carry the surviving
    // sub immediately (no logout/login needed).
    if (primary.user_id !== user.user_id) {
      api.authentication.setPrimaryUser(primary.user_id);
    }
  } catch (e) {
    // Linking failed — log and let the login proceed unlinked rather than
    // locking the user out. The next login retries automatically.
    console.log('account-linking failed (non-blocking):', e.message);
  }
};
