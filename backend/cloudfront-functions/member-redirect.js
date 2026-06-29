// CloudFront Function — runs on VIEWER REQUEST.
//
// DORMANT until you associate it with the distribution's default behavior
// (Viewer request). See MEMBER-REDIRECT.md for the one-time switchover.
//
// Purpose: send a logged-in member from the marketing root ("/") straight to
// "/home" SERVER-SIDE, before any HTML is served — the Netflix-style redirect,
// with no flash of the marketing page. It reads a NON-SENSITIVE hint cookie
// `tx_session=1` that the SPA sets on login (src/auth.js). This is only a routing
// hint — real authentication is still enforced by the Auth0 token on the client
// and by the APIs. `?stay=` bypasses it (a member choosing to view the public
// site). If the hint is stale, /home re-checks and bounces back with ?stay, so
// there is no redirect loop.
//
// CloudFront Functions use a restricted ES5.1 subset: no const/let, no template
// literals, no arrow functions. Plain `var` + string concat. Request cookies are
// in request.cookies as { name: { value: '...' } }; query keys in
// request.querystring as { key: { value: '...' } }.

function handler(event) {
  var request = event.request;
  var uri = request.uri;

  // Only act on the marketing root (depending on origin config it may arrive as
  // "/" or "/index.html").
  if (uri !== '/' && uri !== '/index.html') {
    return request;
  }

  // Respect an explicit "view the public site" request (?stay=...).
  var qs = request.querystring;
  if (qs && qs.stay) {
    return request;
  }

  // Logged-in hint present? Redirect to the member home before HTML is served.
  var cookies = request.cookies;
  if (cookies && cookies.tx_session) {
    return {
      statusCode: 302,
      statusDescription: 'Found',
      headers: {
        'location': { value: '/home' },
        'cache-control': { value: 'no-store' }
      }
    };
  }

  // Logged-out (no hint) → serve the marketing page as normal.
  return request;
}
