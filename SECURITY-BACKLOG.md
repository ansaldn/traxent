# Traxent — Security Remediation Backlog

Working checklist derived from `SECURITY-AUDIT.md` (2026-06-28). Tick items as you close them.
Severity: 🔴 High · 🟠 Medium · 🟡 Low · 🟢 baseline/verify.

## Phase 1 — This week (high value, low effort)
- [ ] 🔴 **H1** Add API Gateway throttling on the payments REST API (`MethodSettings`, ~20 rps / 40 burst) — `backend/template.yaml`
- [ ] 🔴 **H1** Add WAFv2 WebACL (rate-based rule + AWS common rules) and associate to both API stages
- [ ] 🔴 **H2a** Migrate `deploy.yml` (frontend) to the OIDC role; delete `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` secrets
- [ ] 🟠 **M2** CloudWatch alarms (Lambda Errors, DynamoDB ThrottledRequests, WAF BlockedRequests) + AWS Budgets billing alert
- [ ] 🟠 **M5** Confirm S3 `traxent.io` = Block Public Access ON, served only via CloudFront OAC
- [ ] 🟠 **M6** Auth0: enable Attack Protection (brute-force, breached-password, suspicious-IP); enable admin MFA

## Phase 2 — Next
- [ ] 🟠 **M1** Add HTTP API JWT authorizer to the user-data/news API (`AWS::Serverless::HttpApi` → `Auth`)
- [ ] 🔴 **H2b** Scope the OIDC deploy policy from `*:*` on `*` down to `traxent-*` stacks/bucket/functions; constrain `iam:PassRole`; pin trust to `refs/heads/main`
- [ ] 🟠 **M4** Fix Lambda lockfiles; switch CI to `npm ci`; enable Dependabot / `npm audit` gate on `backend/**`
- [ ] 🟠 **M4** Pin `aws-jwt-verify` (review 4→5) and `stripe` (review 21→22); add SRI to the Auth0 SDK `<script>`
- [ ] 🟠 **M3** Add email/identifier injection guard before Stripe `customers.search`; prefer exact `auth0_sub` metadata match
- [ ] 🟡 **L3** Issue per-function Stripe **restricted** keys; enable Stripe Radar
- [ ] 🟡 **L5** `create-checkout`: use verified token `email` claim instead of body `userEmail`

## Phase 3 — Then
- [ ] 🔴 **H3** Shorten Auth0 ID-token TTL (10h → 1–2h)
- [ ] 🔴 **H3** Move to nonce/hash-based CSP (drop `script-src 'unsafe-inline'`); longer term, BFF httpOnly-cookie session
- [ ] 🟡 **L1** iOS: certificate / public-key pinning via `URLSessionDelegate` (+ backup pin / rotation plan)
- [ ] 🟡 **L2** iOS: validate `scheme == "https"` before opening external article URLs
- [ ] 🟡 **L4** Stripe webhook idempotency (dedupe on `event.id` with TTL)
- [ ] 🟢 **B** AWS account baseline: root MFA, all-region CloudTrail, GuardDuty, Config, Security Hub (FSBP standard)

## Already verified good (don't regress)
Server-side JWT verification on every endpoint · identity from `sub` not body · parameterized DynamoDB + per-user partition + field whitelist · webhook signature on raw body · secrets in SSM SecureString · DynamoDB SSE + PITR · locked CORS + strong headers · OIDC for backend deploys · iOS Keychain tokens + verified StoreKit · ephemeral iOS auth session · no ATS exceptions · no sensitive logging.
