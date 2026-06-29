// Traxent Auth0 configuration
const AUTH0_DOMAIN = 'auth.traxent.io';
const AUTH0_CLIENT_ID = 'ilvfACgF2sCmLWaugCn11qTB04aTvWxz';
const AUTH0_NAMESPACE = 'https://traxent.io';

let auth0Client = null;

// ── Member-hint cookie ───────────────────────────────────────────────────────
// A non-sensitive `tx_session` flag (NOT an auth token) that mirrors whether the
// user has an Auth0 session. The (currently dormant) edge redirect reads it to
// send members straight to /home server-side, before any HTML renders — no
// marketing-page flash. Real auth is always enforced by the Auth0 token; this is
// only a routing hint, so it's safe to ship before the edge function is live.
function setSessionHint(on) {
  try {
    document.cookie = on
      ? 'tx_session=1; path=/; max-age=2592000; secure; samesite=Lax'
      : 'tx_session=; path=/; max-age=0; secure; samesite=Lax';
  } catch (e) { /* cookies unavailable */ }
}

// Initialise Auth0
async function initAuth0() {
  auth0Client = await auth0.createAuth0Client({
    domain: AUTH0_DOMAIN,
    clientId: AUTH0_CLIENT_ID,
    authorizationParams: {
      redirect_uri: window.location.origin,
      // No `audience` set — Auth0 issues a standard OIDC ID token.
      // We use the ID token (not access token) for API calls to our Lambdas;
      // see authBearerToken() below.
    },
    cacheLocation: 'localstorage',
  });

  // Handle redirect callback after login
  if (window.location.search.includes('code=')) {
    await auth0Client.handleRedirectCallback();
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  // Keep the member-hint cookie in sync with the real session on every page load,
  // so the (dormant) edge redirect can route logged-in users with no flash.
  try { setSessionHint(await auth0Client.isAuthenticated()); } catch (e) {}

  return auth0Client;
}

// Login — returning members land on their personalised /home (Dashboard is one
// click away from there, and remains the primary CTA on the home page).
async function login() {
  await auth0Client.loginWithRedirect({
    authorizationParams: {
      redirect_uri: window.location.origin + '/home',
    }
  });
}

// Logout
async function logout() {
  setSessionHint(false);
  await auth0Client.logout({
    logoutParams: {
      returnTo: window.location.origin
    }
  });
}

// Get current user
async function getUser() {
  const isAuthenticated = await auth0Client.isAuthenticated();
  if (!isAuthenticated) return null;
  return await auth0Client.getUser();
}

// Get the raw ID token JWT — pass this as `Authorization: Bearer <token>`
// when calling our Lambda APIs. ID token is always a JWT (signed RS256),
// audience = Auth0 Client ID, issuer = Auth0 tenant.
async function authBearerToken() {
  const claims = await auth0Client.getIdTokenClaims();
  return claims && claims.__raw;
}

// Get user's plan tier from JWT
async function getUserPlan() {
  const user = await getUser();
  if (!user) return null;
  return user[`${AUTH0_NAMESPACE}/plan`] || 'free';
}

// Check if user can access a feature
async function canAccess(requiredPlan) {
  const plan = await getUserPlan();
  const hierarchy = ['free', 'observer', 'challenger', 'funded_ready'];
  const userLevel = hierarchy.indexOf(plan);
  const requiredLevel = hierarchy.indexOf(requiredPlan);
  return userLevel >= requiredLevel;
}

// ---------------------------------------------------------------------------
// requireMinPlan(minPlan)
// Page-level paywall gate. Call from the <head> of any protected page.
// Hides the body until auth is confirmed, then:
//   - if not logged in → sends user through Auth0 login, returns to this page
//   - if plan is below minPlan → redirects to /dashboard?needs=<plan>
//   - if plan is sufficient → reveals the page
// Requires a <style id="auth-gate-style">body{visibility:hidden}</style> in <head>.
// ---------------------------------------------------------------------------
async function requireMinPlan(minPlan) {
  try {
    await initAuth0();

    if (window.location.search.includes('code=') || window.location.search.includes('state=')) {
      await auth0Client.handleRedirectCallback();
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    const isAuthenticated = await auth0Client.isAuthenticated();
    if (!isAuthenticated) {
      await auth0Client.loginWithRedirect({
        authorizationParams: { redirect_uri: window.location.origin + window.location.pathname }
      });
      return;
    }

    const claims = await auth0Client.getIdTokenClaims();
    const ns = 'https://traxent.io';
    const plan = (claims && claims[`${ns}/plan`]) || 'free';
    const hierarchy = ['free', 'observer', 'challenger', 'funded_ready'];
    if (hierarchy.indexOf(plan) < hierarchy.indexOf(minPlan)) {
      window.location.href = '/dashboard?needs=' + encodeURIComponent(minPlan);
      return;
    }

    const gateStyle = document.getElementById('auth-gate-style');
    if (gateStyle) gateStyle.remove();
  } catch (err) {
    console.error('requireMinPlan error:', err);
    window.location.href = '/';
  }
}