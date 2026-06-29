# ISMS Scope & Context — ISO/IEC 27001:2022 Clause 4

| | |
|---|---|
| **Owner** | David Ansah (Security Lead) |
| **Version** | 1.0 · **Date** 2026-06-29 · **Classification** Internal |
| **Satisfies** | ISO/IEC 27001:2022 Clauses 4.1–4.4 (context, interested parties, scope, the ISMS itself) and seeds Clause 5 (leadership). Maps to SOC 2 **CC1** (control environment) and **CC3** (risk assessment context). |

> No certification is claimed. This is the scope statement an auditor reads first: what the ISMS covers, where its boundaries are, and what is deliberately excluded.

---

## 1. The organisation (Clause 4.1 — context)

| Fact | Value |
|------|-------|
| Legal entity | **Akpan Limited**, registered in England & Wales |
| Product | **Traxent** — a trading-education / prop-firm-readiness web + iOS application |
| Nature of data | User account identity (via Auth0), self-entered learning progress, simulated ("paper") trade journal entries, firm selections, and subscription/billing status. **No real trading, no client funds, no card data on our servers, no PHI.** |
| People | A single founder (David Ansah) currently holds all roles; an iOS contractor team consumes the backend API. |
| Hosting | **AWS**, region `eu-west-2` (London), defined as code (SAM/CloudFormation). |

**Internal issues:** solo-founder key-person concentration; reliance on managed third parties; limited time budget for manual compliance work.
**External issues:** UK GDPR / DPA 2018 obligations; prop-firm-adjacent / fintech-adjacent scrutiny; enterprise and acquirer due-diligence expectations (ISO 27001 in UK/EU, SOC 2 for US buyers); evolving threat landscape against public web APIs.

## 2. Interested parties & their requirements (Clause 4.2)

| Interested party | Their requirement of Traxent |
|------------------|------------------------------|
| **Users / customers** | Their account and journal data is kept confidential, available, and deletable on request; the service is honest about what it is (education, not advice). |
| **Acquirers / investors** | A documented, honest security posture that survives technical and legal diligence. |
| **Enterprise customers** | A recognised assurance artifact — ISO 27001 certificate (UK/EU) or SOC 2 report (US). |
| **ICO (supervisory authority)** | UK GDPR / DPA 2018 compliance; 72-hour breach notification; lawful processing; data-subject rights. |
| **Sub-processors** (AWS, Auth0, Stripe, Plausible, Formspree, GitHub) | Correct, authorised use of their services under their terms and DPAs. |
| **Payment ecosystem** (Stripe) | No card data handled outside Stripe; PCI obligations met by inheritance. |

## 3. Scope of the ISMS (Clause 4.3)

**In scope** — the people, processes and technology that store, process or transmit Traxent customer and operational data:

- The **Traxent web application** and static site (S3 + CloudFront, `traxent.io`).
- The **backend API** — AWS Lambda + API Gateway + DynamoDB in `eu-west-2`, including all functions under `backend/functions/` and `backend/user-data/functions/`.
- **Identity** via Auth0 (`auth.traxent.io` tenant).
- **Payments** integration with Stripe (checkout, subscription lifecycle, webhook) — Traxent's integration code, **not** Stripe's card environment.
- **Analytics** via Plausible (cookieless) and **contact intake** via Formspree.
- **Source control & CI/CD** — GitHub repository `ansaldn/traxent` and its GitHub Actions deploy pipelines (OIDC to AWS for backend/infra).
- **Secrets management** — AWS SSM Parameter Store (SecureString).
- The **iOS application** insofar as it consumes the in-scope backend API and stores tokens on-device.
- The **information security management activities** themselves — this documentation pack, the risk register, and the review cadence.

**Boundaries & interfaces:** the trust boundary is the authenticated AWS API; every request crossing it is verified server-side against an Auth0-issued token. External interfaces are Auth0 (auth), Stripe (payments), Plausible (analytics), Formspree (contact), and the Alpha Vantage news source (read-only, no personal data).

## 4. Exclusions and inherited scope (Clause 4.3 justification)

| Excluded / inherited | Justification |
|----------------------|---------------|
| **Physical & environmental security of data centres** | Inherited from **AWS** (an ISO 27001 / SOC 2 certified provider). Traxent operates no in-scope data centres. Annex A.7 controls are addressed by AWS — see the [`statement-of-applicability.md`](statement-of-applicability.md). |
| **Corporate office / on-prem network** | None in scope. The founder works remotely on managed endpoints; covered by A.6.7 (remote working) and A.8.1 (endpoints), not by office-perimeter controls. |
| **Card-data environment (PCI-DSS)** | Inherited from **Stripe**. No card data is stored, processed or transmitted by Traxent systems. |
| **HIPAA** | Not applicable — no PHI. |
| **SOC 2 Processing Integrity & Privacy categories** | Out of initial SOC 2 scope (Privacy handled under UK GDPR). |

## 5. The ISMS (Clause 4.4) and where each management-system clause lives

| ISO 27001 clause | Where it is satisfied |
|------------------|------------------------|
| **4. Context** | This document. |
| **5. Leadership & policy** | [`../information-security-policy.md`](../information-security-policy.md) (top-level policy, roles, management commitment). |
| **6. Planning (risk, objectives)** | [`risk-assessment-and-treatment.md`](risk-assessment-and-treatment.md) + the live [`../risk-register.md`](../risk-register.md); SoA in [`statement-of-applicability.md`](statement-of-applicability.md). |
| **7. Support (resources, awareness, comms, documented info)** | [`../information-security-policy.md`](../information-security-policy.md) §awareness; this pack is the documented information, version-controlled in Git. |
| **8. Operation (risk assessment & treatment in practice)** | [`risk-assessment-and-treatment.md`](risk-assessment-and-treatment.md); the policies in [`../`](..). |
| **9. Performance evaluation (monitoring, internal audit, management review)** | Review cadence stated in each policy; quarterly risk-register review; **internal audit & formal management review = Owner-action** (see gap list). |
| **10. Improvement (nonconformity, corrective action)** | [`../incident-response-plan.md`](../incident-response-plan.md) post-incident actions feed corrective actions into [`../risk-register.md`](../risk-register.md). |

## 6. Scope-level honest gaps (Owner-action)

- **Internal audit** and a recorded **management review** (Clause 9.2 / 9.3) are not yet performed — these are process/owner actions, scheduled as part of readiness.
- **Security objectives with measurable targets** (Clause 6.2) are seeded by the risk register but should be written as explicit, dated objectives before a Stage 1 audit.
