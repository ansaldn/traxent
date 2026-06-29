# Secure Development Policy

| | |
|---|---|
| **Document owner** | David Ansah (Engineering / Security Lead) |
| **Version** | 1.0 |
| **Effective date** | 2026-06-29 |
| **Review cadence** | At least annually |
| **Classification** | Internal |
| **Related** | `access-control-policy.md`, `../../SECURITY.md`, `../../SECURITY-AUDIT.md`, `../../IAM-OIDC-SETUP.md` |

---

## 1. Purpose

To build and ship Traxent securely — preventing common vulnerability classes in code and configuration, keeping secrets out of source, and ensuring changes are reviewed and reproducible. This codifies the practices already evidenced in the codebase and the gaps recorded in `../../SECURITY-AUDIT.md`.

## 2. Secure coding standards

We design and code against the **OWASP Top 10**. Established practices in Traxent (keep them; don't regress):

- **Authentication & authorisation server-side.** Every backend endpoint verifies the Auth0 token (RS256 via JWKS) and derives identity from the **verified `sub`**, never from the request body. Plan/entitlement checks that matter are enforced server-side.
- **Per-user data isolation.** DynamoDB access is partitioned by the user's `sub`; write paths whitelist fields and bound lengths.
- **Injection-safe data access.** DynamoDB via the **parameterized** DocumentClient (no string-built queries). Any external query language (e.g. Stripe Search) must escape/validate interpolated values or, better, use exact metadata matches.
- **Output encoding.** User/third-party data is escaped before insertion into the DOM (`esc()` / `textContent`); avoid `innerHTML` with untrusted input.
- **Strong transport & headers.** HTTPS everywhere with HSTS; a strict Content-Security-Policy, `frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, locked `Referrer-Policy` and `Permissions-Policy` (via the CloudFront Function). CORS is locked to `https://traxent.io`, not `*`.
- **Webhook integrity.** Stripe webhooks are verified against the raw body using the signing secret.
- **iOS.** Tokens in the **Keychain**; StoreKit purchases validated; default App Transport Security (TLS 1.2+); no sensitive logging.

Active hardening items (tracked in `risk-register.md` / `SECURITY-AUDIT.md`): move toward a **nonce-based CSP** (drop `unsafe-inline`), shorten Auth0 token lifetime, add **API Gateway throttling + WAF** on all public APIs, add an **HTTP API JWT authorizer**, and add **SRI** to the Auth0 SDK script tag.

## 3. Secrets management

- **No secrets in source, ever.** All secrets live in **AWS SSM Parameter Store (SecureString)** and are read at runtime by Lambdas via a least-privilege `ssm:GetParameter` policy scoped to `traxent/*`. The client-side bundle contains only public values (Auth0 *client* ID, public API URLs).
- **No secrets** in logs, error messages, commits, chat or email.
- Use **`.gitignore`** for any local env files; never commit `.env` or key material.
- Prefer **Stripe restricted keys** scoped per function and rotate secrets on schedule and on any suspected exposure (see `access-control-policy.md` §5).
- *(Recommended: enable secret-scanning / push protection on the GitHub repo to catch accidental commits.)*

## 4. Infrastructure as Code (IaC)

- Infrastructure is defined in **SAM / CloudFormation** and version-controlled, so the environment is reproducible and reviewable rather than hand-built in a console.
- IaC changes go through the same review and CI/CD flow as application code.
- IAM in IaC follows **least privilege** (e.g. function policies scoped to `traxent/*` SSM and specific DynamoDB tables). Continue narrowing broad grants (see `SECURITY-AUDIT.md` §4.1–4.2).

## 5. CI/CD & deployment

- Deployment is automated via **GitHub Actions**. Backend/infra workflows authenticate to AWS via **OIDC short-lived credentials** — **no static AWS keys** (see `../../IAM-OIDC-SETUP.md`).
- **Open gap:** the frontend `deploy.yml` still uses static access keys — migrate to OIDC and delete the keys (`risk-register.md` R-02).
- Builds should be **reproducible**: commit accurate lockfiles and use `npm ci` rather than `npm install` so production builds don't silently pull newer (possibly compromised) dependency versions (`SECURITY-AUDIT.md` M4). *(Currently some functions use `npm install` due to out-of-sync lockfiles — fix the lockfiles, then switch.)*
- Deploys are scoped to **`main`**; the OIDC trust policy should be pinned to the `main` branch.

## 6. Code review & branch protection

- Changes that affect security-relevant code (auth, payments, data access, IaC, CI) should be **reviewed** before reaching `main`.
- **Enable branch protection** on `main`: require pull requests, require status checks to pass, and (as the team grows) require review approval. For a solo founder, at minimum require PRs + passing CI and use the PR as a self-review checkpoint. *(Branch protection = Planned/Partial — `controls-matrix.md`.)*
- Use the repo's existing security artifacts (`../../SECURITY.md`, `../../SECURITY-AUDIT.md`) as the review baseline, and the `/security-review` workflow before significant merges.

## 7. Dependency & supply-chain hygiene

- **Pin** dependencies to exact versions and commit lockfiles.
- **Enable Dependabot** (or `npm audit --audit-level=high` as a CI gate) on `backend/**` to surface vulnerable/outdated packages (`SECURITY-AUDIT.md` M4).
- Review major-version bumps of security-critical libraries (`aws-jwt-verify`, `stripe`, `@aws-sdk/*`) deliberately.
- Add **SRI** (`integrity` + `crossorigin`) to externally-loaded scripts (e.g. the Auth0 SDK) so a CDN compromise can't inject code.

## 8. Testing & verification

- Verify changes locally and via CI before deploy.
- Treat the OWASP Top 10 and AWS Well-Architected Security pillar as the checklist for security-relevant work.
- Commission an independent **penetration test** before any major scaling event (the in-repo audits review code/config, not a live pen-test).

## 9. Change management & review

Significant changes are recorded via Git history and (where relevant) the task tracker. This policy is reviewed on the cadence above.

| Version | Date | Author | Change |
|---------|------|--------|--------|
| 1.0 | 2026-06-29 | David Ansah | Initial secure development policy. |
