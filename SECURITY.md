# Traxent — Security Review

Reviewed the codebase and everything added this session against the **OWASP Top 10 (2021)**
and the **AWS Well-Architected Security Pillar**. Overall posture is **good** — strong
transport/headers, server-side authorization on every money/data endpoint, and least-
privilege data access. Items below are ordered by priority. Nothing here is an active
exploit; they are hardening recommendations plus a record of what's already done right.

Severity key: 🔴 do before scaling · 🟡 should do · 🟢 already handled / minor.

---

## OWASP Top 10

### A01 — Broken Access Control
- 🟢 Every backend endpoint verifies the Auth0 **ID token** (RS256 via JWKS) and derives the
  user identity from the verified `sub`, never from the request body. A forged body cannot
  act on another user's subscription or data.
- 🟢 `news-feed` and `user-data` enforce **server-side** plan/identity checks (Funded-tier
  gate; per-user partition key). The client-side `requireMinPlan()` gates are UX only.
- 🟡 Paywalled *content* pages (`/journal`, `/tracker`, learn modules) are gated client-side
  only. There's no sensitive server data behind them yet, so the exposure is just the page
  source. Once data moves server-side (user-data), the server enforces per-user access — keep
  it that way and don't trust the client gate for anything that matters.

### A02 — Cryptographic Failures
- 🟢 HTTPS enforced end-to-end: HSTS (1y, includeSubDomains), `upgrade-insecure-requests`.
- 🟢 Secrets in **SSM SecureString** (Stripe keys, M2M creds, news key). None in the repo.
- 🟢 DynamoDB **encryption at rest (SSE)** and **point-in-time recovery** enabled.
- 🟡 The frontend sends the Auth0 **ID token** as the API bearer (no API audience configured).
  It's verified correctly, but ID-tokens-as-API-tokens is non-ideal. If you later stand up a
  proper Auth0 API + access tokens, switch the verifiers' `audience` to that API identifier.

### A03 — Injection
- 🟢 DynamoDB access uses the parameterized DocumentClient (no string-built queries).
- 🟢 The `/news` page escapes all third-party article fields (`esc()`) before `innerHTML`.
- 🟢 Dashboard renders user profile fields with `textContent`, not `innerHTML`.
- 🟡 `cancel-subscription` interpolates the verified `userId` into a Stripe `customers.search`
  query. The value is an Auth0 `sub` (controlled format), so risk is low; if you ever derive
  it from user input, switch to exact metadata filtering.

### A04 — Insecure Design
- 🟡 No application-level rate limiting. Add **API Gateway throttling** (and ideally AWS WAF)
  in front of the payment and user-data APIs to blunt abuse/enumeration.

### A05 — Security Misconfiguration
- 🟢 Strong CSP on every page; `frame-ancestors 'none'` + `X-Frame-Options: DENY`;
  `nosniff`; locked `Referrer-Policy`; tight `Permissions-Policy` — all via the CloudFront
  Function on viewer response.
- 🟢 CORS on all Lambdas is locked to `https://traxent.io` (not `*`).
- 🟡 CSP uses `script-src 'unsafe-inline'` (required by the inline `onclick`/init scripts).
  This weakens XSS defense. A future hardening is nonce/hash-based CSP, which needs moving
  inline handlers to addEventListener — a sizeable but worthwhile refactor.

### A06 — Vulnerable & Outdated Components
- 🟡 Pin and watch dependencies (`aws-jwt-verify`, `stripe`, `@aws-sdk/*`). Enable
  **Dependabot** (or `npm audit` in CI) on `backend/**`.

### A07 — Identification & Authentication
- 🟢 Auth delegated to Auth0 with a verified custom domain; tokens validated on issuer,
  audience, signature and expiry.

### A08 — Software & Data Integrity
- 🟡 The Auth0 SDK is loaded from `cdn.auth0.com` **without SRI** (a pinned hash). It was
  dropped earlier because the floating `/2.0/` path has no stable hash. Consider pinning a
  specific SDK version and adding `integrity`/`crossorigin` so a CDN compromise can't inject code.
- 🟢 Per-deploy cache versioning means a poisoned/stale `auth.js` can't persist (the bug that
  started this session).

### A09 — Logging & Monitoring
- 🟡 Lambdas log errors to CloudWatch. Add **CloudWatch alarms** on Lambda errors/throttles
  and on DynamoDB throttling, and a billing alarm.

### A10 — SSRF
- 🟢 The news Lambda fetches a fixed provider URL; no user-controlled fetch targets.

---

## AWS Well-Architected — Security Pillar

- 🟢 **Least-privilege data access**: `user-data` uses a `DynamoDBCrudPolicy` scoped to one
  table. `news-feed` only needs `ssm:GetParameter` on `/traxent/news/*` (grant exactly that).
- 🟡 **CI credentials**: one shared IAM user drives all deploys, and for the SAM stack it
  needs broad CloudFormation/IAM rights. Prefer **per-workflow OIDC roles** (GitHub →
  `sts:AssumeRole`) with scoped policies instead of long-lived access keys.
- 🟢 **Data protection**: SSE + PITR on DynamoDB; secrets encrypted in SSM.
- 🟡 **Edge protection**: add WAF + throttling on the public APIs before heavy traffic.
- 🟢 **Infrastructure as code**: the user-data stack is now reproducible via SAM/Git, removing
  the previous "empty `template.yaml`, deployed by hand" risk.

---

## Quick wins (highest value, lowest effort)
1. Add **API Gateway throttling** on the payment + user-data APIs.
2. Enable **Dependabot / `npm audit`** in CI for `backend/**`.
3. Add **CloudWatch alarms** (Lambda errors, DynamoDB throttle, billing).
4. Move CI auth to **GitHub OIDC roles** with least privilege.
5. Pin the Auth0 SDK version and add **SRI** to its script tag.
