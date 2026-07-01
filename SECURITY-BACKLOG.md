# Traxent — Security Remediation Backlog

Status as of 2026-06-29.
**✅ done · 🧩 code committed (push to ship) · 👤 your action — steps in `SECURITY-ACTIONS.md` · 🔭 planned/deferred.**
Severity: 🔴 High · 🟠 Medium · 🟡 Low · 🟢 baseline.

## Done / shipped
- [x] ✅ 🔴 **H1** Rate limiting on the user-data API — via **HTTP API stage throttling** (`DefaultRouteSettings`: 100 req/s, 200 burst). NOTE: the earlier WAF WebACL approach was invalid (AWS WAF does **not** support API Gateway HTTP APIs, only REST APIs) and never deployed; removed. Per-IP WAF would require fronting the API with CloudFront (deferred).
- [x] ✅ 🔴 **H1** API Gateway throttling — in `backend/template.yaml`; lands when the `-v2` payments cutover deploys. Until then apply it to the live API via CLI (`SECURITY-ACTIONS.md` §6 Payments)
- [x] ✅ 🔴 **H2a** Frontend `deploy.yml` on OIDC; static `AWS_ACCESS_KEY_*` secrets removed
- [x] 🧩 🟠 **M2** CloudWatch alarms (Lambda errors, **DynamoDB throttle**, WAF blocks) + SNS email + $50 budget — *push `backend/user-data/**`, then confirm the SNS email*
- [x] 🧩 🟠 **M3** Stripe-search injection guard in `cancel-subscription` + `delete-account`
- [x] 🧩 🟡 **L5** `create-checkout` uses the verified token email (not body)
- [x] 🧩 🟡 **L2** iOS: external article URLs https-validated (`safeURL`) before opening
- [x] 🧩 🟠 **M4** Dependabot enabled for all six Lambda dirs + GitHub Actions
- [x] 🧩 🟡 **L3** Per-function restricted-key *support* in code (env-var w/ fallback) — keys/SSM are your step
- [x] ✅ 🔴 **H2b** OIDC deploy policy scoped from `*` to `traxent-*` / account resources (§1b); trust policy pinned to `main` (§1c)
- [x] ✅ 🟠 **M4** SRI on the Auth0 SDK — pinned to `auth0-spa-js@2.0.8` with `integrity` + `crossorigin` on all 20 pages (§2)
- [x] ✅ 🟠 **Auth0** Allowed Callback URLs updated (`/home`, `/admin`); m2m app granted `read:users` (admin metrics) — `update:users` already present
- [x] ✅ 🔴 **H3** Auth0 ID-token lifetime shortened to **5400s (1.5h)** — within the 1–2h target (§6 H3)
- [x] ✅ 🟠 **M6** Auth0: attack protection on, admin MFA, tenant logging, M2M least-privilege (secret rotation = scheduled hygiene, no exposure to date)
- [x] ✅ 🔵 **Payments** Resolved via **resource adoption**, not a `-v2` cutover: the checkout/cancel/webhook Lambdas + REST API (`da579ew81m`) are owned by the `traxent-backend` SAM stack and deploy via `deploy-payments.yml`; webhook path corrected to `/webhooks/stripe`; `change-plan` (proration) added; `da579ew81m` retained — no repoint/retire needed

## Your action — step by step in `SECURITY-ACTIONS.md`
- [ ] 👤 🟡 **deps** Review dependency pins: `aws-jwt-verify` 4→5, `stripe` 21→22 (the M4 SRI half is now done — see above)
- [ ] 👤 🟡 **L3** Create the 4 restricted keys → SSM → set `STRIPE_KEY_PARAM` env per function (§5)
- [ ] 👤 🟢 **B** AWS account baseline — done: ✅ root MFA · ✅ all-region CloudTrail (multi-region + log-file validation → S3) · ✅ GuardDuty. Remaining: ◻ AWS Config · ◻ Security Hub (CIS/FSBP posture score)

## Planned / deferred (deliberate changes, not quick toggles)
- [ ] 🔭 🟠 **M1** HTTP API JWT authorizer — code ready in §6 M1; apply as a **standalone, verified** deploy (it's the one change that can break *all* API auth) with the rollback noted
- [ ] 🔭 🔴 **H3** Nonce/hash CSP (drop `script-src 'unsafe-inline'`) — sizeable refactor (move inline handlers to `addEventListener`)
- [ ] 🔭 🟡 **L1** iOS certificate / public-key pinning — needs your real pin; scaffold + steps in §6 L1
- [ ] 🔭 🟡 **L4** Stripe webhook idempotency (dedup table) — do *after* the payments cutover settles
- [ ] 🔭 🟡 **M5** S3→CloudFront OAC migration (private bucket) — low priority; runbook in §3

## Already verified good (don't regress)
Server-side JWT verification on every endpoint · identity from `sub` not body · parameterized DynamoDB + per-user partition + field whitelist · webhook signature on raw body · secrets in SSM SecureString · DynamoDB SSE + PITR · locked CORS + strong headers · OIDC for backend deploys · iOS Keychain tokens + verified StoreKit · ephemeral iOS auth session · no ATS exceptions · no sensitive logging.
