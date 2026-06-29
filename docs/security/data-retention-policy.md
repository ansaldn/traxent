# Data Retention & Deletion Policy

| | |
|---|---|
| **Document owner** | David Ansah (Data Protection point of contact) |
| **Version** | 1.0 |
| **Effective date** | 2026-06-29 |
| **Review cadence** | At least annually |
| **Classification** | Internal |
| **Related** | `data-protection-policy.md`, `business-continuity-backup.md`, `vendor-management.md` |

---

## 1. Purpose

To satisfy the UK GDPR **storage-limitation** principle: we keep personal data only as long as we have a lawful purpose, then delete or anonymise it. This policy states **what** we hold, **how long**, **why**, and **how** it is deleted. It is the internal counterpart to the "Data retention" section of `../../src/privacy.html`.

## 2. Retention principles

- Keep account/personal data **for as long as the account is active**.
- On account deletion (user self-service or request), **delete personal data within 30 days**, except where a specific legal/tax obligation requires longer retention of specific records.
- **Anonymised, aggregated** data (which cannot identify an individual) may be retained indefinitely — it is no longer personal data.
- Backups follow their own lifecycle (see §5): personal data may persist in backups for a bounded window after live deletion, then ages out.

## 3. Retention schedule

| Data | Where it lives | Retention | Basis / reason |
|------|----------------|-----------|----------------|
| Account identity (name, email) | DynamoDB (`eu-west-2`), Auth0 | While account is active; **deleted within 30 days** of account deletion | Contract; storage limitation |
| Authentication records (Auth0 `sub`, login metadata) | Auth0 | While account is active; removed on deletion via Auth0 Management API | Contract; security |
| Subscription / billing metadata (plan, Stripe IDs) | DynamoDB; Stripe | While active; **deleted within 30 days** of deletion **except** invoice/transaction records Stripe/we must retain for tax/accounting | Contract; **legal obligation** (tax) |
| Payment card data | **Stripe only — never on our servers** | Governed by Stripe (PCI-DSS L1) | Not held by Traxent |
| User content (simulated trade-journal entries) | DynamoDB | While active; deleted with the account | Contract; user-generated |
| Application / security logs (incl. IP) | CloudWatch | Short, bounded period (recommend ≤ 90 days unless needed for an active investigation) | Legitimate interests (security) |
| CloudTrail / audit logs *(when enabled)* | S3 (access-locked) | Retain ≥ 1 year for audit/forensics | Security/assurance |
| Aggregated, cookieless analytics | Plausible | May be retained indefinitely (non-identifying) | Not personal data |
| Waitlist email captures | Formspree | Until the waitlist purpose is fulfilled or the person unsubscribes/requests deletion | Consent / legitimate interests |
| Backups (DynamoDB PITR) | AWS (managed) | Per PITR window (see §5) | Resilience |
| Financial/tax records (invoices) | Stripe / accounting | As required by UK tax law (typically ~6 years) | **Legal obligation** |
| This security documentation | Repo (`docs/security/`) | Indefinite; superseded versions retained for audit trail | Accountability |

*(Where a "recommend" period is shown, confirm and pin the exact configured value, then update this table.)*

## 4. Deletion mechanisms

- **User-initiated.** Users can **permanently self-delete** their account and data from the account page. This removes the user's records from DynamoDB and deletes the Auth0 user (via the Management API); Stripe customer/subscription objects are cancelled/handled accordingly, subject to legally required invoice retention.
- **Request-initiated.** Erasure requests to `data.gdpr@traxent.io` are actioned within the UK GDPR timeframe (see `data-protection-policy.md` §6) and completed within the **30-day** deletion window.
- **Verification.** Identity is verified (normally via the authenticated account) before deletion.
- **Anonymisation.** Where data must be kept for analytics or legal reasons, identifiers are removed so the residual data is no longer personal data.

## 5. Backups & residual copies

DynamoDB **point-in-time recovery (PITR)** retains a rolling recovery window (AWS PITR provides continuous backups for up to **35 days**). Deleted personal data may therefore persist in this window until it ages out; we do not restore it into production except as part of a legitimate recovery, and any restore that re-introduces deleted data must re-apply the deletion. See `business-continuity-backup.md`.

## 6. Review

Retention periods are reviewed at least annually and whenever processing or legal obligations change. Changes are reflected here and in `../../src/privacy.html`.

| Version | Date | Author | Change |
|---------|------|--------|--------|
| 1.0 | 2026-06-29 | David Ansah | Initial data retention & deletion policy. |
