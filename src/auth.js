// Traxent Auth0 configuration
const AUTH0_DOMAIN = 'auth.traxent.io';
const AUTH0_CLIENT_ID = 'ilvfACgF2sCmLWaugCn11qTB04aTvWxz';
const AUTH0_NAMESPACE = 'https://traxent.io';

let auth0Client = null;

// Initialise Auth0
async function initAuth0() {
  auth0Client = await auth0.createAuth0Client({
    domain: AUTH0_DOMAIN,
    clientId: AUTH0_CLIENT_ID,
    authorizationParams: {
      redirect_uri: window.location.origin,
      audience: `https://${AUTH0_DOMAIN}/api/v2/`,
    },
    cacheLocation: 'localstorage',
  });

  // Handle redirect callback after login
  if (window.location.search.includes('code=')) {
    await auth0Client.handleRedirectCallback();
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  return auth0Client;
}

// Login
async function login() {
  await auth0Client.loginWithRedirect({
    authorizationParams: {
      redirect_uri: window.location.origin + '/dashboard',
    }
  });
}

// Logout
async function logout() {
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