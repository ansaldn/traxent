# Traxent — Full Security Audit (Web + Backend + iOS)

**Date:** 2026-06-28 · **Scope:** `traxent-web` (frontend, Lambda backend, IaC, CI/CD), Auth0 + Stripe integration, `traxentApp` iOS (Swift).
**Focus (as requested):** breach vectors from poor practice — injection, broken access control, credential/secret exposure, DDoS / resource-exhaustion, supply chain.
**Method:** manual code review of every Lambda, the frontend JS/CSP, all SAM templates and GitHub Actions, the Auth0 config, and all 25 Swift files; cross-checked against OWASP Top 10 (2021), the AWS DDoS-Resiliency best practices, and the AWS Well-Architected Security pillar.

> **Headline:** Your security fundamentals are genuinely good — auth is verified server-side on every endpoint, identity is always derived from the token (never the request body), DynamoDB access is parameterized, secrets live in SSM (not the repo), and the iOS app stores tokens in the Keychain. **There is no active exploit in the code.** The real gaps are at the *edge and the operational layer*: no rate-limiting/WAF in front of the APIs (your biggest DDoS/cost exposure), over-broad deploy credentials, and a web token-storage model that turns any future XSS into account takeover. This report ranks everything and gives ready-to-paste fixes.

---

## 1. Remediation backlog (priority order)

Severity: 🔴 High · 🟠 Medium · 🟡 Low · 🟢 already done right. "Effort" is rough engineering time.

| # | Sev | Finding | Area | Effort | Fix summary |
|---|-----|---------|------|--------|-------------|
| H1 | 🔴 | No WAF and no API Gateway throttling on public APIs → volumetric/app-layer DDoS and **direct cost amplification** (on-demand Lambda + DynamoDB) | Infra | M | WAF rate rules + API GW throttling (§4.1) |
| H2 | 🔴 | Over-privileged deploy identity: OIDC role is `service:*` on `*`, and the frontend deploy still uses long-lived AWS access keys | IAM/CI | M | Scope the policy, migrate frontend deploy to OIDC, delete static keys (§4.2) |
| H3 | 🔴 | Web ID token in `localStorage` + CSP `script-src 'unsafe-inline'` → any XSS = token theft = account takeover | Web | M–L | Nonce CSP + shorten token TTL + consider BFF cookie (§3.1) |
| M1 | 🟠 | No gateway-level auth — every unauthenticated request still invokes a Lambda (DoS cost amplifier) | Backend | S | Add HTTP API JWT authorizer (§4.3) |
| M2 | 🟠 | No CloudWatch alarms and no billing budget — an attack/cost runaway is invisible until the bill | Infra | S | Alarms + AWS Budgets (§4.4) |
| M3 | 🟠 | Stripe **Search-query injection** via interpolated `email` in checkout/cancel/delete | Backend | S | Validate/escape, prefer exact metadata match (§3.2) |
| M4 | 🟠 | Supply chain: floating `^` deps, `npm install` (not `npm ci`) in CI, no Dependabot, no SRI on Auth0 SDK | CI/Web | S | Pin + lockfile install + Dependabot + SRI (§4.5) |
| M5 | 🟠 | Unverified from repo: S3 bucket public-access posture + CloudFront OAC | Infra | S | Confirm Block Public Access + OAC (§4.6) |
| M6 | 🟠 | Auth0 hardening not confirmed: Attack Protection, admin MFA, log streaming, M2M least-privilege | Auth0 | S | Enable in tenant (§5) |
| L1 | 🟡 | iOS: no certificate/public-key pinning on API calls | iOS | M | Pin via URLSession delegate (§6.2) |
| L2 | 🟡 | iOS: external article URLs opened without scheme validation | iOS | S | Allow only `https` (§6.3) |
| L3 | 🟡 | Stripe full-access secret key used everywhere | Stripe | S | Per-function **restricted** keys (§5.2) |
| L4 | 🟡 | Stripe webhook has no explicit idempotency guard | Backend | S | Dedupe on event ID (§3.3) |
| L5 | 🟡 | `create-checkout` trusts `userEmail` from the body | Backend | XS | Use the verified token `email` claim (§3.4) |
| B  | 🟢 | AWS account baseline (root MFA, CloudTrail, GuardDuty, Config, Security Hub) | Infra | S | Verify/enable (§4.7) |

A checkbox version you can work through is in **`SECURITY-BACKLOG.md`**.

---

## 2. Answering your specific concerns

**"SQL injection."** You have **no SQL database** — persistence is DynamoDB via the parameterized `DynamoDBDocumentClient` (`KeyConditionExpression` with `ExpressionAttributeValues`), so classic SQLi is **not applicable** and is already handled correctly. The one injection-shaped risk is **Stripe Search Query Language** built with string interpolation (M3) — low severity but worth closing.

**"DDoS attacks."** This is your **most material gap (H1)**. The static site sits behind CloudFront (so it benefits from AWS Shield Standard and edge absorption for free), but your **APIs** (`execute-api` REST + HTTP) are exposed directly with **no WAF and no throttling**. Because Lambda and DynamoDB are both on-demand/pay-per-request, a flood doesn't just degrade availability — it **scales your bill linearly with the attack**. The fix is layered: WAF rate-based rules + API Gateway throttling + a gateway JWT authorizer so junk traffic is rejected before it reaches compute (§4.1–4.3).

**"Websites and databases penetrated due to poor practice."** The usual culprits — secrets in the repo, trusting client-supplied identity, string-built queries, public buckets, world-open CORS — are **mostly already avoided**. The residual exposure is operational: over-broad deploy credentials (H2), a token-theft path if XSS ever lands (H3), and no detection (M2). Close those and you've covered the "poor-practice breach" class.

---

## 3. Application-layer findings (code)

### 3.1 🔴 H3 — Web ID token in `localStorage` under an `unsafe-inline` CSP
**Where:** `src/auth.js` (`cacheLocation: 'localstorage'`, ID token returned by `authBearerToken()`), `backend/cloudfront-functions/security-headers.js` (`script-src 'self' 'unsafe-inline' https://cdn.auth0.com`).
**Why it matters:** The Auth0 **ID token** is the bearer for every API call and is readable from `localStorage` by any script on the page. Your CSP still allows `'unsafe-inline'`, so *if* an XSS ever lands (today your `esc()` usage is good — see §3.5 — but the whole site uses inline handlers), the attacker can read the token and impersonate the user until it expires. localStorage also offers no `HttpOnly`/`SameSite` protection.
**Compensating controls already present:** consistent output-escaping, locked CORS, `frame-ancestors 'none'`, the SPA SDK does **not** persist refresh tokens (default iframe renewal), and identity is re-verified server-side.
**Fix (in priority order):**
1. **Shorten the ID-token lifetime** in Auth0 (e.g. 1–2h instead of the 10h default) to shrink the theft window — zero code change.
2. **Move to a nonce-based CSP** and drop `'unsafe-inline'`. This is the durable fix; it requires moving inline `onclick=`/init scripts to `addEventListener`. Per-request nonces aren't possible in a CloudFront *Function*, so either (a) hash-source the known inline scripts, or (b) inject a nonce at the edge with Lambda@Edge.
3. **Strategic:** adopt a **Backend-For-Frontend** pattern — the SPA talks to a same-origin endpoint that holds the session in an `HttpOnly; Secure; SameSite=Strict` cookie, so no token is ever in JS. Bigger lift; the right end state for a paid product.

### 3.2 🟠 M3 — Stripe Search-query injection via interpolated email
**Where:** `cancel-subscription/index.mjs` and `user-data/functions/delete-account/index.mjs` build `` `email:'${email}'` `` (and `auth0_user_id:'${userId}'`).
**Why it matters:** Values are interpolated into Stripe's Search Query Language with no escaping. `userId` is an Auth0 `sub` (safe fixed format), but `email` originates from the token's `email` claim, which traces back to user-controlled signup input. A crafted value containing a single quote could alter the query and match **another customer's** records (information disclosure / wrong-account cancellation). Likelihood is low (Auth0 rejects malformed emails), but it's defense-in-depth on a money path.
**Fix:** reject values containing `'` `\` or newlines before querying, and prefer exact metadata lookup. Minimal guard:
```js
const safe = s => { if (/['"\\\n]/.test(s)) throw Object.assign(new Error('bad identifier'), {statusCode:400}); return s; };
// ...customers.search({ query: `email:'${safe(email)}'` })
```
Best: stamp `auth0_sub` on every customer at checkout (you already do) and **only** search by that, dropping the email fallback.

### 3.3 🟡 L4 — Stripe webhook idempotency
**Where:** `stripe-webhook/index.mjs`. Signature verification via `constructEvent` is correct ✅. Stripe can deliver the same event more than once; role add/remove is *roughly* idempotent but not guaranteed.
**Fix:** record processed `stripeEvent.id`s (a DynamoDB item with a TTL) and no-op on repeats. Also consider replay protection by rejecting events older than a few minutes.

### 3.4 🟡 L5 — `create-checkout` trusts body email
**Where:** `create-checkout/index.mjs` reads `userEmail` from the request body and stamps it on the Stripe customer. Identity is correctly taken from the token, so this is data-integrity, not access-control: a user could attach an arbitrary email to *their own* customer.
**Fix:** use the verified `payload.email` claim (already available in `requireAuth`) instead of `event.body.userEmail`.

### 3.5 🟢 Confirmed-good in the app layer
- **Auth on every endpoint:** RS256 verification via JWKS (`aws-jwt-verify`), identity from the verified `sub`. A forged body cannot act on another user.
- **Server-side plan gating:** `news-feed` enforces `funded_ready` from the token claim; client gates (`requireMinPlan`) are UX only.
- **Per-user data isolation:** every DynamoDB read/write is partitioned by `userId = sub`; no cross-tenant query path; `addTrade` **whitelists** fields and bounds string lengths.
- **XSS output-escaping:** `esc()` is consistently applied to user/third-party data in `journal.html` and `news.html`; dashboard uses `textContent`. Remaining `innerHTML` uses render trusted internal constants.
- **Webhook signature** verified against the raw body; CORS locked to `https://traxent.io`; strong security headers via the CloudFront Function.

---

## 4. Infrastructure, IaC & CI/CD

### 4.1 🔴 H1 — Add WAF + API Gateway throttling (DDoS / cost control)
Layer three controls (matches AWS's DDoS-resiliency BP4):

**(a) API Gateway throttling — REST payments API** (`backend/template.yaml`). Native and free:
```yaml
PaymentsApi:
  Type: AWS::Serverless::Api
  Properties:
    Name: traxent-payments
    StageName: !Ref StageName
    EndpointConfiguration: { Type: REGIONAL }
    MethodSettings:
      - ResourcePath: "/*"
        HttpMethod: "*"
        ThrottlingRateLimit: 20      # steady-state req/s for the whole stage
        ThrottlingBurstLimit: 40     # short-spike allowance
```

**(b) AWS WAF (WAFv2, REGIONAL) with a rate-based rule + AWS managed common rules**, associated to each API stage:
```yaml
TraxentApiWebAcl:
  Type: AWS::WAFv2::WebACL
  Properties:
    Name: traxent-api-acl
    Scope: REGIONAL
    DefaultAction: { Allow: {} }
    VisibilityConfig: { SampledRequestsEnabled: true, CloudWatchMetricsEnabled: true, MetricName: traxent-api-acl }
    Rules:
      - Name: RateLimitPerIP
        Priority: 0
        Action: { Block: {} }
        Statement:
          RateBasedStatement: { Limit: 2000, AggregateKeyType: IP }   # requests / 5 min / IP
        VisibilityConfig: { SampledRequestsEnabled: true, CloudWatchMetricsEnabled: true, MetricName: rate-limit }
      - Name: AWSCommon
        Priority: 1
        OverrideAction: { None: {} }
        Statement:
          ManagedRuleGroupStatement: { VendorName: AWS, Name: AWSManagedRulesCommonRuleSet }
        VisibilityConfig: { SampledRequestsEnabled: true, CloudWatchMetricsEnabled: true, MetricName: aws-common }

PaymentsWafAssoc:
  Type: AWS::WAFv2::WebACLAssociation
  Properties:
    ResourceArn: !Sub "arn:aws:apigateway:${AWS::Region}::/restapis/${PaymentsApi}/stages/${StageName}"
    WebACLArn: !GetAtt TraxentApiWebAcl.Arn
```
HTTP APIs (user-data/news) also support WAF association — point a second `WebACLAssociation` at `arn:aws:apigateway:${AWS::Region}::/apis/${UserDataApi}/stages/$default`.

**(c)** Keep CloudFront in front of the static site (Shield Standard is automatic). For higher assurance later, consider routing the APIs through CloudFront too, and AWS Shield Advanced if traffic justifies it.
*(Confirm exact SAM property names against current docs before deploy; the resource shapes above are correct as of mid-2026.)*

### 4.2 🔴 H2 — Tighten deploy credentials
**Where:** `IAM-OIDC-SETUP.md` grants `cloudformation:*`, `lambda:*`, `dynamodb:*`, `apigateway:*`, `s3:*`, `iam:*` on `Resource: *`; `deploy.yml` (frontend) still authenticates with long-lived `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`.
**Why it matters:** A compromised Action run, a malicious dependency in the build, or a leaked key gives an attacker near-admin control of the AWS account (including `iam:*`). Static keys don't rotate and are the #1 cloud-breach root cause.
**Fix:**
1. **Migrate `deploy.yml` to the OIDC role** (add `permissions: id-token: write`, swap to `role-to-assume`) and **delete** the two access-key secrets. The role already includes `s3:*` + CloudFront.
2. **Scope the policy down** to the specific stacks/buckets/functions: replace `Resource: *` with the `traxent-*` stack ARNs, the `traxent.io` bucket, the named Lambdas, and constrain `iam:PassRole` to the exact SAM execution roles. Drop `cloudformation:Delete*` if deploys never delete.
3. **Pin the trust policy to `main`:** `repo:ansaldn/traxent:ref:refs/heads/main` (the doc notes this as optional — make it the default).

### 4.3 🟠 M1 — Gateway-level JWT authorizer (HTTP API)
Today auth runs *inside* each Lambda, so an unauthenticated flood still spins up (and bills) compute. HTTP APIs have a native JWT authorizer that rejects bad tokens at the edge:
```yaml
UserDataApi:
  Type: AWS::Serverless::HttpApi
  Properties:
    Auth:
      Authorizers:
        Auth0JWT:
          IdentitySource: "$request.header.Authorization"
          JwtConfiguration:
            issuer: https://auth.traxent.io/
            audience:
              - ilvfACgF2sCmLWaugCn11qTB04aTvWxz
              - YKvrjZoxnehdES7nmMs9SRXi3G0MdXcK
      DefaultAuthorizer: Auth0JWT
```
Lambdas keep their own plan/sub checks (the authorizer only proves the token is valid). CORS preflight is unaffected. The webhook stays unauthenticated by design (Stripe signature is its auth) — it's on the REST API, so no change needed there.

### 4.4 🟠 M2 — Detection: CloudWatch alarms + billing budget
```yaml
CheckoutErrorAlarm:
  Type: AWS::CloudWatch::Alarm
  Properties:
    AlarmName: traxent-checkout-errors
    Namespace: AWS/Lambda
    MetricName: Errors
    Dimensions: [{ Name: FunctionName, Value: !Ref CreateCheckoutFunction }]
    Statistic: Sum
    Period: 300
    EvaluationPeriods: 1
    Threshold: 5
    ComparisonOperator: GreaterThanOrEqualToThreshold
    TreatMissingData: notBreaching

MonthlyBudget:
  Type: AWS::Budgets::Budget
  Properties:
    Budget: { BudgetType: COST, TimeUnit: MONTHLY, BudgetLimit: { Amount: 50, Unit: USD } }
    NotificationsWithSubscribers:
      - Notification: { NotificationType: ACTUAL, ComparisonOperator: GREATER_THAN, Threshold: 80 }
        Subscribers: [{ SubscriptionType: EMAIL, Address: davidansa00@gmail.com }]
```
Add equivalents for `traxent-user-data` errors, DynamoDB `ThrottledRequests`, and WAF `BlockedRequests` (spikes = attack signal).

### 4.5 🟠 M4 — Supply-chain hygiene
- **Pin dependencies** to exact versions and commit lockfiles; `deploy-backend.yml` deliberately runs `npm install` (not `npm ci`) and zips **without** the lockfile, so production builds are non-reproducible and can silently pull a newer (possibly compromised) minor. Fix the lockfiles and switch to `npm ci`.
- You're on `aws-jwt-verify ^4.0.1` (latest is **5.2.0**) and `stripe ^21.0.1` (latest major is **22+**). Neither has a known advisory, but review the majors and pin.
- **Enable Dependabot** (or `npm audit --audit-level=high` as a CI gate) on `backend/**`.
- **Add SRI** to the Auth0 SDK `<script>` (pin a specific version + `integrity`/`crossorigin`) so a CDN compromise can't inject code.

### 4.6 🟠 M5 — Verify S3 / CloudFront (couldn't confirm from repo)
`deploy.yml` does `aws s3 sync src/ s3://traxent.io`. Confirm in the console: **Block Public Access = ON** at the bucket, the bucket is served **only** via CloudFront **Origin Access Control** (not a public website endpoint), and bucket-policy access is restricted to the distribution. A directly-readable origin bucket is a classic exposure.

### 4.7 🟢 B — AWS account baseline
Confirm/enable: **root account MFA** + no root access keys, IAM Identity Center for human access, **CloudTrail** (all-region) to an access-locked bucket, **GuardDuty**, **AWS Config**, and **Security Hub** (turn on the AWS Foundational Security Best Practices standard — it'll surface most of §4 automatically going forward).

---

## 5. Auth0 & Stripe configuration

### 5.1 🟠 M6 — Auth0 tenant hardening
- **Attack Protection** (Dashboard → Security): enable Brute-force, Breached-password detection, and Suspicious-IP throttling — this is your front-line defense against credential stuffing on the login surface.
- **Admin MFA** on the Auth0 dashboard accounts; **rotate** the M2M client secrets used by the webhook and delete-account Lambdas; keep those two M2M apps **separate** (they are today ✅) and scoped to the minimum (`read:roles`/`update:users` vs `delete:users`).
- **Log streaming** to CloudWatch/Datadog so failed-login spikes are visible.
- **Token model:** the `audience`-less ID-token-as-API-token works but blocks Auth0's API RBAC/scoped access tokens and per-API revocation. If you later stand up a proper Auth0 API, switch the verifiers' `audience` and issue short-lived access tokens (ties into H3).

### 5.2 🟡 L3 — Stripe restricted keys + Radar
All functions load one full-access secret key. Issue **restricted keys** per function (checkout: write customers/checkout; cancel: read/write subscriptions; webhook: read events) so a single leaked key is bounded. Enable **Stripe Radar** for fraud, and keep webhook signing secrets per-endpoint. Secrets correctly live in SSM SecureString ✅.

---

## 6. iOS app (Swift)

**Overall: the strongest part of the stack.** Tokens are stored in the **Keychain** via Auth0's `CredentialsManager` (not `UserDefaults` — only a non-sensitive `"web"/"apple"` method string is in defaults), StoreKit 2 purchases are validated with `.verified` checks (unverified transactions never grant access), the web-auth session is **ephemeral**, there's **no sensitive logging**, **no ATS exceptions** (default App Transport Security enforces TLS 1.2+), and **no custom URL scheme** is registered (so no deep-link hijack surface).

### 6.1 🟢 Confirmed-good
Keychain token storage · StoreKit signature verification · ephemeral `ASWebAuthenticationSession` · `#if DEBUG`-gated `debug_ignore_web_plan` (not in release) · server re-verifies the token on every API call, so the locally-decoded plan claim is UI-only.

### 6.2 🟡 L1 — Add certificate / public-key pinning
API calls use `URLSession.shared` with default trust. For a paid product carrying auth tokens, pin the `auth.traxent.io` / `execute-api` leaf or intermediate public key via a `URLSessionDelegate` (`urlSession(_:didReceive:completionHandler:)`) to defeat a mis-issued or corporate-MITM certificate. Plan a rotation strategy (pin the intermediate, ship a backup pin) so a cert change doesn't brick the app.

### 6.3 🟡 L2 — Validate external article URLs
`NewsView` opens Alpha Vantage article URLs in `SafariView`. `SFSafariViewController` only loads `http(s)`, but guard explicitly before presenting:
```swift
guard let u = URL(string: article.url), u.scheme == "https" else { return }
```

### 6.4 Optional hardening (low priority for this risk profile)
No money or PII is stored on-device and the server is authoritative, so jailbreak detection / anti-tamper and screenshot-obscuring are **optional**. Worth it only if you later cache sensitive data locally.

---

## 7. What's already done right (don't regress)

Server-side token verification on every endpoint · identity from the verified `sub`, never the body · parameterized DynamoDB with strict per-user partitioning and field whitelisting · Stripe webhook signature verification on the raw body · secrets in SSM SecureString (none in the repo) · DynamoDB SSE + point-in-time recovery · CORS locked to the real origin · strong CSP / HSTS / `frame-ancestors 'none'` / `nosniff` via the CloudFront Function · OIDC (not static keys) for the backend/infra deploys · IaC under version control · iOS Keychain token storage + verified StoreKit · per-deploy cache-busting so a poisoned `auth.js` can't persist.

---

## 8. Suggested sequence

1. **This week (high value, low effort):** WAF + API GW throttling (H1), CloudWatch alarms + budget (M2), migrate frontend deploy to OIDC and delete static keys (H2 part 1), enable Auth0 Attack Protection + admin MFA (M6), confirm S3 Block Public Access/OAC (M5).
2. **Next:** HTTP API JWT authorizer (M1), scope the IAM policy (H2 part 2), Dependabot + lockfile/`npm ci` + SRI (M4), Stripe restricted keys (L3), email-injection guard (M3).
3. **Then:** shorten Auth0 token TTL and move toward nonce-CSP / BFF (H3), iOS cert pinning (L1), webhook idempotency (L4), account-baseline services (GuardDuty/Config/Security Hub).

*This report reviews source code and configuration only; it is not a penetration test. A live pen-test and a one-time third-party review are worth commissioning before any major scaling event.*
