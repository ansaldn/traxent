# Unified Control Matrix — ISO/IEC 27001:2022 ⨉ SOC 2

| | |
|---|---|
| **Owner** | David Ansah (Security Lead) |
| **Version** | 1.0 · **Date** 2026-06-29 · **Classification** Internal |
| **Purpose** | The single, audit-facing view: **one control set, two frameworks.** Each row maps a control area to its **ISO 27001:2022 Annex A** reference and its **SOC 2 Trust Services Criteria** reference, states what Traxent actually does, an honest status, and where the evidence lives in this repository or a named system. |

> **No certification is claimed.** No ISO 27001 certificate and no SOC 2 report exist — **no external audit has been performed.** Statuses are honest (legend in [`README.md`](README.md)). This table is the concrete demonstration of the ~80% overlap that makes the ISO-led + SOC-2-mapped strategy efficient: the great majority of rows satisfy **both** columns from the same implementation.

**Status legend:** **Implemented** · **Partial** · **Planned** · **Owner-action** (needs a console/dashboard/registry/paid engagement — David's checklist) · **Inherited** (provided by a certified sub-processor).

---

## A. Governance, risk & organisation

| Control area | ISO 27001 Annex A | SOC 2 TSC | What Traxent does to satisfy it | Status | Evidence / location |
|--------------|-------------------|-----------|----------------------------------|--------|---------------------|
| Information security policy / ISMS | A.5.1 | CC1.1, CC5.3 | Documented ISMS with an honesty principle, owned by the Security Lead, reviewed at least annually | Implemented | [`../information-security-policy.md`](../information-security-policy.md) |
| Roles & responsibilities | A.5.2, A.5.3 | CC1.2–CC1.4 | Security Lead role assigned; segregation noted as a scale-up item while solo | Implemented (solo) | [`../information-security-policy.md`](../information-security-policy.md) §4 |
| ISMS scope & context | A.5.1 (Clause 4) | CC1.1, CC3.1 | Scope, boundaries, interested parties, exclusions defined | Implemented | [`isms-scope.md`](isms-scope.md) |
| Risk management | A.5.1; Clauses 6/8 | CC3.1–CC3.4, CC9.1 | Documented methodology + living register, quarterly review | Implemented | [`risk-assessment-and-treatment.md`](risk-assessment-and-treatment.md), [`../risk-register.md`](../risk-register.md) |
| Statement of Applicability | Annex A (mandatory) | CC5.1 | All 93 Annex A controls assessed for applicability + status | Implemented | [`statement-of-applicability.md`](statement-of-applicability.md) |
| Security objectives (measurable) | Clause 6.2 | CC3.1 | Seeded by the register; quantified/dated objectives still to be written | Planned / Owner-action | [`risk-assessment-and-treatment.md`](risk-assessment-and-treatment.md) §6 |
| Threat intelligence | A.5.7 | CC7.1 | Dependabot alerts, vendor advisories, status-page monitoring | Implemented | [`.github/dependabot.yml`](../../../.github/dependabot.yml) |
| Contact with authorities / SIGs | A.5.5, A.5.6 | CC2.3 | ICO as supervisory authority; vendor security teams; disclosure channel | Implemented | [`../data-protection-policy.md`](../data-protection-policy.md), [`../incident-response-plan.md`](../incident-response-plan.md) |
| Legal & contractual requirements | A.5.31, A.5.32, A.5.34 | CC2.3, P-series | UK GDPR/DPA mapping; IP ownership in Terms; PII protection | Implemented | [`../data-protection-policy.md`](../data-protection-policy.md), [`../../../src/terms.html`](../../../src/terms.html) |
| Independent review of infosec | A.5.35 | CC4.1 | Self-review today; external pen-test/review planned | Planned / Owner-action | [`../secure-development-policy.md`](../secure-development-policy.md) §8 |
| Compliance monitoring | A.5.36 | CC4.1, CC4.2 | Quarterly control/risk review; deficiencies tracked | Partial | [`../controls-matrix.md`](../controls-matrix.md) |

## B. People

| Control area | ISO 27001 Annex A | SOC 2 TSC | What Traxent does to satisfy it | Status | Evidence / location |
|--------------|-------------------|-----------|----------------------------------|--------|---------------------|
| Security awareness & training | A.6.3 | CC1.4, CC2.2 | Read-and-agree to policies; founder maintains the pack; scales with hires | Implemented (solo) | [`../information-security-policy.md`](../information-security-policy.md) |
| Screening / terms / NDA / disciplinary / off-boarding | A.6.1, A.6.2, A.6.4, A.6.5, A.6.6 | CC1.4 | Lightweight while solo; HR-style controls to formalise on first hire/contractor | Partial / Owner-action | [`../access-control-policy.md`](../access-control-policy.md) §6 |
| Remote working | A.6.7 | CC6.7 | Founder works remotely on managed endpoints; MFA on all admin accounts | Partial | [`../access-control-policy.md`](../access-control-policy.md) |
| Security event reporting | A.6.8 | CC2.3, CC7.3 | Public `security.txt` + `/security`; internal "report immediately" rule | Implemented | [`../vulnerability-disclosure-policy.md`](../vulnerability-disclosure-policy.md) |

## C. Identity, access & cryptography

| Control area | ISO 27001 Annex A | SOC 2 TSC | What Traxent does to satisfy it | Status | Evidence / location |
|--------------|-------------------|-----------|----------------------------------|--------|---------------------|
| Authentication (delegated) | A.5.17, A.8.5 | CC6.1 | Auth0 issues tokens; every API verifies issuer/audience/signature/expiry server-side | Implemented | [`admin-metrics/index.mjs`](../../../backend/user-data/functions/admin-metrics/index.mjs) (JwtRsaVerifier pattern, all functions) |
| Identity & access management | A.5.16, A.5.18 | CC6.1, CC6.2 | Auth0 user lifecycle; identity from token `sub`, never request body; self-service deletion | Implemented | [`account-update/index.mjs`](../../../backend/user-data/functions/account-update/index.mjs), [`delete-account/index.mjs`](../../../backend/user-data/functions/delete-account/index.mjs) |
| Access control / least privilege | A.5.15, A.8.2, A.8.3 | CC6.1, CC6.3 | Per-user DynamoDB partition isolation; admin allow-list (`ADMIN_SUBS`, deny-by-default); scoped Lambda roles | Implemented | [`admin-metrics/index.mjs`](../../../backend/user-data/functions/admin-metrics/index.mjs) §authorize |
| MFA on privileged accounts | A.8.5 | CC6.1 | MFA on AWS/GitHub/Auth0/Stripe admin; MFA available to end users | Implemented (verify) / Owner-action | [`../access-control-policy.md`](../access-control-policy.md) §2 |
| Deploy credentials — OIDC, no static keys | A.5.17, A.8.4, A.8.9 | CC6.1, CC6.6, CC8.1 | Backend/infra deploy via GitHub→AWS OIDC short-lived tokens; **frontend `deploy.yml` still on static keys** | Partial (R-02) | [`../../../IAM-OIDC-SETUP.md`](../../../IAM-OIDC-SETUP.md), [`.github/workflows/`](../../../.github/workflows/) |
| Scoped IAM | A.8.2, A.8.3 | CC6.1, CC6.3 | Function policies scoped (e.g. `SSMParameterReadPolicy: traxent/*`); **deploy role still broad** | Partial (R-02) | SAM templates `backend/**/template.yaml` |
| Secrets management | A.8.24, A.5.15 | CC6.1 | All secrets in AWS SSM SecureString; none in the repo (scan clean) | Implemented | [`../secure-development-policy.md`](../secure-development-policy.md) §3 |
| Secret rotation / restricted keys | A.5.17 | CC6.1 | Per-function restricted Stripe keys supported in code; key creation + rotation pending | Partial (R-06) / Owner-action | [`../access-control-policy.md`](../access-control-policy.md) §5 |
| Access to source code | A.8.4 | CC6.1, CC6.3 | Private GitHub repo; OIDC for deploy; **branch protection = Owner-action** | Partial | GitHub repo settings |
| Encryption in transit | A.8.24 | CC6.7 | HTTPS/TLS 1.2+, HSTS (1 yr, includeSubDomains), `upgrade-insecure-requests` | Implemented | [`security-headers.js`](../../../backend/cloudfront-functions/security-headers.js) |
| Encryption at rest | A.8.24 | CC6.1, C1.1 | DynamoDB SSE; SSM KMS-backed SecureString | Implemented | [`../business-continuity-backup.md`](../business-continuity-backup.md) |

## D. Application & web security

| Control area | ISO 27001 Annex A | SOC 2 TSC | What Traxent does to satisfy it | Status | Evidence / location |
|--------------|-------------------|-----------|----------------------------------|--------|---------------------|
| Security response headers | A.8.9, A.8.26 | CC6.6, CC6.7 | CSP, `frame-ancestors 'none'`, HSTS, `nosniff`, Referrer-Policy, Permissions-Policy via CloudFront Function + meta CSP | Implemented | [`security-headers.js`](../../../backend/cloudfront-functions/security-headers.js) |
| CSP hardening (drop `unsafe-inline`) | A.8.26, A.8.28 | CC6.6 | Current CSP allows `unsafe-inline`; nonce/hash refactor designed, not applied | Planned (R-03) | [`../../../SECURITY-AUDIT.md`](../../../SECURITY-AUDIT.md) H3 |
| Application security requirements | A.8.26 | CC6.6, CC8.1 | Locked CORS to `https://traxent.io`; allow-listed methods; OPTIONS handling | Implemented | Lambda `headers` blocks (all functions) |
| Secure coding & input validation | A.8.25, A.8.28 | CC8.1 | Parameterized DynamoDB + field whitelist; email/length validation; identity from `sub`; webhook signature on raw body | Implemented | [`account-update/index.mjs`](../../../backend/user-data/functions/account-update/index.mjs), [`stripe-webhook/index.mjs`](../../../backend/functions/stripe-webhook/index.mjs) |
| Error handling (no stack-trace leakage) | A.8.28 | CC8.1 | Generic 4xx/5xx messages to clients; detail logged server-side only | Implemented | All `index.mjs` (generic `Server error` / `Failed to…`) |
| Cookie / token storage hygiene | A.8.5, A.8.24 | CC6.7 | Non-sensitive `tx_session` hint cookie set `Secure; SameSite=Lax`; cookieless analytics; iOS Keychain tokens | Implemented | [`../../../src/auth.js`](../../../src/auth.js) `setSessionHint` |
| Payment data handling (PCI) | A.5.19, A.5.20 | CC6.1, C1.1 | Stripe (PCI-DSS L1); no card data on Traxent servers | Inherited | [`../vendor-management.md`](../vendor-management.md) |
| Crawler exposure of internal surfaces | A.8.23, A.5.10 | CC6.6 | `noindex` on app pages; `robots.txt` disallows the authenticated surface incl. `/admin`, `/home` | Implemented | [`../../../src/robots.txt`](../../../src/robots.txt) |
| iOS app security | A.8.24, A.8.26 | CC6.1, CC6.7 | Keychain tokens, StoreKit verification, ATS, https-validated URLs; **cert-pinning Planned** | Partial | [`../../../SECURITY-AUDIT.md`](../../../SECURITY-AUDIT.md) §6 |

## E. Operations, monitoring & vulnerability management

| Control area | ISO 27001 Annex A | SOC 2 TSC | What Traxent does to satisfy it | Status | Evidence / location |
|--------------|-------------------|-----------|----------------------------------|--------|---------------------|
| Edge protection — WAF + throttling | A.8.20, A.8.21 | CC6.6, A1.1 | AWS WAF (rate limit + managed rules) + API GW throttling rolling out; JWT authorizer planned | In progress (R-01) / Owner-action | [`../../../SECURITY-AUDIT.md`](../../../SECURITY-AUDIT.md) §4.1 |
| Logging | A.8.15 | CC7.2, CC7.3 | CloudWatch logs per function; structured `console.error`/`warn` of security events | Implemented | All `index.mjs` |
| Monitoring & alerting | A.8.16 | CC7.1, CC7.2, A1.1 | CloudWatch alarms (Lambda errors, DynamoDB throttle, WAF blocks) + SNS + budget rolling out | Partial (R-04) / Owner-action | [`../business-continuity-backup.md`](../business-continuity-backup.md) §6 |
| Centralised audit logging | A.8.15 | CC7.2, CC7.3 | All-region CloudTrail + Auth0 log streaming to be enabled | Planned / Owner-action | [`../access-control-policy.md`](../access-control-policy.md) §8 |
| Account/cloud baseline | A.8.8, A.8.16 | CC6.1, CC7.1 | Root MFA, GuardDuty, Config, Security Hub | Partial / Owner-action | [`../../../SECURITY-AUDIT.md`](../../../SECURITY-AUDIT.md) §4.7 |
| Technical vulnerability management | A.8.8 | CC7.1 | **Dependabot on all 9 functions + GitHub Actions**; `npm audit`; managed serverless runtime | Partial → improving | [`.github/dependabot.yml`](../../../.github/dependabot.yml) |
| Dependency hygiene (pin + `npm ci` + SRI) | A.8.8, A.8.28 | CC7.1, CC8.1 | Dependabot done; pin deps + commit all lockfiles + `npm ci` + SRI on Auth0 SDK still to do | Partial (R-05) | [`../secure-development-policy.md`](../secure-development-policy.md) §7 |
| Malware protection | A.8.7 | CC6.8 | Managed serverless (no OS to host malware); dependency scanning | Implemented (inherited) | — |
| Protection against breached passwords / brute force | A.8.5, A.5.7 | CC6.1, CC7.2 | Auth0 Attack Protection (brute-force, breached-password, suspicious-IP) | In progress (R-11) / Owner-action | [`../access-control-policy.md`](../access-control-policy.md) |
| Clock synchronization | A.8.17 | CC7.2 | Managed by AWS/Auth0 platforms; token expiry validated | Inherited | — |

## F. Change & development lifecycle

| Control area | ISO 27001 Annex A | SOC 2 TSC | What Traxent does to satisfy it | Status | Evidence / location |
|--------------|-------------------|-----------|----------------------------------|--------|---------------------|
| Infrastructure as Code | A.8.9, A.8.32 | CC8.1 | SAM/CloudFormation, version-controlled | Implemented | `backend/**/template.yaml` |
| Secure development lifecycle | A.8.25, A.8.27 | CC8.1 | Documented SDLC; OWASP-aligned; secrets in SSM | Implemented | [`../secure-development-policy.md`](../secure-development-policy.md) |
| Change management & deploy gates | A.8.32 | CC8.1, CC3.4 | Git history; CI deploy with HTML-integrity + balanced-`<script>` guard; **branch protection + mandatory review = Owner-action** | Partial | [`.github/workflows/deploy.yml`](../../../.github/workflows/deploy.yml) |
| Separation of dev/test/prod | A.8.31 | CC8.1 | Stripe test vs live; idle `-v2` payments stack vs live; single AWS account today | Partial | [`../../../backend/PAYMENTS-IMPORT-RUNBOOK.md`](../../../backend/PAYMENTS-IMPORT-RUNBOOK.md) |
| Security testing in development | A.8.29 | CC4.1, CC8.1 | Manual review + audit docs; **automated SAST/DAST + pen-test = Planned** | Partial / Owner-action | [`../../../SECURITY-AUDIT.md`](../../../SECURITY-AUDIT.md) |

## G. Resilience, data lifecycle & vendors

| Control area | ISO 27001 Annex A | SOC 2 TSC | What Traxent does to satisfy it | Status | Evidence / location |
|--------------|-------------------|-----------|----------------------------------|--------|---------------------|
| Backups | A.8.13 | A1.2, CC9.1 | DynamoDB **PITR** on production tables | Implemented | [`../business-continuity-backup.md`](../business-continuity-backup.md) |
| Recovery testing / DR drill | A.8.13, A.5.30 | A1.3, CC7.5 | Recovery objectives set; **test-restore + DR drill = Planned** | Planned / Owner-action | [`../business-continuity-backup.md`](../business-continuity-backup.md) |
| Business continuity | A.5.29, A.5.30 | A1.2, A1.3 | IaC redeploy of the full stack; objectives documented | Partial | [`../business-continuity-backup.md`](../business-continuity-backup.md) |
| Redundancy | A.8.14 | A1.1 | Managed multi-AZ AWS services (S3/DynamoDB/Lambda) | Inherited | — |
| Information deletion / retention | A.8.10, A.5.33 | C1.2 | Retention schedule + self-service erasure within 30 days | Implemented | [`../data-retention-policy.md`](../data-retention-policy.md) |
| Data classification | A.5.12, A.5.13 | C1.1 | Classification scheme; admin metrics are counts-only (no PII leaves the boundary) | Implemented | [`admin-metrics/index.mjs`](../../../backend/user-data/functions/admin-metrics/index.mjs) header |
| Privacy / UK GDPR | A.5.34 | (Privacy P-series) | Lawful bases, DSR, DPIA, 72-h breach trigger | Implemented | [`../data-protection-policy.md`](../data-protection-policy.md) |
| Vendor / sub-processor management | A.5.19–A.5.22, A.5.23 | CC9.2 | Register of AWS/Auth0/Stripe/Plausible/Formspree/GitHub; **collect DPAs + current certs = Owner-action** | Partial | [`../vendor-management.md`](../vendor-management.md) |
| Physical & environmental security | A.7.1–A.7.14 | CC6.4 | No in-scope facilities; inherited from AWS | Inherited | [`isms-scope.md`](isms-scope.md) §4 |

## H. Incident management & disclosure

| Control area | ISO 27001 Annex A | SOC 2 TSC | What Traxent does to satisfy it | Status | Evidence / location |
|--------------|-------------------|-----------|----------------------------------|--------|---------------------|
| Incident management planning | A.5.24–A.5.26 | CC7.3, CC7.4 | Severities, roles, steps, comms | Implemented | [`../incident-response-plan.md`](../incident-response-plan.md) |
| Learning from incidents | A.5.27 | CC7.5 | Post-mortem → corrective actions into the risk register | Implemented | [`../incident-response-plan.md`](../incident-response-plan.md) §post-mortem |
| Evidence collection | A.5.28 | CC7.3 | CloudWatch/CloudTrail logs as evidence; chain-of-custody noted | Partial | [`../incident-response-plan.md`](../incident-response-plan.md) |
| Vulnerability disclosure | A.5.7, A.6.8 | CC2.3, CC7.1 | Public RFC 9116 `security.txt` + `/security` page; safe-harbour | Implemented | [`../../../src/.well-known/security.txt`](../../../src/.well-known/security.txt) |
| Breach notification (72 h) | A.5.34, A.5.26 | CC7.4 | UK GDPR 72-hour trigger in the incident plan | Implemented | [`../data-protection-policy.md`](../data-protection-policy.md) §10 |

## I. The audits themselves (cannot be self-declared)

| Item | ISO 27001 | SOC 2 TSC | What it is | Status | Owner-action |
|------|-----------|-----------|------------|--------|--------------|
| ISO/IEC 27001:2022 certification | Full ISMS + Annex A SoA | — | Stage 1 (docs) + Stage 2 (implementation) audit by an **accredited certification body** | **Planned** | Engage UKAS-accredited body |
| SOC 2 Type I | — | All in-scope TSC | Point-in-time controls examination by a **licensed CPA firm** | **Planned** | Engage CPA firm |
| SOC 2 Type II | — | All in-scope TSC | Operating-effectiveness over a 3–12 month window | **Planned** | After Type I + observation window |
| Independent penetration test | A.8.8, A.8.29 | CC4.1, CC7.1 | Third-party technical test | **Planned** | Purchase engagement |

---

## Overlap, in numbers (illustrative)

Of the substantive control rows above, the **large majority carry both an Annex A reference and a SOC 2 TSC reference satisfied by the same implementation** — concretely demonstrating the ~80% overlap. The few framework-specific rows are the ISO management-system artifacts (Scope, SoA, objectives) and the audit deliverables themselves. **Build once, evidence twice.**

> Source-of-truth note: where a row references a risk ID (R-01…), the live status is in [`../risk-register.md`](../risk-register.md). Where it references a control number, see the original [`../controls-matrix.md`](../controls-matrix.md). Update those first, then reflect here.
