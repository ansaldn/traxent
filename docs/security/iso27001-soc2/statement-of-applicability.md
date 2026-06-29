# Statement of Applicability (SoA) — ISO/IEC 27001:2022 Annex A

| | |
|---|---|
| **Owner** | David Ansah (Security Lead) |
| **Version** | 1.0 · **Date** 2026-06-29 · **Classification** Internal |
| **Mandatory artifact** | The SoA is a required ISO/IEC 27001 deliverable (Clause 6.1.3 d). It lists **all 93 Annex A:2022 controls**, states whether each is **applicable**, justifies inclusion/exclusion, and records implementation **status** and **evidence**. |

> **No certification is claimed; no external audit has been performed.** Status legend: **Implemented** · **Partial** · **Planned** · **Owner-action** (console/dashboard/registry/paid — David's checklist) · **Inherited** (from a certified sub-processor). "Applicable = No" rows carry an explicit justification, as ISO requires.
>
> Annex A:2022 has **93 controls** in **4 themes**: A.5 Organizational (37), A.6 People (8), A.7 Physical (14), A.8 Technological (34). Cross-references: [`unified-control-matrix.md`](unified-control-matrix.md) (what we do), [`../risk-register.md`](../risk-register.md) (risk IDs), and the named policies in [`../`](..).

---

## A.5 — Organizational controls (37)

| Ctrl | Title | Applicable | Justification / status note | Status | Evidence |
|------|-------|:---------:|------------------------------|--------|----------|
| A.5.1 | Policies for information security | Yes | ISMS policy set documented & owned | Implemented | [`../information-security-policy.md`](../information-security-policy.md) |
| A.5.2 | Information security roles & responsibilities | Yes | Security Lead role assigned | Implemented (solo) | ISMS policy §4 |
| A.5.3 | Segregation of duties | Yes | Limited while solo; compensating controls (allow-lists, IaC review) noted; formalise on first hire | Partial | [`../access-control-policy.md`](../access-control-policy.md) |
| A.5.4 | Management responsibilities | Yes | Founder = management; commitment in ISMS policy | Implemented | ISMS policy |
| A.5.5 | Contact with authorities | Yes | ICO identified; AWS/Auth0/Stripe security contacts | Implemented | [`../data-protection-policy.md`](../data-protection-policy.md), [`../incident-response-plan.md`](../incident-response-plan.md) |
| A.5.6 | Contact with special interest groups | Yes | Vendor advisories, security communities | Partial | [`../incident-response-plan.md`](../incident-response-plan.md) |
| A.5.7 | Threat intelligence | Yes | Dependabot alerts, vendor advisories, status pages | Implemented | [`../../../.github/dependabot.yml`](../../../.github/dependabot.yml) |
| A.5.8 | Information security in project management | Yes | Security considered in change/feature work (SDLC) | Partial | [`../secure-development-policy.md`](../secure-development-policy.md) |
| A.5.9 | Inventory of information & associated assets | Yes | Assets enumerated in ISMS scope; sub-processors registered | Partial | [`isms-scope.md`](isms-scope.md), [`../vendor-management.md`](../vendor-management.md) |
| A.5.10 | Acceptable use of information & assets | Yes | Acceptable-use in Terms; internal use governed by policy | Implemented | [`../../../src/terms.html`](../../../src/terms.html) §5 |
| A.5.11 | Return of assets | Yes | Applies on contractor/staff off-boarding; lightweight while solo | Partial / Owner-action | [`../access-control-policy.md`](../access-control-policy.md) §6 |
| A.5.12 | Classification of information | Yes | Classification scheme; data tiers identified | Implemented | [`../data-retention-policy.md`](../data-retention-policy.md) |
| A.5.13 | Labelling of information | Yes | Documents carry a Classification line; data tiers labelled | Partial | This pack headers |
| A.5.14 | Information transfer | Yes | TLS in transit; locked CORS; secure transfer to sub-processors | Implemented | [`security-headers.js`](../../../backend/cloudfront-functions/security-headers.js) |
| A.5.15 | Access control | Yes | Least-privilege; server-side authz; per-user isolation | Implemented | [`../access-control-policy.md`](../access-control-policy.md) |
| A.5.16 | Identity management | Yes | Auth0 user lifecycle; identity from token `sub` | Implemented | [`account-update/index.mjs`](../../../backend/user-data/functions/account-update/index.mjs) |
| A.5.17 | Authentication information | Yes | Secrets in SSM SecureString; passwords held by Auth0, not us; rotation partial | Partial (R-06) | [`../secure-development-policy.md`](../secure-development-policy.md) §3 |
| A.5.18 | Access rights | Yes | Granted/reviewed least-privilege; admin allow-list; periodic review to formalise | Partial | [`admin-metrics/index.mjs`](../../../backend/user-data/functions/admin-metrics/index.mjs) |
| A.5.19 | Information security in supplier relationships | Yes | Sub-processor register | Partial (collect DPAs) | [`../vendor-management.md`](../vendor-management.md) |
| A.5.20 | Addressing security in supplier agreements | Yes | DPAs to be collected/filed | Partial / Owner-action | [`../vendor-management.md`](../vendor-management.md) |
| A.5.21 | Managing security in the ICT supply chain | Yes | Dependency scanning; managed certified providers | Partial | [`../../../.github/dependabot.yml`](../../../.github/dependabot.yml) |
| A.5.22 | Monitoring & change mgmt of supplier services | Yes | Status-page monitoring; vendor cert review | Partial | [`../vendor-management.md`](../vendor-management.md) |
| A.5.23 | Information security for use of cloud services | Yes | AWS as primary cloud; IaC; region pinned `eu-west-2` | Implemented | `backend/**/template.yaml` |
| A.5.24 | Incident management planning & preparation | Yes | Incident plan with severities/roles | Implemented | [`../incident-response-plan.md`](../incident-response-plan.md) |
| A.5.25 | Assessment & decision on security events | Yes | Triage & severity classification defined | Implemented | [`../incident-response-plan.md`](../incident-response-plan.md) §3 |
| A.5.26 | Response to security incidents | Yes | Step-by-step response + comms | Implemented | [`../incident-response-plan.md`](../incident-response-plan.md) |
| A.5.27 | Learning from security incidents | Yes | Post-mortem → corrective actions | Implemented | [`../incident-response-plan.md`](../incident-response-plan.md) |
| A.5.28 | Collection of evidence | Yes | CloudWatch/CloudTrail logs; handling noted | Partial | [`../incident-response-plan.md`](../incident-response-plan.md) |
| A.5.29 | Information security during disruption | Yes | Continuity steps; IaC redeploy | Partial | [`../business-continuity-backup.md`](../business-continuity-backup.md) |
| A.5.30 | ICT readiness for business continuity | Yes | Recovery objectives; **DR drill Planned** | Partial / Planned | [`../business-continuity-backup.md`](../business-continuity-backup.md) |
| A.5.31 | Legal, statutory, regulatory & contractual reqs | Yes | UK GDPR/DPA; Terms; ICO; **registrations to confirm** | Partial / Owner-action | [`../data-protection-policy.md`](../data-protection-policy.md) |
| A.5.32 | Intellectual property rights | Yes | IP ownership clause in Terms; licensed dependencies | Implemented | [`../../../src/terms.html`](../../../src/terms.html) §6 |
| A.5.33 | Protection of records | Yes | Encryption at rest; retention; access control | Implemented | [`../data-retention-policy.md`](../data-retention-policy.md) |
| A.5.34 | Privacy & protection of PII | Yes | UK GDPR programme; DSR; minimisation (counts-only metrics) | Implemented | [`../data-protection-policy.md`](../data-protection-policy.md) |
| A.5.35 | Independent review of information security | Yes | Self-review now; **external review/pen-test Planned** | Planned / Owner-action | [`../secure-development-policy.md`](../secure-development-policy.md) §8 |
| A.5.36 | Compliance with policies, rules & standards | Yes | Quarterly control/risk review | Partial | [`../controls-matrix.md`](../controls-matrix.md) |
| A.5.37 | Documented operating procedures | Yes | Runbooks (deploy, payments import, OIDC); expand coverage | Partial | [`../../../DEPLOY.md`](../../../DEPLOY.md), [`../../../backend/PAYMENTS-IMPORT-RUNBOOK.md`](../../../backend/PAYMENTS-IMPORT-RUNBOOK.md) |

## A.6 — People controls (8)

| Ctrl | Title | Applicable | Justification / status note | Status | Evidence |
|------|-------|:---------:|------------------------------|--------|----------|
| A.6.1 | Screening | Yes (limited) | Solo founder; applies to future hires/contractors | Partial / Owner-action | [`../access-control-policy.md`](../access-control-policy.md) §6 |
| A.6.2 | Terms & conditions of employment | Yes (limited) | To formalise on first hire; contractor agreements for iOS team | Partial / Owner-action | [`../access-control-policy.md`](../access-control-policy.md) |
| A.6.3 | Security awareness, education & training | Yes | Read-and-agree to policies; founder maintains pack | Implemented (solo) | [`../information-security-policy.md`](../information-security-policy.md) |
| A.6.4 | Disciplinary process | Yes (limited) | To formalise with team; conduct rules exist | Partial / Owner-action | [`../access-control-policy.md`](../access-control-policy.md) |
| A.6.5 | Responsibilities after termination/change | Yes (limited) | Access revocation on off-boarding; lightweight while solo | Partial / Owner-action | [`../access-control-policy.md`](../access-control-policy.md) §6 |
| A.6.6 | Confidentiality / NDA | Yes | NDAs for contractors/buyers; vendor confidentiality via DPAs | Partial / Owner-action | [`../vendor-management.md`](../vendor-management.md) |
| A.6.7 | Remote working | Yes | Remote-only founder; managed endpoints; MFA | Partial | [`../access-control-policy.md`](../access-control-policy.md) |
| A.6.8 | Information security event reporting | Yes | Public `security.txt`/`/security`; internal report-immediately rule | Implemented | [`../vulnerability-disclosure-policy.md`](../vulnerability-disclosure-policy.md) |

## A.7 — Physical controls (14)

> **Theme note:** Traxent operates **no in-scope data centres or offices**. Data-centre physical/environmental controls are **inherited from AWS** (an ISO 27001 / SOC 2 certified provider). Endpoint-level items applicable to the founder's working device remain in scope.

| Ctrl | Title | Applicable | Justification / status note | Status | Evidence |
|------|-------|:---------:|------------------------------|--------|----------|
| A.7.1 | Physical security perimeters | Yes (inherited) | AWS data-centre perimeters | Inherited | [`../vendor-management.md`](../vendor-management.md) |
| A.7.2 | Physical entry | Yes (inherited) | AWS controls | Inherited | AWS |
| A.7.3 | Securing offices, rooms & facilities | No | No in-scope offices/facilities | Not applicable | [`isms-scope.md`](isms-scope.md) §4 |
| A.7.4 | Physical security monitoring | Yes (inherited) | AWS controls | Inherited | AWS |
| A.7.5 | Protecting against physical/environmental threats | Yes (inherited) | AWS controls | Inherited | AWS |
| A.7.6 | Working in secure areas | No | No in-scope secure areas | Not applicable | [`isms-scope.md`](isms-scope.md) |
| A.7.7 | Clear desk & clear screen | Yes | Founder endpoint hygiene; screen lock | Partial | [`../access-control-policy.md`](../access-control-policy.md) |
| A.7.8 | Equipment siting & protection | Yes (inherited) | AWS for servers; founder endpoint for local | Inherited / Partial | AWS |
| A.7.9 | Security of assets off-premises | Yes | Founder's mobile working device | Partial | [`../access-control-policy.md`](../access-control-policy.md) |
| A.7.10 | Storage media | Yes (inherited) | No removable media in scope; AWS-managed storage | Inherited | AWS |
| A.7.11 | Supporting utilities | Yes (inherited) | AWS power/cooling | Inherited | AWS |
| A.7.12 | Cabling security | No | No in-scope cabling/facilities | Not applicable | [`isms-scope.md`](isms-scope.md) |
| A.7.13 | Equipment maintenance | Yes (inherited) | AWS hardware maintenance | Inherited | AWS |
| A.7.14 | Secure disposal/re-use of equipment | Yes (inherited) | AWS media destruction; founder device wipe on disposal | Inherited / Partial | AWS |

## A.8 — Technological controls (34)

| Ctrl | Title | Applicable | Justification / status note | Status | Evidence |
|------|-------|:---------:|------------------------------|--------|----------|
| A.8.1 | User endpoint devices | Yes | Founder device; iOS devices run the app | Partial | [`../access-control-policy.md`](../access-control-policy.md) |
| A.8.2 | Privileged access rights | Yes | Admin allow-list; scoped roles; **deploy role broad (R-02)** | Partial | [`admin-metrics/index.mjs`](../../../backend/user-data/functions/admin-metrics/index.mjs) |
| A.8.3 | Information access restriction | Yes | Per-user partition; field whitelist | Implemented | [`user-data/index.mjs`](../../../backend/user-data/functions/user-data/index.mjs) |
| A.8.4 | Access to source code | Yes | Private repo; OIDC deploy; **branch protection Owner-action** | Partial | GitHub settings |
| A.8.5 | Secure authentication | Yes | Auth0; server-side JWT verification; MFA; **Attack Protection (R-11)** | Partial | All `index.mjs` |
| A.8.6 | Capacity management | Yes | Serverless auto-scale; **throttling caps (R-01)** | Partial | SAM templates |
| A.8.7 | Protection against malware | Yes | Managed serverless; dependency scanning | Implemented (inherited) | [`../../../.github/dependabot.yml`](../../../.github/dependabot.yml) |
| A.8.8 | Management of technical vulnerabilities | Yes | Dependabot (all 9 fns + Actions); audit docs; **GuardDuty/pen-test Owner-action** | Partial | [`../../../.github/dependabot.yml`](../../../.github/dependabot.yml) |
| A.8.9 | Configuration management | Yes | IaC; security headers; version-controlled config | Implemented | [`security-headers.js`](../../../backend/cloudfront-functions/security-headers.js) |
| A.8.10 | Information deletion | Yes | Self-service account deletion; retention purge | Implemented | [`delete-account/index.mjs`](../../../backend/user-data/functions/delete-account/index.mjs) |
| A.8.11 | Data masking | Yes | Admin metrics counts-only; no PII exposed in dashboards | Implemented | [`admin-metrics/index.mjs`](../../../backend/user-data/functions/admin-metrics/index.mjs) |
| A.8.12 | Data leakage prevention | Yes | Least-privilege, locked CORS, generic error bodies, no secret logging | Partial | All `index.mjs` |
| A.8.13 | Information backup | Yes | DynamoDB PITR | Implemented | [`../business-continuity-backup.md`](../business-continuity-backup.md) |
| A.8.14 | Redundancy of processing facilities | Yes (inherited) | Multi-AZ managed AWS services | Inherited | AWS |
| A.8.15 | Logging | Yes | CloudWatch per-function; security-event logging; **CloudTrail Planned** | Partial | All `index.mjs` |
| A.8.16 | Monitoring activities | Yes | CloudWatch alarms + SNS rollout (R-04) | Partial | [`../business-continuity-backup.md`](../business-continuity-backup.md) §6 |
| A.8.17 | Clock synchronization | Yes (inherited) | AWS/Auth0 platform time; token expiry checked | Inherited | — |
| A.8.18 | Use of privileged utility programs | Yes | No general-purpose servers; admin via scoped IAM | Implemented | SAM templates |
| A.8.19 | Installation of software on operational systems | Yes | Immutable serverless deploys via CI only | Implemented | [`.github/workflows/`](../../../.github/workflows/) |
| A.8.20 | Networks security | Yes | TLS everywhere; **WAF rollout (R-01)** | Partial | [`security-headers.js`](../../../backend/cloudfront-functions/security-headers.js) |
| A.8.21 | Security of network services | Yes | API GW + CloudFront managed; **throttling (R-01)** | Partial | SAM templates |
| A.8.22 | Segregation of networks | Yes (limited) | Managed-service boundaries; no custom VPC tiering needed at this scale | Partial | [`isms-scope.md`](isms-scope.md) |
| A.8.23 | Web filtering | Yes | CSP allow-lists egress/script sources; `robots.txt` excludes app surface | Implemented | [`../../../src/robots.txt`](../../../src/robots.txt) |
| A.8.24 | Use of cryptography | Yes | TLS 1.2+; DynamoDB SSE; SSM KMS; HSTS | Implemented | [`security-headers.js`](../../../backend/cloudfront-functions/security-headers.js) |
| A.8.25 | Secure development life cycle | Yes | Documented SDLC; OWASP-aligned | Implemented | [`../secure-development-policy.md`](../secure-development-policy.md) |
| A.8.26 | Application security requirements | Yes | Headers/CSP, CORS, input validation; **CSP nonce hardening (R-03)** | Partial | Lambda `headers` blocks |
| A.8.27 | Secure system architecture & engineering | Yes | Server-side authz, least privilege, defence in depth | Implemented | [`../secure-development-policy.md`](../secure-development-policy.md) |
| A.8.28 | Secure coding | Yes | Parameterized queries, field whitelist, validation, generic errors | Implemented | [`account-update/index.mjs`](../../../backend/user-data/functions/account-update/index.mjs) |
| A.8.29 | Security testing in development & acceptance | Yes | CI integrity gates + manual review; **automated SAST/DAST + pen-test Planned** | Partial / Planned | [`.github/workflows/deploy.yml`](../../../.github/workflows/deploy.yml) |
| A.8.30 | Outsourced development | Yes (limited) | iOS contractor team consumes the API; code ownership in repo | Partial | [`../secure-development-policy.md`](../secure-development-policy.md) |
| A.8.31 | Separation of dev, test & production | Yes | Stripe test/live; idle `-v2` stack vs live | Partial | [`../../../backend/PAYMENTS-IMPORT-RUNBOOK.md`](../../../backend/PAYMENTS-IMPORT-RUNBOOK.md) |
| A.8.32 | Change management | Yes | Git/PRs + IaC + CI gates; **branch protection Owner-action** | Partial | [`.github/workflows/deploy.yml`](../../../.github/workflows/deploy.yml) |
| A.8.33 | Test information | Yes | Stripe test mode; no production PII in tests | Implemented | [`../../../CONTENT_AUDIT.md`](../../../CONTENT_AUDIT.md) |
| A.8.34 | Protection of systems during audit testing | Yes | Read-only/agreed scope for any future audit/pen-test | Planned | [`../secure-development-policy.md`](../secure-development-policy.md) §8 |

---

## Summary

| Theme | Controls | Applicable | Not applicable |
|-------|:--------:|:----------:|:--------------:|
| A.5 Organizational | 37 | 37 | 0 |
| A.6 People | 8 | 8 | 0 |
| A.7 Physical | 14 | 11 (mostly inherited from AWS) | 3 (A.7.3, A.7.6, A.7.12 — no in-scope facilities) |
| A.8 Technological | 34 | 34 | 0 |
| **Total** | **93** | **90** | **3** |

**Posture:** the majority of applicable controls are **Implemented** or **Inherited**; a meaningful set is **Partial** (tightening before audit), and a defined set is **Planned / Owner-action**. The exact open items are consolidated in the gap list of the readiness [`README.md`](README.md) and tracked live in [`../risk-register.md`](../risk-register.md). The three Not-Applicable controls are physical-facility controls excluded because Traxent operates no in-scope premises (justified in [`isms-scope.md`](isms-scope.md) §4).
