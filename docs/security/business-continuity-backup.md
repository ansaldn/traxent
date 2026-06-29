# Business Continuity & Backup Policy

| | |
|---|---|
| **Document owner** | David Ansah (Operations / Security Lead) |
| **Version** | 1.0 |
| **Effective date** | 2026-06-29 |
| **Review cadence** | At least annually; test restores at least annually |
| **Classification** | Internal |
| **Related** | `incident-response-plan.md`, `data-retention-policy.md`, `secure-development-policy.md` |

---

## 1. Purpose

To ensure Traxent can recover its service and data after a failure, corruption, deletion or disaster, with as little disruption and data loss as practical. Traxent's architecture is **serverless and defined as code**, which makes most of the environment **reproducible** rather than something to back up wholesale.

## 2. What we rely on

| Layer | Technology | Continuity property |
|-------|-----------|---------------------|
| Static site | AWS **S3 + CloudFront** (`eu-west-2`) | Source is in Git; redeployable. CloudFront/Shield Standard absorbs edge load. |
| Backend compute | AWS **Lambda** + **API Gateway** | Stateless; redeployable from IaC + Git. |
| Database | **DynamoDB** | **Encryption at rest (SSE)** + **point-in-time recovery (PITR)**; AWS-managed durability/replication within the region. |
| Config / infra | **SAM / CloudFormation** (IaC) | The environment is code; can be re-created. |
| Secrets | **SSM Parameter Store (SecureString)** | Centralised, encrypted; document which parameters exist so they can be re-populated if ever lost. |
| Auth | **Auth0** | Vendor-managed availability and durability. |
| Payments | **Stripe** | Vendor-managed; system of record for billing. |

## 3. Backups

- **DynamoDB PITR** provides continuous backups with restore to any second in the rolling window (AWS PITR retains up to **35 days**). This is our primary data-recovery mechanism. **Confirm PITR is enabled on every production table.**
- **On-demand backups / exports.** Take an on-demand DynamoDB backup before any risky migration or bulk operation. *(Recommended addition: a periodic export to S3 for longer-term retention and portability — `controls-matrix.md` Planned.)*
- **Code & IaC** are versioned in GitHub (`ansaldn/traxent`); the repository itself is effectively backed up by GitHub plus any local clones.
- **Secrets** are not "backed up" as files (they must not be exported in plaintext); instead, the **list** of required SSM parameters is documented so they can be re-created from each source-of-truth vendor (Stripe, Auth0) if necessary.

## 4. Recovery objectives (targets)

These are realistic targets for a small serverless product; refine as the business matures.

| Scenario | Approach | Target RTO | Target RPO |
|----------|----------|-----------|-----------|
| Bad deploy (code/config) | Roll back via Git + redeploy (CI/CD, OIDC) | Minutes–1 hour | 0 (no data loss) |
| Data corruption / accidental deletion in DynamoDB | **Restore from PITR** to a point just before the event | Hours | Seconds–minutes (within PITR granularity) |
| Loss of a Lambda/API config | Redeploy from **SAM/CloudFormation** | Hours | 0 |
| Static site issue | Redeploy from Git to S3; invalidate CloudFront | Minutes | 0 |
| Regional AWS disruption (`eu-west-2`) | Wait out / engage AWS; (future) consider multi-region IaC for critical paths | Hours–days | Per PITR |
| Sub-processor outage (Auth0/Stripe) | Follow vendor status; degrade gracefully; resume on restoration | Vendor-dependent | Vendor-dependent |

*(RTO = how quickly we aim to restore service; RPO = how much data, in time, we could lose.)*

## 5. Recovery procedure (outline)

1. **Declare** the incident and severity per `incident-response-plan.md`; start the timeline.
2. **Diagnose** scope — code, config, data, or vendor.
3. **For data loss/corruption:** identify the last-known-good point and **restore DynamoDB from PITR** (restores create a new table — repoint the app/IaC, validate, then cut over). If the restore re-introduces data a user had deleted, re-apply that deletion (see `data-retention-policy.md`).
4. **For code/config loss:** redeploy the known-good commit via CI/CD; for infra, redeploy the **SAM/CloudFormation** stack.
5. **Re-populate secrets** in SSM from source if required.
6. **Validate** functionality and that monitoring/alarms are healthy.
7. **Post-incident review** per `incident-response-plan.md` §8.

## 6. Monitoring that supports continuity

**CloudWatch alarms + SNS alerts** flag Lambda errors/throttles, DynamoDB throttling and (recommended) a billing budget, so failures and abuse are detected early. *(Some alarms are Planned — see `controls-matrix.md` and `SECURITY-AUDIT.md` §4.4.)*

## 7. Testing

- **At least annually**, perform a **test restore** from DynamoDB PITR into a scratch table and verify data integrity.
- **At least annually**, perform an **IaC redeploy** to a test stack to confirm the environment truly rebuilds from code.
- Record the date and outcome of each test.

| Version | Date | Author | Change |
|---------|------|--------|--------|
| 1.0 | 2026-06-29 | David Ansah | Initial business continuity & backup policy. |
