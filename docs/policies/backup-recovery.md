# Backup & Recovery — Traxent

**Owner:** David Ansa · **Adopted:** 2026-08-17 · **Review:** annually.

## What is backed up, and how
- **User data (DynamoDB `TraxentUserData`, `TraxentSubscribers`)** — Point-in-Time Recovery (PITR) enabled: continuous backups, restorable to any second in the last **35 days**. Encrypted at rest (SSE).
- **Code & infrastructure** — everything is in git (GitHub) as IaC (SAM templates, workflows, CloudFront function, site). A lost AWS account is recoverable by re-running the stacks from the repo.
- **Secrets** — SSM Parameter Store (SecureString). Not exported anywhere; recreate-able from the issuing dashboards (Stripe, Auth0, Resend) if lost.
- **Billing state** — authoritative in Stripe; Auth0 roles are re-derivable from Stripe subscriptions via the webhook logic.
- **Static site** — S3 is a deploy target, not a store of record; the repo is the source of truth.

## Recovery objectives (solo-operator scale)
- **RPO** (max data loss): seconds — PITR is continuous.
- **RTO** (time to restore): hours, not minutes — a table restore + name swap is a manual runbook.

## Restore runbook (DynamoDB)
1. `aws dynamodb restore-table-to-point-in-time --source-table-name TraxentUserData --target-table-name TraxentUserData-restore --restore-date-time <ISO>`
2. Verify the restored table's contents.
3. Swap: either repoint the functions' `TABLE_NAME`/`USER_DATA_TABLE` env at the restored table, or export/import the delta back into the live table.
4. Record the event in `docs/incidents/`.

## Restore testing
A restore test (steps 1–2 against a throwaway target table, then delete it) is performed **annually** and logged below. The test proves the backup is usable — an untested backup is a hope, not a control.

| Date | Table | Result | Notes |
|---|---|---|---|
| _pending — perform first test_ | | | |
