# Incident Response Plan — Traxent

**Owner:** David Ansa (Founder) · **Adopted:** 2026-08-17 · **Review:** annually or after any incident.
Version-controlled in this repo; the git history is the audit trail of changes.

## Scope
Any event that threatens the confidentiality, integrity or availability of Traxent systems or user data: suspected breach, credential/key leak, defacement, data-exposing bug, sustained DoS, or a processor's incident affecting our users (Auth0, Stripe, AWS, Cloudflare, Resend, Zoho).

## Severity
- **SEV1** — confirmed exposure/loss of user data, payment compromise, full outage. Act immediately.
- **SEV2** — likely exposure or partial outage of a core flow (login, checkout). Act same day.
- **SEV3** — vulnerability found before exploitation; degraded non-core feature. Fix within the week.

## Response steps
1. **Contain** — revoke/rotate the affected credential first (see Rotation runbook below); disable the affected route via API Gateway/CloudFront or, worst case, `aws lambda put-function-concurrency --function-name <fn> --reserved-concurrent-executions 0`.
2. **Assess** — CloudWatch logs (`/aws/lambda/traxent-*`), CloudTrail (who did what), WAF metrics, Auth0 tenant logs, Stripe events. Establish what data, which users, what window.
3. **Record** — start a timeline note (date, discovery, actions) in `docs/incidents/<YYYY-MM-DD>-<slug>.md`. Contemporaneous notes are the evidence auditors and the ICO expect.
4. **Notify** — personal-data breach likely to risk users' rights: assess against ICO guidance; if reportable, report to the **ICO within 72 hours** of awareness (ico.org.uk) and inform affected users without undue delay. Payment data: also Stripe. Keep the assessment in the incident note even when the conclusion is "not reportable".
5. **Recover** — restore from DynamoDB PITR if data was damaged; redeploy from git (all infra is IaC).
6. **Post-mortem** — within 1 week, append to the incident note: root cause, what worked, what changes ship as a result. Blameless.

## Key rotation runbook (contain step)
| Credential | Rotate at | Update in |
|---|---|---|
| Stripe keys | Stripe → API keys | SSM `/traxent/stripe/key_*` |
| Stripe webhook secret | Stripe → the endpoint | SSM `/traxent/stripe/webhook_secret` |
| Auth0 M2M secrets | Auth0 → Applications → Credentials | SSM `/traxent/auth0/*_client_secret` |
| Resend key | Resend → API Keys | SSM `/traxent/resend/api_key` |
| AWS deploy role | IAM (revoke sessions / edit trust) | n/a (OIDC, no stored key) |

SSM changes take effect on the next Lambda invocation — no redeploy.

## Contacts
Reports arrive via `security@traxent.io` (advertised in `/.well-known/security.txt`). External: ICO (ico.org.uk / 0303 123 1113), AWS Support, Auth0 Support, Stripe Support.
