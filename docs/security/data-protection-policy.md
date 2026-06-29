# Data Protection Policy (UK GDPR / DPA 2018)

| | |
|---|---|
| **Document owner** | David Ansah (Data Protection point of contact) |
| **Data controller** | **Akpan Holdings Limited**, registered in England & Wales |
| **Version** | 1.0 |
| **Effective date** | 2026-06-29 |
| **Review cadence** | At least annually, and on any change to processing or law |
| **Classification** | Internal |
| **Public-facing version** | `../../src/privacy.html` (Privacy & Cookies policy) |

---

## 1. Purpose & legal framework

This policy sets out how **Akpan Holdings Limited** (the **data controller**) handles personal data through the **Traxent** service in compliance with the **UK General Data Protection Regulation (UK GDPR)** and the **Data Protection Act 2018**. The relevant supervisory authority is the UK **Information Commissioner's Office (ICO)**.

> **Scope note — HIPAA is not applicable.** Traxent processes **no Protected Health Information**. This policy concerns UK data-protection law only; nothing here relates to or implies HIPAA compliance.

## 2. Roles: controller and processors

- **Controller:** **Akpan Holdings Limited** — determines the purposes and means of processing personal data through Traxent.
- **Processors / sub-processors:** third parties that process personal data **on our behalf and on our instructions**, each under a Data Processing Agreement (DPA). Our current sub-processors are **AWS, Auth0, Stripe, Plausible, Formspree and GitHub** — see `vendor-management.md` for the register, the data shared with each, and DPA status. Where a provider is an independent controller for part of the relationship (e.g. **Stripe** as a payment institution), that is noted in the register.

## 3. Data protection principles

We apply the UK GDPR principles to all processing: lawfulness, fairness and transparency; purpose limitation; **data minimisation** (we collect only what we need — name, email, the content users choose to log, and limited technical/security data); accuracy; storage limitation (see `data-retention-policy.md`); integrity and confidentiality (encryption in transit and at rest, least-privilege access — see `access-control-policy.md`); and accountability (this documentation set evidences it).

## 4. What personal data we process

| Category | Examples | Source |
|----------|----------|--------|
| Identity & contact | Name, email address | Provided by the user at sign-up |
| Authentication | Auth0 user identifier (`sub`), login metadata; **MFA available**. **We never store passwords.** | Auth0 |
| Subscription / billing metadata | Plan, subscription status, Stripe customer/subscription identifiers. **Card data is held by Stripe (PCI-DSS L1) and never reaches our servers.** | Stripe |
| User-generated content | Simulated trade-journal entries the user voluntarily logs | The user |
| Technical / security data | IP address, browser/device type, application logs | Automatically, for security and operation |
| Analytics | Aggregated, **cookieless** usage stats via Plausible — no cross-site tracking, no advertising identifiers | Plausible |

We do **not** collect real trading-account data, brokerage credentials or financial-account information, and we do **not** sell personal data.

## 5. Lawful bases for processing (UK GDPR Article 6)

| Processing activity | Lawful basis |
|---------------------|--------------|
| Creating and operating a user's account; delivering the core service | **Contract** (Art. 6(1)(b)) — necessary to provide the service the user signed up for |
| Processing subscription payments (via Stripe) | **Contract** (Art. 6(1)(b)) |
| Transactional emails (receipts, account/security notices) | **Contract** (Art. 6(1)(b)) |
| Security, fraud prevention, abuse protection, logging, service improvement via **aggregated** data | **Legitimate interests** (Art. 6(1)(f)) — balanced against user rights; data minimised and, for analytics, cookieless/aggregated |
| Meeting legal/tax/accounting obligations (e.g. retaining invoices) | **Legal obligation** (Art. 6(1)(c)) |
| Any optional, non-essential processing requiring opt-in | **Consent** (Art. 6(1)(a)) — freely given, withdrawable at any time |

Because Plausible analytics is **cookieless and aggregated** and we use **no advertising/cross-site tracking**, our analytics do not rely on consent-based tracking cookies. We process **no special-category data** under Article 9.

## 6. Data subject rights

Under UK GDPR, individuals have the rights to: **access**, **rectification**, **erasure** ("right to be forgotten"), **restriction**, **objection**, **data portability**, and to **withdraw consent**. They also have the right to lodge a complaint with the **ICO**.

**How we honour them:**
- **Self-service first.** Users can edit their details, change plan, and **permanently delete their account and data** from their account page; Auth0 provides password reset and MFA controls.
- **Requests by email** go to **`data.gdpr@traxent.io`**. We acknowledge promptly and respond **within one month** (UK GDPR; extendable by two further months for complex requests, with notice).
- **Verification.** We verify the requester's identity (typically via their authenticated account) before disclosing or deleting data.
- **No automated decision-making** with legal or similarly significant effect is performed.
- **No fee** is charged for a request unless it is manifestly unfounded or excessive.

A request log (date received, type, requester, action, date closed) is maintained to evidence compliance.

## 7. International transfers

Production data is hosted in **AWS region `eu-west-2` (London, UK)**. Where a sub-processor may process data outside the UK (e.g. support or backups), transfers are covered by the safeguards in that provider's DPA (UK adequacy regulations, the **UK International Data Transfer Agreement / Addendum**, or **Standard Contractual Clauses** as applicable). Transfer mechanisms per vendor are tracked in `vendor-management.md`.

## 8. Records of Processing Activities (ROPA)

As controller, we maintain a record of processing activities. The building blocks are the data-categories table in §4, the lawful-bases table in §5, `data-retention-policy.md` (storage periods), and `vendor-management.md` (recipients/sub-processors and transfers). These together constitute Traxent's ROPA; keep them current.

## 9. Data Protection Impact Assessments (DPIAs)

We carry out a **DPIA** before any processing **likely to result in a high risk** to individuals' rights and freedoms — for example, introducing new categories of personal data, large-scale processing, new profiling/automated decision-making, or a materially new sub-processor handling sensitive data. A DPIA documents the processing, necessity and proportionality, risks to individuals, and mitigations. The Security Lead owns DPIAs; completed DPIAs are stored alongside this pack. *Current status: no high-risk processing identified; the cookieless-analytics and current data set are low-risk. Re-assess on any material change.*

## 10. Personal data breach notification (the 72-hour rule)

A **personal data breach** is a breach of security leading to accidental or unlawful destruction, loss, alteration, unauthorised disclosure of, or access to, personal data.

- **Internal trigger:** any suspected breach is reported and handled under `incident-response-plan.md` immediately.
- **Notify the ICO** without undue delay and, where feasible, **within 72 hours** of becoming aware, **unless** the breach is **unlikely to result in a risk** to individuals' rights and freedoms. If notification is later than 72 hours, we record the reasons for the delay.
- **Notify affected individuals** without undue delay where the breach is likely to result in a **high risk** to their rights and freedoms.
- **What the notification covers:** the nature of the breach, categories and approximate number of individuals and records affected, likely consequences, measures taken/proposed, and the contact point (`data.gdpr@traxent.io`).
- **Record-keeping:** **all** breaches are documented (facts, effects, remedial action) regardless of whether they are notifiable, per UK GDPR Article 33(5). The detailed severity rubric and runbook are in `incident-response-plan.md`.

## 11. Data security

Personal data is protected by: TLS in transit; **DynamoDB encryption at rest (SSE)** and **point-in-time recovery**; secrets in **SSM SecureString**; least-privilege access and per-user data isolation; **AWS WAF** + rate limiting at the edge (rollout in progress); and monitoring/alerting (CloudWatch + SNS). See `access-control-policy.md`, `secure-development-policy.md` and `business-continuity-backup.md`.

## 12. Children's data

Traxent is intended for adults (it is a trading-education product). We do not knowingly process the personal data of children. If we learn we have, we delete it.

## 13. Contacts

- **Data protection / data-subject requests:** `data.gdpr@traxent.io`
- **General:** `hello@traxent.io`
- **Security / vulnerability reports:** `security@traxent.io` (see `vulnerability-disclosure-policy.md`)
- **Supervisory authority:** UK Information Commissioner's Office (ICO), `ico.org.uk`

> **Action before audit/diligence:** the operator/legal-entity name is now reconciled to **Akpan Holdings Limited** across the public surfaces (`privacy.html`, `terms.html`, `security.txt`, `security.html`) and this pack. Still to confirm: Akpan Holdings Limited's **ICO registration** (data-protection fee), Companies House number and registered address. Tracked in `risk-register.md` (R-08) and `COMPLIANCE-ROADMAP.md`.

| Version | Date | Author | Change |
|---------|------|--------|--------|
| 1.0 | 2026-06-29 | David Ansah | Initial UK GDPR data protection policy. |
