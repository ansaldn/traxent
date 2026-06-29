# Risk Register

| | |
|---|---|
| **Document owner** | David Ansah (Security Lead) |
| **Version** | 1.0 |
| **Last reviewed** | 2026-06-29 |
| **Review cadence** | At least quarterly, and after any incident or major change |
| **Classification** | Internal |

---

## How to use this

This is a **living** register of Traxent's security and compliance risks. Each risk has a **likelihood** and **impact** (Low / Medium / High), a derived **rating**, a **mitigation/treatment**, an **owner** and a **status**. Review quarterly: re-score, close what's done, add what's new. Treatment options: **Mitigate**, **Accept** (with sign-off), **Transfer** (vendor/insurer), **Avoid**.

**Rating guide:** rating ≈ likelihood × impact. High×High = Critical; High×Medium / Medium×High = High; Medium×Medium = Medium; anything with a Low = Low/Medium.

Many entries are drawn from `../../SECURITY-AUDIT.md`; the audit ID is referenced where applicable.

## Register

| ID | Risk | Likelihood | Impact | Rating | Mitigation / treatment | Owner | Status |
|----|------|-----------|--------|--------|------------------------|-------|--------|
| **R-01** | No WAF / API Gateway throttling on public APIs → volumetric or app-layer DoS that also **amplifies cost** (on-demand Lambda + DynamoDB scale with the attack) (audit **H1**) | Medium | High | **High** | Add **AWS WAF** rate-based rules + AWS managed common rules and **API Gateway throttling** on all public APIs; add an HTTP API JWT authorizer to reject junk before compute. Rollout in progress. | David | **In progress** |
| **R-02** | Over-broad / static deploy credentials: OIDC policy is broad on `Resource: *` and the **frontend `deploy.yml` still uses long-lived AWS access keys** (audit **H2**) | Medium | High | **High** | Migrate `deploy.yml` to **OIDC** and delete the static keys; scope the OIDC policy to `traxent-*` stacks/buckets/functions; constrain `iam:PassRole`; pin trust to `main`. | David | **Open** |
| **R-03** | Web ID token in `localStorage` under a CSP that allows `unsafe-inline` → any future XSS becomes token theft / account takeover (audit **H3**) | Low | High | **Medium** | Shorten Auth0 token TTL (quick win); move to a **nonce/hash-based CSP** (drop `unsafe-inline`); consider a BFF/HttpOnly-cookie session long-term. Compensating controls: consistent output-escaping, locked CORS, `frame-ancestors 'none'`, server-side re-verification. | David | **Open** |
| **R-04** | Thin detection: not all CloudWatch alarms configured and no billing budget → an attack or cost runaway is invisible until the bill (audit **M2**) | Medium | Medium | **Medium** | Add CloudWatch alarms (Lambda errors/throttles, DynamoDB throttling, WAF blocks) + **AWS Budgets** with email alerts. | David | **In progress** |
| **R-05** | Supply-chain drift: floating `^` deps and `npm install` (not `npm ci`) in CI, no Dependabot, no SRI on the Auth0 SDK → a compromised/newer dependency or CDN could inject code (audit **M4**) | Low | High | **Medium** | Pin deps + commit lockfiles + `npm ci`; enable **Dependabot**/`npm audit` gate; add **SRI** to external scripts; enable secret-scanning/push protection. | David | **Open** |
| **R-06** | Single full-access Stripe key reused across functions → one leaked key has broad blast radius (audit **L3**) | Low | Medium | **Low–Medium** | Issue **restricted keys** per function (checkout / cancel / webhook); keep secrets in SSM; rotate on schedule and on suspicion. | David | **Open** |
| **R-07** | Sub-processor failure or breach (AWS / Auth0 / Stripe / Plausible / Formspree / GitHub) affecting availability or data | Low | High | **Medium** | Maintain `vendor-management.md` with DPAs + current certifications; monitor status pages; `incident-response-plan.md` covers vendor incidents; data hosted in `eu-west-2`. | David | **Mitigated (ongoing)** |
| **R-08** | Compliance/diligence gaps: no formal SOC 2 / ISO 27001; entity name now reconciled to **Akpan Limited** across all public surfaces (resolved in code); ICO registration, Companies House number & registered address still to confirm | Medium | Medium | **Medium** | Run the `COMPLIANCE-ROADMAP.md` plan; confirm ICO data-protection-fee registration, Companies House number & registered address. | David | **Open** |
| **R-09** | Key-person dependency: one person holds all security, ops and data-protection roles → knowledge/availability risk | High | Medium | **High** | Keep this documentation current so the role is transferable; use a password manager with recovery; document runbooks; delegate roles as the team grows. | David | **Accepted (monitored)** |
| **R-10** | Loss/corruption of production data in DynamoDB (accidental deletion, bad migration, bug) | Low | High | **Medium** | **PITR** enabled on production tables (verify); on-demand backup before risky changes; tested restores annually (`business-continuity-backup.md`). | David | **Mitigated** |
| **R-11** | Credential-stuffing / brute-force against the Auth0 login surface | Medium | Medium | **Medium** | Enable Auth0 **Attack Protection** (brute-force, breached-password, suspicious-IP throttling); MFA available to users; admin MFA on the tenant (audit **M6**). | David | **In progress** |
| **R-12** | S3 bucket public via the website endpoint (bypasses CloudFront/WAF/HTTPS) — content is non-sensitive static site (audit **M5**) | Low | Low | **Low** | Deferred but planned: migrate CloudFront origin to S3 REST + **Origin Access Control**, then enable Block Public Access. No secrets in the bucket. | David | **Accepted (planned fix)** |
| **R-13** | Mishandled data-subject request or missed **72-hour** breach notification → UK GDPR non-compliance | Low | High | **Medium** | `data-protection-policy.md` + `incident-response-plan.md` define the process and triggers; request log maintained; self-service deletion reduces volume. | David | **Mitigated** |

## Review log

| Date | Reviewer | Notes |
|------|----------|-------|
| 2026-06-29 | David Ansah | Initial register created from current architecture and `SECURITY-AUDIT.md`. |
| 2026-06-29 | David Ansah | R-08: entity name reconciled to **Akpan Limited** across `privacy.html`, `terms.html`, `security.txt` and `security.html` (code change). ICO registration + Companies House number/address confirmation remain open; R-08 stays open. |
