# Traxent — Security & Compliance Documentation Pack

**Owner:** Akpan Limited (registered in England & Wales) — the provider of Traxent.
**Maintained by:** David Ansah (Founder / acting Security Lead).
**Last reviewed:** 2026-06-29 · **Review cadence:** at least annually, and after any major change or incident.
**Classification:** Internal. Not for public publication. (The public-facing summary lives at `https://traxent.io/security` and `/.well-known/security.txt`.)

---

## What this is

This folder is Traxent's internal **Information Security Management System (ISMS)** documentation — the written policies, registers and plans that describe how we protect customer data and run the service securely. It exists so that Traxent is:

- **Audit-ready** — when we pursue SOC 2 and/or ISO/IEC 27001, an auditor expects to see exactly these documents, kept current and actually followed.
- **Acquisition-ready** — a buyer's technical and legal due-diligence team will ask for this pack. Having it written, honest and mapped to frameworks materially shortens diligence and de-risks the deal.
- **Operationally useful** — these are working documents for a small team, not shelfware. They tell us what to do on a normal day and on the worst day.

> **Honesty principle.** Every document states what is **actually in place today** versus what is **planned**. We do not claim certifications, controls or processes we have not implemented. Formal SOC 2 and ISO 27001 audits are **Planned** (see `controls-matrix.md` and `COMPLIANCE-ROADMAP.md`). Auditors and acquirers reward accuracy and penalise overstatement.

---

## Company & product facts (the basis for every doc here)

| Fact | Value |
|------|-------|
| Product | **Traxent** — a trading-education / prop-firm-readiness web + iOS app |
| Legal entity / data controller | **Akpan Limited**, registered in England & Wales |
| Applicable data-protection law | **UK GDPR** + **Data Protection Act 2018** |
| Supervisory authority | UK Information Commissioner's Office (**ICO**) |
| Hosting | **AWS** (region `eu-west-2`, London) — S3 + CloudFront (static site), Lambda + API Gateway + DynamoDB (backend), defined as code with SAM/CloudFormation |
| Authentication | **Auth0** (MFA available; passwords never stored by us) |
| Payments | **Stripe** (PCI-DSS Level 1 — **no card data touches our servers**) |
| Analytics | **Plausible** — cookieless, no advertising / cross-site tracking |
| CI/CD | **GitHub Actions**, backend/infra deploys via **OIDC short-lived credentials** (no static keys) |
| Edge protection | **AWS WAF** + rate limiting (rollout in progress) |
| Data protection at rest | DynamoDB **encryption at rest (SSE)** + **point-in-time recovery (PITR)** |
| Monitoring | **CloudWatch** alarms + **SNS** alerts |
| User control | In-app account self-service editing and **permanent account self-deletion** |
| **HIPAA** | **NOT applicable** — Traxent processes **no Protected Health Information (PHI)**. Nothing here implies HIPAA compliance. |

---

## The documents

| File | Purpose |
|------|---------|
| [`information-security-policy.md`](information-security-policy.md) | Top-level ISMS policy — scope, objectives, roles, governance. The umbrella doc. |
| [`access-control-policy.md`](access-control-policy.md) | Least privilege, MFA, OIDC deploy roles, secrets/key management. |
| [`data-protection-policy.md`](data-protection-policy.md) | UK GDPR: lawful bases, data-subject rights, DPIAs, 72-hour breach notification, controller/processor roles. |
| [`data-retention-policy.md`](data-retention-policy.md) | What we keep, how long, and how it is deleted. |
| [`incident-response-plan.md`](incident-response-plan.md) | Severities, roles, step-by-step response, comms, post-mortem, breach trigger. |
| [`vulnerability-disclosure-policy.md`](vulnerability-disclosure-policy.md) | Mirrors the public `security.txt` / `/security` page; good-faith safe harbour. |
| [`vendor-management.md`](vendor-management.md) | Sub-processor register (AWS, Auth0, Stripe, Plausible, Formspree, GitHub) with data shared, certifications and DPA links to obtain. |
| [`business-continuity-backup.md`](business-continuity-backup.md) | Backups (DynamoDB PITR), recovery objectives, IaC redeploy. |
| [`secure-development-policy.md`](secure-development-policy.md) | Code review, IaC, secrets in SSM, dependency hygiene, branch protection. |
| [`risk-register.md`](risk-register.md) | Live register of risks with likelihood, impact, mitigation and owner. |
| [`controls-matrix.md`](controls-matrix.md) | Each implemented control mapped to **SOC 2 TSC** and **ISO/IEC 27001:2022 Annex A**, with honest status. |
| [`COMPLIANCE-ROADMAP.md`](COMPLIANCE-ROADMAP.md) | Plain-English action plan: how SOC 2 / ISO 27001 are *earned*, the recommended path, timelines, ballpark costs, and David's first 5 actions. |

Related existing artifacts in this repo (referenced by the docs above):

- [`../../SECURITY.md`](../../SECURITY.md) — point-in-time security review (OWASP Top 10 + AWS Well-Architected).
- [`../../SECURITY-AUDIT.md`](../../SECURITY-AUDIT.md) — full web + backend + iOS audit with a prioritised remediation backlog.
- [`../../IAM-OIDC-SETUP.md`](../../IAM-OIDC-SETUP.md) — the GitHub→AWS OIDC deploy-role setup.
- [`../../src/.well-known/security.txt`](../../src/.well-known/security.txt) and [`../../src/security.html`](../../src/security.html) — the public disclosure contact and trust page.
- [`../../src/privacy.html`](../../src/privacy.html) — the public Privacy & Cookies policy (the external-facing version of `data-protection-policy.md`).

---

## How these docs map to the frameworks

These are the three frameworks Traxent is targeting. None is "self-declared" — see `COMPLIANCE-ROADMAP.md` for what each actually requires.

### SOC 2 (AICPA Trust Services Criteria)

SOC 2 is organised around five **Trust Services Criteria (TSC)**. Traxent's initial scope is **Security (the Common Criteria, CC)**, optionally adding **Availability** and **Confidentiality**.

| TSC | Primary supporting documents |
|-----|------------------------------|
| **Security / Common Criteria (CC1–CC9)** | `information-security-policy.md`, `access-control-policy.md`, `secure-development-policy.md`, `incident-response-plan.md`, `risk-register.md`, `vendor-management.md` |
| **Availability (A1)** | `business-continuity-backup.md` |
| **Confidentiality (C1)** | `data-retention-policy.md`, `access-control-policy.md`, `vendor-management.md` |
| **Processing Integrity (PI1)** | `secure-development-policy.md` (out of initial scope; listed for completeness) |
| **Privacy (P1–P8)** | `data-protection-policy.md`, `data-retention-policy.md` (out of initial scope; UK GDPR covered separately) |

### ISO/IEC 27001:2022

ISO 27001 requires an **ISMS** (clauses 4–10) plus controls from **Annex A** (4 themes, 93 controls). Mapping by Annex A theme:

| Annex A theme | Primary supporting documents |
|---------------|------------------------------|
| **A.5 Organizational controls** | `information-security-policy.md`, `vendor-management.md`, `data-protection-policy.md`, `risk-register.md`, `incident-response-plan.md` |
| **A.6 People controls** | `information-security-policy.md` (roles, awareness), `access-control-policy.md` |
| **A.7 Physical controls** | Inherited from AWS (see `vendor-management.md`) — Traxent operates no data centres or offices in scope |
| **A.8 Technological controls** | `access-control-policy.md`, `secure-development-policy.md`, `business-continuity-backup.md`, `data-retention-policy.md` |

The ISMS management-system clauses (risk assessment, objectives, internal audit, management review) are seeded by `risk-register.md`, `controls-matrix.md` and the review cadence stated in each policy.

### UK GDPR / Data Protection Act 2018

`data-protection-policy.md` is the controlling document. `data-retention-policy.md`, `vendor-management.md` (the sub-processor register and Records of Processing input), and `incident-response-plan.md` (the 72-hour breach-notification trigger) complete the obligations. The public-facing expression of these is `src/privacy.html`.

---

## Known fix-up before audit / diligence

- **Entity-name consistency.** The public `src/privacy.html` currently names the operator as "Traxent Ltd", whereas `security.txt`, `security.html` and this pack use **Akpan Limited**. Reconcile to the correct registered legal name on every surface before audit or diligence, and confirm the Companies House registration number, registered address and ICO registration. (Tracked in `risk-register.md` and `COMPLIANCE-ROADMAP.md`.)

---

## How to use this pack

1. Read this README, then `COMPLIANCE-ROADMAP.md`.
2. Keep `risk-register.md` and `controls-matrix.md` **live** — review them at least quarterly and after any incident or major change.
3. When a control moves from *Planned* → *In place*, update `controls-matrix.md` **and** the relevant policy on the same day.
4. Re-date and re-approve each policy at the stated review cadence.
