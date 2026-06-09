// CloudFront Function — runs on Viewer Response.
// Adds security headers to every response served from traxent.io.
//
// This is the FREE-tier alternative to a Custom Response Headers Policy
// (which AWS moved behind the Business plan, $200/mo, in 2025).
//
// Notes:
// - CloudFront Functions use a restricted ES5.1 subset. No const/let, no
//   template literals, no arrow functions. Plain `var` + concat.
// - Header names must be lowercase in the headers object.
// - CSP is set here AND via <meta> in HTML. Browser uses the stricter of the
//   two. Header takes precedence for `frame-ancestors`, which meta can't set.

function handler(event) {
  var response = event.response;
  var headers = response.headers;

  // ── Strict-Transport-Security ────────────────────────────────────────────
  // 1 year, include all subdomains. No `preload` — preload submission is
  // hard to undo. Add it later if you're confident.
  headers['strict-transport-security'] = {
    value: 'max-age=31536000; includeSubDomains'
  };

  // ── Clickjacking ─────────────────────────────────────────────────────────
  // X-Frame-Options is the legacy header. The real defense is the
  // `frame-ancestors 'none'` directive in the CSP below.
  headers['x-frame-options'] = { value: 'DENY' };

  // ── MIME sniffing ────────────────────────────────────────────────────────
  headers['x-content-type-options'] = { value: 'nosniff' };

  // ── Referer leakage ──────────────────────────────────────────────────────
  headers['referrer-policy'] = { value: 'strict-origin-when-cross-origin' };

  // ── Permissions-Policy ───────────────────────────────────────────────────
  // Disable browser features the site doesn't use. Locks down what any
  // injected script could ask the browser to do.
  headers['permissions-policy'] = {
    value: 'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=(), interest-cohort=()'
  };

  // ── Content-Security-Policy ──────────────────────────────────────────────
  // Same allowlist as the <meta> tag, PLUS `frame-ancestors 'none'` which
  // can only be set via real HTTP header. That directive is what actually
  // prevents traxent.io from being loaded in someone else's iframe.
  headers['content-security-policy'] = {
    value: "default-src 'self'; "
      + "script-src 'self' 'unsafe-inline' https://cdn.auth0.com; "
      + "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
      + "font-src 'self' https://fonts.gstatic.com; "
      + "img-src 'self' data: https:; "
      + "frame-src https://www.tradingview.com https://s.tradingview.com https://auth.traxent.io https://*.auth0.com; "
      + "connect-src 'self' https://auth.traxent.io https://*.auth0.com https://*.execute-api.eu-west-2.amazonaws.com https://formspree.io; "
      + "form-action 'self' https://formspree.io; "
      + "frame-ancestors 'none'; "
      + "object-src 'none'; "
      + "base-uri 'self'; "
      + "upgrade-insecure-requests"
  };

  return response;
}
