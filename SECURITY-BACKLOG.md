# Traxent — Security Remediation Backlog

Status as of 2026-06-28.
**✅ done · 🧩 code committed (push to ship) · 👤 your action — steps in `SECURITY-ACTIONS.md` · 🔭 planned/deferred.**
Severity: 🔴 High · 🟠 Medium · 🟡 Low · 🟢 baseline.

## Done / shipped
- [x] ✅ 🔴 **H1** WAF (per-IP rate limit + AWS managed rules in count mode) on the user-data API
- [x] ✅ 🔴 **H1** API Gateway throttling — in `backend/template.yaml`; lands when the `-v2` payments cutover deploys. Until then apply it to the live API via CLI (`SECURITY-ACTIONS.md` §6 Payments)
- [x] ✅ 🔴 **H2a** Frontend `deploy.yml` on OIDC; static `AWS_ACCESS_KEY_*` secrets removed
- [x] 🧩 🟠 **M2** CloudWatch alarms (Lambda errors, **DynamoDB throttle**, WAF blocks) + SNS email + $50 budget — *push `backend/user-data/**`, then confirm the SNS email*
- [x] 🧩 🟠 **M3** Stripe-search injection guard in `cancel-subscription` + `delete-account`
- [x] 🧩 🟡 **L5** `create-checkout` uses the verified token email (not body)
- [x] 🧩 🟡 **L2** iOS: external article URLs https-validated (`safeURL`) before opening
- [x] 🧩 🟠 **M4** Dependabot enabled for all six Lambda dirs + GitHub Actions
- [x] 🧩 🟡 **L3** Per-function restricted-key *support* in code (env-var w/ fallback) — keys/SSM are your step

## Your action — step by step in `SECURITY-ACTIONS.md`
- [ ] 👤 🔴 **H2b** Scope the OIDC deploy policy down from `*` (§1b)
- [ ] 👤 🔵 **Payments** Finish the `-v2` payments cutover: repoint frontend + Stripe webhook to the new API, verify, retire `da579ew81m` (§6 Payments / `PAYMENTS-IMPORT-RUNBOOK.md`)
- [ ] 👤 🟠 **M6** Auth0 (free tier): confirm Brute-force + Suspicious-IP on; admin MFA; M2M least-priv + rotate secrets (§4)
- [ ] 👤 🔴 **H3** Shorten the Auth0 ID-token lifetime to 1–2h (§6 H3)
- [ ] 👤 🟠 **M4** Add SRI to the Auth0 SDK tag (§2); review `aws-jwt-verify` 4→5 / `stripe` 21→22 pins
- [ ] 👤 🟡 **L3** Create the 4 restricted keys → SSM → set `STRIPE_KEY_PARAM` env per function (§5)
- [ ] 👤 🟢 **B** AWS account baseline: root MFA, all-region CloudTrail, GuardDuty, Config, Security Hub

## Planned / deferred (deliberate changes, not quick toggles)
- [ ] 🔭 🟠 **M1** HTTP API JWT authorizer — code ready in §6 M1; apply as a **standalone, verified** deploy (it's the one change that can break *all* API auth) with the rollback noted
- [ ] 🔭 🔴 **H3** Nonce/hash CSP (drop `script-src 'unsafe-inline'`) — sizeable refactor (move inline handlers to `addEventListener`)
- [ ] 🔭 🟡 **L1** iOS certificate / public-key pinning — needs your real pin; scaffold + steps in §6 L1
- [ ] 🔭 🟡 **L4** Stripe webhook idempotency (dedup table) — do *after* the payments cutover settles
- [ ] 🔭 🟡 **M5** S3→CloudFront OAC migration (private bucket) — low priority; runbook in §3

## Already verified good (don't regress)
Server-side JWT verification on every endpoint · identity from `sub` not body · parameterized DynamoDB + per-user partition + field whitelist · webhook signature on raw body · secrets in SSM SecureString · DynamoDB SSE + PITR · locked CORS + strong headers · OIDC for backend deploys · iOS Keychain tokens + verified StoreKit · ephemeral iOS auth session · no ATS exceptions · no sensitive logging.
