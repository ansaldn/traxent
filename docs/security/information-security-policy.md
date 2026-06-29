# Information Security Policy (ISMS Top-Level Policy)

| | |
|---|---|
| **Document owner** | David Ansah (Founder / acting Security Lead) |
| **Approved by** | Akpan Holdings Limited (directors) |
| **Version** | 1.0 |
| **Effective date** | 2026-06-29 |
| **Review cadence** | At least annually, and after any major change or security incident |
| **Classification** | Internal |

---

## 1. Purpose

This is the top-level policy of Traxent's Information Security Management System (ISMS). It sets out how **Akpan Holdings Limited** ("the company", "we") protects the confidentiality, integrity and availability of the information entrusted to **Traxent** ("the service") — most importantly our customers' personal data. All other documents in `docs/security/` sit beneath this one and implement it.

## 2. Scope

This policy applies to:

- **The Traxent service**: the static website (AWS S3 + CloudFront), the backend (AWS Lambda + API Gateway + DynamoDB, defined as code with SAM/CloudFormation), the iOS app, and all supporting cloud configuration — all in AWS region `eu-west-2`.
- **All information** processed by the service: customer account data (name, email), authentication data (held by Auth0; we never store passwords), subscription/billing metadata (card data is held by Stripe, never by us), user-generated content (simulated trade-journal entries), and operational/technical data (logs, IP addresses for security).
- **Everyone with access**: the founder, any future employees or contractors, and our sub-processors (governed via `vendor-management.md`).
- **All devices** used to administer the service (laptops/phones used for AWS, GitHub, Auth0, Stripe and email).

**Out of scope / not applicable:** Traxent processes **no Protected Health Information**, so **HIPAA does not apply** and is not addressed here. Traxent holds no client funds and provides no financial advice.

## 3. Information security objectives

1. Protect customer personal data in line with **UK GDPR** and the **Data Protection Act 2018**.
2. Prevent unauthorised access to systems and data (least privilege, MFA, strong auth).
3. Keep the service available and recoverable (backups, IaC, defined recovery objectives).
4. Detect and respond to security events quickly (monitoring, alerting, an incident plan).
5. Build security into the product from the start (secure development, dependency hygiene).
6. Be honest and transparent about our security posture, internally and externally.
7. Progress toward independent assurance (**SOC 2**, **ISO/IEC 27001**) without overstating current status.

Progress against these objectives is tracked in `controls-matrix.md` and `risk-register.md`.

## 4. Roles and responsibilities

Traxent is a small organisation; one person currently holds several roles. They are listed separately so they can be delegated as the team grows, and so an auditor can see the responsibility map.

| Role | Currently held by | Responsibility |
|------|-------------------|----------------|
| **Information Security Owner / Security Lead** | David Ansah | Owns this ISMS, approves policies, owns the risk register, leads incident response. |
| **Data Protection point of contact** | David Ansah | Handles data-subject requests and breach notifications to the ICO (see `data-protection-policy.md`). Akpan Holdings Limited is **not** currently required to appoint a statutory DPO; reassess if processing scales. |
| **Engineering / Operations** | David Ansah | Implements controls, runs deployments, maintains IaC and monitoring. |
| **Vendor / Sub-processor owner** | David Ansah | Maintains `vendor-management.md`, obtains DPAs, reviews vendor certifications. |
| **All personnel** | Everyone | Follow these policies; report suspected incidents immediately (see `incident-response-plan.md`). |

## 5. Policy framework

This policy is implemented by the documents in `docs/security/`:

- **Access control** → `access-control-policy.md`
- **Data protection (UK GDPR)** → `data-protection-policy.md`
- **Data retention & deletion** → `data-retention-policy.md`
- **Incident response** → `incident-response-plan.md`
- **Vulnerability disclosure** → `vulnerability-disclosure-policy.md`
- **Vendor / sub-processor management** → `vendor-management.md`
- **Business continuity & backup** → `business-continuity-backup.md`
- **Secure development** → `secure-development-policy.md`
- **Risk management** → `risk-register.md`
- **Control mapping & status** → `controls-matrix.md`

Each is reviewed on the cadence stated in its header.

## 6. Risk management

Security decisions are risk-driven. We maintain a living `risk-register.md` recording each risk's likelihood, impact, mitigation and owner. The register is reviewed at least quarterly and whenever a significant change or incident occurs. Treatment options are: mitigate, accept (with sign-off), transfer (e.g. to a vendor/insurer) or avoid.

## 7. Asset and data classification

We use a lightweight classification:

- **Secret** — credentials, API keys, signing secrets. Stored only in **AWS SSM Parameter Store (SecureString)** or the relevant vendor's secret store; never in the repository, never in client-side code, never in chat or email.
- **Confidential** — customer personal data (name, email), user content, billing metadata. Encrypted in transit and at rest; access on a strict need-to-know basis.
- **Internal** — this documentation, internal runbooks, non-public configuration.
- **Public** — marketing pages, the public security/privacy pages, the static site source.

## 8. Human resources & awareness

Anyone granted access to production systems or customer data must read and agree to this policy and the access-control and data-protection policies before access is granted, and at least annually thereafter. Access is provisioned on the principle of least privilege and revoked promptly on role change or departure (see `access-control-policy.md`).

## 9. Physical security

Traxent operates **no data centres** and no in-scope office infrastructure. Physical and environmental security of the production environment is **inherited from AWS** (independently audited — see `vendor-management.md`). Personnel must keep administrative devices encrypted, password/biometric-locked, kept up to date, and never leave them unattended and unlocked.

## 10. Compliance and legal

We comply with UK GDPR and the Data Protection Act 2018 (see `data-protection-policy.md`). We honour applicable contractual commitments to customers and the obligations in our sub-processors' Data Processing Agreements. We are pursuing **SOC 2** and **ISO/IEC 27001** through independent audit (see `COMPLIANCE-ROADMAP.md`); until earned, these are described as *Planned* and never claimed as achieved.

## 11. Enforcement

Failure to follow this policy may lead to revocation of access and, for personnel, disciplinary action up to and including termination of engagement, and for sub-processors, contractual remedies up to termination.

## 12. Review and approval

This policy is reviewed on the cadence above by the Security Lead and approved by Akpan Holdings Limited's directors. Material changes are recorded in the table below.

| Version | Date | Author | Change |
|---------|------|--------|--------|
| 1.0 | 2026-06-29 | David Ansah | Initial ISMS top-level policy. |
