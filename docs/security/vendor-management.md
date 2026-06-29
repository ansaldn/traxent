# Vendor & Sub-Processor Management

| | |
|---|---|
| **Document owner** | David Ansah (Vendor/Sub-processor owner) |
| **Version** | 1.0 |
| **Effective date** | 2026-06-29 |
| **Review cadence** | At least annually, and before onboarding any new sub-processor |
| **Classification** | Internal |
| **Related** | `data-protection-policy.md`, `data-retention-policy.md`, `access-control-policy.md` |

---

## 1. Purpose

Traxent runs on third-party platforms. This document governs how we select, approve, document and review those vendors — especially **sub-processors** that handle personal data on our behalf (as data controller, **Akpan Holdings Limited** remains accountable for them under UK GDPR). It contains the **sub-processor register**, which also feeds our Records of Processing Activities.

## 2. Vendor onboarding & due-diligence checklist

Before relying on a vendor that touches personal data or production systems:

- [ ] Confirm a **business need** and least-privilege scope.
- [ ] Review the vendor's **security posture** and independent certifications (SOC 2 / ISO 27001 / PCI-DSS as applicable).
- [ ] Put a **Data Processing Agreement (DPA)** in place and confirm the **international-transfer** mechanism (UK adequacy / UK IDTA / SCCs).
- [ ] Capture **what data** is shared and **why**, and add it to the register below.
- [ ] Apply **least-privilege credentials**, MFA, and secrets storage in SSM (see `access-control-policy.md`).
- [ ] Record the vendor's **status page / security-contact** for incident handling.

## 3. Sub-processor register

> **Action required:** the "DPA / certifications to obtain" column lists the document/URL to download, sign or file for the audit/diligence evidence pack. Certifications named are publicly stated by each vendor; **obtain the current copy via the vendor's trust portal and verify dates** rather than relying on this table.

| Sub-processor | Purpose / service | Personal data shared | Independent certifications (vendor-stated) | DPA / certifications to obtain |
|---------------|-------------------|----------------------|---------------------------------------------|--------------------------------|
| **Amazon Web Services (AWS)** — region `eu-west-2` | Core cloud hosting: S3 + CloudFront (static site), Lambda + API Gateway + DynamoDB (backend), SSM, CloudWatch, WAF | All app data at rest (account identity, billing metadata, user content), logs, IPs | SOC 1/2/3, ISO/IEC 27001, 27017, 27018, PCI-DSS, and more | **AWS DPA** (via AWS Artifact); download SOC 2 Type II + ISO 27001 cert from **AWS Artifact**; confirm region pinned to `eu-west-2` |
| **Auth0 (Okta)** | Authentication & identity management (login, MFA, account management). **We never store passwords.** | Email, name, Auth0 user id (`sub`), authentication/login metadata | SOC 2 Type II, ISO/IEC 27001, ISO 27017/27018 | **Okta/Auth0 DPA**; SOC 2 + ISO 27001 reports from the **Okta trust portal**; confirm tenant region & data residency |
| **Stripe** | Subscription billing & payment processing. **Card data never reaches Traxent.** | Email, name, Stripe customer/subscription IDs; **Stripe** holds the card data | **PCI-DSS Level 1**, SOC 1/2, ISO/IEC 27001 | **Stripe DPA**; PCI **AOC** and SOC 2 from Stripe's docs/trust portal. Note: Stripe is an **independent controller** for payment-processing/AML obligations |
| **Plausible Analytics** | **Cookieless**, privacy-friendly web analytics (aggregated; no advertising/cross-site tracking) | No cookies; aggregated, non-identifying usage data (EU-hosted) | EU-hosted; GDPR-focused (verify current attestations) | **Plausible DPA**; confirm EU data hosting and that no personal data / no cookies are used |
| **Formspree** | Waitlist email capture (form submissions) | Email addresses (and any fields submitted on the waitlist form) | Verify current security posture/attestations | **Formspree DPA**; confirm retention, sub-processors and transfer mechanism |
| **GitHub (Microsoft)** | Source code hosting and CI/CD (GitHub Actions; OIDC to AWS) | Source code & IaC (no customer personal data should be stored in the repo); Actions metadata | SOC 1/2, ISO/IEC 27001 | **GitHub DPA** (Microsoft Products & Services DPA); SOC 2 + ISO 27001 from the **Microsoft/GitHub trust portal** |

### Supporting / indirect services (track, lower data exposure)
- **Domain registrar / DNS** — ensure MFA and registrar-lock; no customer personal data, but security-critical. *(Record the specific provider.)*
- **Email provider** for `@traxent.io` (`security@`, `hello@`, `data.gdpr@`) — handles inbound data-subject and security correspondence; ensure a DPA and MFA. *(Record the specific provider.)*

## 4. Data flows (summary)

- **Users → Auth0** for authentication; Traxent receives a verified token.
- **Users → Stripe** (via Stripe-hosted checkout) for payment; Traxent stores only non-card metadata.
- **App data** persists in **DynamoDB** (`eu-west-2`), encrypted at rest with PITR.
- **Analytics** is collected cookieless by **Plausible** (aggregated, non-identifying).
- **Waitlist** submissions go to **Formspree**.
- **Code/deploys** flow through **GitHub** → AWS via OIDC.

## 5. Ongoing review

- Review this register and each vendor's current certifications **at least annually** and whenever a vendor changes materially (new sub-processors, a breach, a region change).
- Maintain the **DPA + latest certification** for each sub-processor in the evidence pack (a compliance-automation platform can auto-collect several of these — see `COMPLIANCE-ROADMAP.md`).
- If a vendor suffers a security incident affecting Traxent data, follow `incident-response-plan.md`.
- Publish/maintain a customer-facing **sub-processor list** if/when contractually required.

| Version | Date | Author | Change |
|---------|------|--------|--------|
| 1.0 | 2026-06-29 | David Ansah | Initial vendor & sub-processor register. |
