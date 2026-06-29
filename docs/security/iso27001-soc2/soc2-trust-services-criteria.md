# SOC 2 — Trust Services Criteria Mapping

| | |
|---|---|
| **Owner** | David Ansah (Security Lead) |
| **Version** | 1.0 · **Date** 2026-06-29 · **Classification** Internal |
| **Scope** | **Security / Common Criteria (CC1–CC9)** + **Availability (A1)** + **Confidentiality (C1)**. Processing Integrity and Privacy categories are out of initial scope (see [`framework-choice-and-rationale.md`](framework-choice-and-rationale.md) §4). |

> **No SOC 2 report exists.** A SOC 2 report can only be issued by a **licensed CPA firm** after an examination. This document maps Traxent's existing controls to the AICPA Trust Services Criteria so the same control set that backs ISO 27001 also answers a US buyer's SOC 2 question. Cross-references point at the ISO-led control set in [`unified-control-matrix.md`](unified-control-matrix.md) and the [`statement-of-applicability.md`](statement-of-applicability.md).

---

## How to read this

Each criterion lists **what Traxent does**, a **status**, and where to find it. Statuses follow the legend in the [`README.md`](README.md). "Owner-action" means it needs David in a console/dashboard/registry or a paid engagement — it cannot be done from this repo.

## Common Criteria (Security) — the mandatory baseline

### CC1 — Control Environment

| # | Criterion (summary) | What Traxent does | Status |
|---|----------------------|-------------------|--------|
| CC1.1 | Demonstrates commitment to integrity & ethics | Documented ISMS with an honesty principle; educational-only product with clear non-advice disclaimers | Implemented |
| CC1.2 | Board/oversight independence | Solo founder is accountable; ISMS policy assigns the Security Lead role. Independent oversight scales with the team | Partial (solo) |
| CC1.3 | Management establishes structure & authority | Roles defined in [`../information-security-policy.md`](../information-security-policy.md) §4 | Implemented |
| CC1.4 | Commitment to competence | Security awareness = read-and-agree to policies; founder maintains the pack | Implemented (solo) |
| CC1.5 | Accountability | Risk owners named in [`../risk-register.md`](../risk-register.md); change history in Git | Implemented |

### CC2 — Communication & Information

| # | Criterion | What Traxent does | Status |
|---|-----------|-------------------|--------|
| CC2.1 | Uses relevant, quality information | Controls matrix, risk register and this pack are the internal information base | Implemented |
| CC2.2 | Communicates internally | Policies are version-controlled and acknowledged; awareness via the ISMS | Implemented (solo) |
| CC2.3 | Communicates externally | Public [`/security`](../../../src/security.html) page + [`security.txt`](../../../src/.well-known/security.txt) (RFC 9116); privacy policy; vulnerability-disclosure channel | Implemented |

### CC3 — Risk Assessment

| # | Criterion | What Traxent does | Status |
|---|-----------|-------------------|--------|
| CC3.1 | Specifies objectives | ISMS objectives seeded; **quantified, dated objectives = Owner-action** | Partial |
| CC3.2 | Identifies & analyses risk | Methodology in [`risk-assessment-and-treatment.md`](risk-assessment-and-treatment.md); results in [`../risk-register.md`](../risk-register.md) | Implemented |
| CC3.3 | Considers fraud potential | Payment fraud transferred to Stripe; admin allow-list prevents privilege abuse | Implemented |
| CC3.4 | Identifies & assesses change | IaC + Git change history; **formal change-impact review = Partial** | Partial |

### CC4 — Monitoring Activities

| # | Criterion | What Traxent does | Status |
|---|-----------|-------------------|--------|
| CC4.1 | Performs evaluations | Quarterly risk review; **independent review / pen-test = Planned (Owner-action)** | Partial |
| CC4.2 | Communicates deficiencies | Findings flow into the risk register and incident plan | Implemented |

### CC5 — Control Activities

| # | Criterion | What Traxent does | Status |
|---|-----------|-------------------|--------|
| CC5.1 | Selects controls to mitigate risk | Annex A controls selected via the SoA | Implemented |
| CC5.2 | Selects technology controls | Headers/CSP, encryption, JWT verification, least-privilege IAM | Implemented |
| CC5.3 | Deploys via policies & procedures | Policy pack in [`../`](..) | Implemented |

### CC6 — Logical & Physical Access Controls

| # | Criterion | What Traxent does | Status |
|---|-----------|-------------------|--------|
| CC6.1 | Logical access security | Auth0 auth; server-side JWT verification on every endpoint; per-user partition isolation; secrets in SSM; admin allow-list on `admin-metrics` | Implemented |
| CC6.2 | Registration/deregistration | Auth0 manages user lifecycle; self-service account deletion ([`delete-account`](../../../backend/user-data/functions/delete-account/index.mjs)) | Implemented |
| CC6.3 | Role-based access / least privilege | Scoped Lambda execution roles; m2m app least-priv; **deploy IAM scope-down = Partial (R-02)** | Partial |
| CC6.4 | Restricts physical access | Inherited from AWS | Implemented (inherited) |
| CC6.5 | Disposes of data securely | DynamoDB deletion on account erasure; A.8.10 | Implemented |
| CC6.6 | Protects against external threats | CSP + `frame-ancestors 'none'`, HSTS, locked CORS, OIDC deploys; **WAF/throttling = In progress (R-01)** | Partial |
| CC6.7 | Restricts data movement | TLS 1.2+ in transit; encryption at rest; cookieless analytics; iOS Keychain | Implemented |
| CC6.8 | Prevents/detects malicious software | Managed serverless runtime (no servers to patch); Dependabot for dependencies | Implemented |

### CC7 — System Operations

| # | Criterion | What Traxent does | Status |
|---|-----------|-------------------|--------|
| CC7.1 | Detects vulnerabilities | Dependabot (all 9 functions + Actions); SECURITY-AUDIT findings; **GuardDuty/Security Hub = Owner-action** | Partial |
| CC7.2 | Monitors anomalies | CloudWatch alarms + SNS (rollout); **full coverage + Auth0 Attack Protection = In progress (R-04, R-11)** | Partial |
| CC7.3 | Evaluates security events | [`../incident-response-plan.md`](../incident-response-plan.md) severities & triage | Implemented |
| CC7.4 | Responds to incidents | Incident plan with roles, comms, steps | Implemented |
| CC7.5 | Recovers from incidents | PITR restore + IaC redeploy ([`../business-continuity-backup.md`](../business-continuity-backup.md)); **DR drill = Planned** | Partial |

### CC8 — Change Management

| # | Criterion | What Traxent does | Status |
|---|-----------|-------------------|--------|
| CC8.1 | Authorises, designs, tests, approves changes | IaC (SAM/CloudFormation); Git history; CI deploy gates incl. HTML integrity check; **branch protection + mandatory review = Owner-action** | Partial |

### CC9 — Risk Mitigation

| # | Criterion | What Traxent does | Status |
|---|-----------|-------------------|--------|
| CC9.1 | Mitigates business-disruption risk | Backups/PITR, recovery objectives, managed-service redundancy | Implemented |
| CC9.2 | Manages vendor/partner risk | [`../vendor-management.md`](../vendor-management.md) sub-processor register; **collect DPAs/certs = Owner-action** | Partial |

## Availability (A1)

| # | Criterion | What Traxent does | Status |
|---|-----------|-------------------|--------|
| A1.1 | Capacity & performance | Serverless auto-scaling; **WAF/throttling to cap abusive load = In progress** | Partial |
| A1.2 | Backup & recovery infrastructure | DynamoDB **PITR**; IaC redeploy of the whole stack | Implemented |
| A1.3 | Recovery testing | Recovery objectives set; **test-restore / DR drill = Planned** | Partial |

## Confidentiality (C1)

| # | Criterion | What Traxent does | Status |
|---|-----------|-------------------|--------|
| C1.1 | Identifies & protects confidential information | Data classification + encryption at rest/in transit; least-privilege access; no card data; counts-only admin metrics | Implemented |
| C1.2 | Disposes of confidential information | Retention schedule + self-service erasure ([`../data-retention-policy.md`](../data-retention-policy.md)) | Implemented |

## SOC 2 readiness summary

- **Strong / Implemented:** access control & JWT verification (CC6.1), external comms & disclosure (CC2.3), incident response (CC7.3–7.4), encryption (CC6.7), backups/PITR (A1.2), confidentiality of data (C1.1–C1.2).
- **Partial / In progress:** WAF & throttling (CC6.6 / A1.1, R-01), monitoring coverage (CC7.2, R-04), deploy IAM scope-down (CC6.3, R-02), change-management formality & branch protection (CC8.1), dependency hardening beyond Dependabot (CC7.1, R-05).
- **Owner-action / Planned:** independent review & pen-test (CC4.1), GuardDuty/Security Hub/CloudTrail baseline (CC7.1), vendor DPA/cert collection (CC9.2), DR drill (CC7.5 / A1.3), and the **SOC 2 examination itself** by a CPA firm.
