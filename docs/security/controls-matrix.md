# Controls Matrix — SOC 2 & ISO/IEC 27001:2022

| | |
|---|---|
| **Document owner** | David Ansah (Security Lead) |
| **Version** | 1.0 |
| **Last reviewed** | 2026-06-29 |
| **Review cadence** | At least quarterly |
| **Classification** | Internal |

---

## How to read this

Each row is a control Traxent operates (or plans to). For each, we map to:

- **SOC 2** — the relevant **Trust Services Criteria (TSC)**: Common Criteria **CC1–CC9** (Security), plus **A1** (Availability), **C1** (Confidentiality). (Processing Integrity / Privacy are out of initial SOC 2 scope.)
- **ISO/IEC 27001:2022** — the relevant **Annex A** theme/control (A.5 Organizational, A.6 People, A.7 Physical, A.8 Technological).

**Status is honest:**
- **In place** — implemented and operating today.
- **Partial** — partly implemented / inconsistent / needs tightening.
- **Planned** — not yet implemented.

> The biggest honest call: **formal SOC 2 and ISO 27001 audits/certifications are `Planned`.** We are building and documenting the controls toward them but have **not** undergone independent audit. See `COMPLIANCE-ROADMAP.md`.

## Matrix

| # | Control | Evidence / where | SOC 2 (TSC) | ISO 27001:2022 (Annex A) | Status |
|---|---------|------------------|-------------|---------------------------|--------|
| 1 | **Information security policy / ISMS** documented and owned | `information-security-policy.md` | CC1.1, CC5.3 | A.5.1 | **In place** |
| 2 | **Defined roles & responsibilities** for security/data protection | ISMS policy §4 | CC1.2–CC1.4 | A.5.2, A.5.3, A.6.1 | **In place** |
| 3 | **Risk management** — living risk register, reviewed | `risk-register.md` | CC3.1–CC3.4, CC9.1 | A.5.1; ISMS clauses 6/8 | **In place** |
| 4 | **Least-privilege access**; per-user data isolation; server-side authz | `access-control-policy.md`; `secure-development-policy.md` | CC6.1, CC6.3 | A.5.15, A.8.2, A.8.3 | **In place** |
| 5 | **MFA** on admin accounts (AWS, GitHub, Auth0, Stripe); available to end users | `access-control-policy.md` §2 | CC6.1 | A.8.5 | **In place** (verify enforced everywhere) |
| 6 | **OIDC short-lived deploy credentials** (backend/infra); no static keys | `../../IAM-OIDC-SETUP.md`; backend workflows | CC6.1, CC6.6, CC8.1 | A.5.15, A.8.4, A.8.9 | **In place** (backend/infra) |
| 7 | **Frontend deploy on OIDC** (remove static AWS keys) | `deploy.yml` (to migrate) | CC6.1, CC6.6 | A.5.17, A.8.9 | **Planned** (R-02) |
| 8 | **Scoped IAM** for deploy role & Lambda execution | OIDC policy; SAM `SSMParameterReadPolicy: traxent/*` | CC6.1, CC6.3 | A.8.2, A.8.3 | **Partial** (function policies scoped; deploy policy broad) |
| 9 | **Secrets management** — SSM SecureString; none in repo | `secure-development-policy.md` §3 | CC6.1 | A.8.24 (crypto), A.5.15 | **In place** |
| 10 | **Secret rotation** + Stripe restricted keys per function | `access-control-policy.md` §5 | CC6.1 | A.5.17 | **Partial / Planned** (R-06) |
| 11 | **Encryption in transit** — HTTPS/TLS 1.2+, HSTS | `src/security.html`; CloudFront config | CC6.7 | A.8.24 | **In place** |
| 12 | **Encryption at rest** — DynamoDB SSE; SSM KMS | `business-continuity-backup.md`; SAM | CC6.1, C1.1 | A.8.24 | **In place** |
| 13 | **Strong security headers** — CSP, `frame-ancestors 'none'`, nosniff, Referrer/Permissions policy; locked CORS | CloudFront Function; `SECURITY.md` A05 | CC6.6, CC6.7 | A.8.9, A.8.26 | **In place** (CSP hardening to nonce = Planned) |
| 14 | **Payment-data handling** — PCI-DSS via Stripe; no card data on our servers | `data-protection-policy.md`; `vendor-management.md` | CC6.1, C1.1 | A.5.19, A.5.20 | **In place** (inherited) |
| 15 | **Authentication delegated to Auth0**; tokens verified (issuer/audience/signature/expiry) | `secure-development-policy.md` §2 | CC6.1 | A.8.5 | **In place** |
| 16 | **Auth0 Attack Protection** (brute-force, breached-password, suspicious-IP) | Auth0 tenant settings | CC6.1, CC7.2 | A.8.5, A.5.7 | **Planned / In progress** (R-11) |
| 17 | **Edge protection** — AWS WAF + rate limiting + API GW throttling | SAM (rollout); `SECURITY-AUDIT.md` §4.1 | CC6.6, A1.1 | A.8.20, A.8.21 | **In progress** (R-01) |
| 18 | **Monitoring & alerting** — CloudWatch alarms + SNS; billing budget | `business-continuity-backup.md` §6 | CC7.1, CC7.2, A1.1 | A.8.15, A.8.16 | **Partial** (some alarms Planned, R-04) |
| 19 | **Centralised audit logging** — CloudTrail (all-region), Auth0 log streaming | `access-control-policy.md` §8 | CC7.2, CC7.3 | A.8.15 | **Planned** |
| 20 | **Account baseline** — root MFA/no root keys, GuardDuty, Config, Security Hub | `SECURITY-AUDIT.md` §4.7 | CC6.1, CC7.1 | A.8.8, A.8.16 | **Partial / Planned** |
| 21 | **Secure development** — OWASP-aligned, parameterized data access, output encoding | `secure-development-policy.md`; `SECURITY.md` | CC8.1 | A.8.25, A.8.28 | **In place** |
| 22 | **Code review & branch protection** on `main` | `secure-development-policy.md` §6 | CC8.1 | A.8.32 | **Partial / Planned** |
| 23 | **Dependency hygiene** — pinned deps, `npm ci`, Dependabot, SRI | `secure-development-policy.md` §7 | CC7.1, CC8.1 | A.8.8, A.8.28 | **Planned** (R-05) |
| 24 | **Infrastructure as Code** (SAM/CloudFormation), version-controlled | `secure-development-policy.md` §4 | CC8.1 | A.8.9, A.8.32 | **In place** |
| 25 | **Change management** via Git/PRs | `secure-development-policy.md` §9 | CC8.1 | A.8.32 | **Partial** |
| 26 | **Incident response plan** — severities, roles, steps, comms, post-mortem | `incident-response-plan.md` | CC7.3, CC7.4, CC7.5 | A.5.24–A.5.28 | **In place** (annual test Planned) |
| 27 | **Backups & PITR**; tested restores | `business-continuity-backup.md` | A1.2, A1.3 | A.8.13, A.8.14 | **In place** (PITR); test-restore **Planned** |
| 28 | **Business continuity / recovery objectives**; IaC redeploy | `business-continuity-backup.md` | A1.2, A1.3 | A.5.29, A.5.30 | **Partial** (objectives set; DR drill Planned) |
| 29 | **Vendor / sub-processor management** — register, DPAs, certs | `vendor-management.md` | CC9.2 | A.5.19, A.5.20, A.5.21, A.5.22 | **Partial** (register done; collect DPAs/certs) |
| 30 | **Physical & environmental security** (inherited from AWS) | `vendor-management.md`; ISMS §9 | CC6.4 | A.7.x | **In place** (inherited) |
| 31 | **Data protection / UK GDPR** — lawful bases, DSR, DPIA, breach 72h | `data-protection-policy.md` | (Privacy P-series, out of initial SOC 2 scope) | A.5.34, A.5.33 | **In place** |
| 32 | **Data retention & deletion** — schedule + self-service erasure | `data-retention-policy.md` | C1.1, C1.2 | A.5.33, A.8.10 | **In place** |
| 33 | **Vulnerability disclosure** — public `security.txt`/`/security`, safe harbour | `vulnerability-disclosure-policy.md`; `src/security.html` | CC7.1 | A.5.7, A.6.8 | **In place** |
| 34 | **Penetration test / independent technical review** | `secure-development-policy.md` §8 | CC4.1, CC7.1 | A.8.8, A.8.29 | **Planned** |
| 35 | **Security awareness** — read-and-agree to policies | ISMS §8; `access-control-policy.md` §6 | CC1.4, CC2.2 | A.6.3 | **In place** (solo) / scale with team |
| 36 | **iOS app security** — Keychain tokens, StoreKit verification, ATS | `SECURITY-AUDIT.md` §6 | CC6.1, CC6.7 | A.8.24, A.8.26 | **In place** (cert-pinning Planned) |
| **AUD-1** | **SOC 2 Type I** report (independent CPA audit) | — | All in-scope TSC | — | **Planned** |
| **AUD-2** | **SOC 2 Type II** report (operating effectiveness over time) | — | All in-scope TSC | — | **Planned** |
| **AUD-3** | **ISO/IEC 27001:2022 certification** (accredited body) | — | — | Full ISMS + Annex A SoA | **Planned** |
| **N/A-1** | **HIPAA** | n/a — no PHI processed | — | — | **Not applicable** |

## Summary of posture

- **Strong, in place:** documented ISMS; server-side auth & per-user isolation; secrets in SSM; encryption in transit & at rest; OIDC deploys (backend/infra); IaC; security headers; incident response; UK GDPR handling; PITR backups; public vulnerability disclosure.
- **In progress:** WAF + throttling (R-01), monitoring/alarms (R-04), Auth0 Attack Protection (R-11).
- **Planned / to close:** frontend OIDC migration + IAM scope-down (R-02), CSP hardening + token TTL (R-03), dependency hygiene (R-05), Stripe restricted keys (R-06), centralised audit logging, branch protection, test-restore/DR drill, pen-test, and the **formal SOC 2 / ISO 27001 audits**.

| Version | Date | Author | Change |
|---------|------|--------|--------|
| 1.0 | 2026-06-29 | David Ansah | Initial controls matrix. |
