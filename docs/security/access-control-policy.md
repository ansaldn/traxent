# Access Control Policy

| | |
|---|---|
| **Document owner** | David Ansah (Security Lead) |
| **Version** | 1.0 |
| **Effective date** | 2026-06-29 |
| **Review cadence** | At least annually, and after any access-related incident |
| **Classification** | Internal |
| **Parent policy** | `information-security-policy.md` |

---

## 1. Purpose & principle

Access to Traxent systems and data is granted on the principle of **least privilege**: each person, role and machine identity gets the **minimum** access needed to do its job, and no more. This policy covers human access (the founder and any future staff/contractors) and machine access (CI/CD, Lambda execution roles, service-to-service credentials) across **AWS, GitHub, Auth0, Stripe** and the company email/domain.

## 2. Identity & authentication

### 2.1 Multi-factor authentication (MFA) — mandatory for all admin access
MFA is **required** on every account that can administer the service or reach customer data:

- **AWS** — root account MFA enabled, no root access keys; human console access via IAM with MFA (migrate to IAM Identity Center as the team grows).
- **GitHub** — MFA enforced on the account(s) with access to `ansaldn/traxent`.
- **Auth0** — MFA on the Auth0 management/tenant-admin accounts.
- **Stripe** — MFA on the Stripe dashboard account(s).
- **Domain / email / DNS registrar** — MFA enabled.

For **end users** of Traxent, authentication is delegated to **Auth0**; **MFA is available** to users and passwords are never stored by Traxent.

### 2.2 Strong, unique credentials
All admin accounts use unique, strong passwords stored in a password manager. Credentials are never shared between people or reused across services.

## 3. Authorisation & least privilege

### 3.1 Application-layer authorisation (already in place)
- Every backend endpoint verifies the **Auth0 token** (RS256 via JWKS) and derives the user's identity from the **verified `sub` claim** — never from the request body. A forged body cannot act on another user's data.
- Data is **partitioned per user** in DynamoDB (partition key = the user's `sub`); there is no cross-tenant query path.
- Plan/entitlement gates that matter are enforced **server-side**; client-side gates are UX only.
- Lambda functions use **scoped IAM** (e.g. `SSMParameterReadPolicy` constrained to `traxent/*`, table-scoped DynamoDB policies) rather than broad permissions. *(Ongoing: continue tightening per-function scope per `SECURITY-AUDIT.md` §4.1–4.2.)*

### 3.2 Human access to cloud consoles
Console/admin access (AWS, Auth0, Stripe, GitHub) is limited to those who need it. As the team grows, grant role-based access (e.g. read-only billing, deploy-only, full admin) rather than sharing a single all-powerful login.

## 4. Deployment identities — OIDC, no static keys

Traxent's CI/CD uses **GitHub Actions**. The deploy identity model:

- **Backend & infrastructure workflows** (`deploy-backend.yml`, `deploy-infra.yml`, and the scheduled-release workflow) authenticate to AWS via **GitHub OpenID Connect (OIDC)** — GitHub presents a short-lived token and assumes an IAM role (`role-to-assume: ${{ vars.AWS_DEPLOY_ROLE_ARN }}`). **There are no long-lived AWS access keys for these workflows to leak or rotate.** Setup is documented in `../../IAM-OIDC-SETUP.md`.
- The OIDC role's **trust policy is restricted to this repository** (`repo:ansaldn/traxent:*`). The recommended hardening is to pin it to the `main` branch (`repo:ansaldn/traxent:ref:refs/heads/main`).

**Known gap (tracked, must close):**
- The **frontend deploy workflow** (`deploy.yml`, S3 + CloudFront sync) **still uses long-lived `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` secrets**. The OIDC role already includes the needed S3 + CloudFront permissions, so this workflow should be migrated to OIDC and the static keys deleted. (See `risk-register.md` R-02 and `SECURITY-AUDIT.md` H2.)
- The OIDC permissions policy is currently **broad** (`cloudformation:*`, `lambda:*`, `dynamodb:*`, `apigateway:*`, `s3:*`, scoped `iam:*`) on `Resource: *`. Scope it down to the specific `traxent-*` stacks, the `traxent.io` bucket, the named functions, and constrain `iam:PassRole` to the SAM execution roles. (See `risk-register.md` R-02.)

## 5. Secrets & key management

- **All application secrets** (Stripe keys, Auth0 M2M client secrets, the news-provider key, webhook signing secrets) live in **AWS SSM Parameter Store as SecureString** (encrypted with KMS). **None are committed to the repository or embedded in client-side code.** Lambda functions read them at runtime via a least-privilege `ssm:GetParameter` policy scoped to `traxent/*`.
- **No secrets in the repo, in logs, in chat, or in email.** Where a secret must be handed to a person, it is shared via a secure channel and the recipient stores it in a password manager / the relevant secret store.
- **Rotation.** Rotate Stripe keys, Auth0 M2M secrets and webhook signing secrets on a defined schedule and immediately on any suspected compromise or personnel departure. Prefer **Stripe restricted keys** scoped per function (checkout vs cancel vs webhook) over a single full-access key (see `SECURITY-AUDIT.md` L3). Keep the two Auth0 M2M apps separate and minimally scoped (`read:roles`/`update:users` vs `delete:users`).
- **iOS app** stores user tokens in the **Keychain** (not `UserDefaults`); only a non-sensitive auth-method string is in defaults.

## 6. Provisioning, review & revocation (joiner / mover / leaver)

- **Joiner** — access is granted explicitly, least-privilege, only after the person has read this policy and the parent ISMS policy. Each grant is recorded.
- **Mover** — when someone's role changes, their access is re-evaluated and unneeded permissions removed.
- **Leaver** — on departure, **all** access (AWS, GitHub, Auth0, Stripe, email, password-manager vaults) is revoked **promptly** (target: same business day), and any shared secrets they knew are rotated.
- **Access review** — review who has access to what at least **quarterly** and after any incident; remove anything no longer justified.

## 7. End-user account access

Traxent users authenticate via Auth0 and can, from their account page: edit their details, change plan, and **permanently self-delete** their account and data. User-facing identity controls (password reset, MFA enrolment) are provided by Auth0.

## 8. Logging of access

Administrative and authentication events are logged where the platform supports it (AWS CloudTrail for AWS API activity, Auth0 logs for authentication, CloudWatch for application logs). *(Planned: enable AWS CloudTrail all-region to an access-locked bucket and stream Auth0 logs — see `controls-matrix.md` and `risk-register.md`.)*

## 9. Exceptions & review

Any exception to this policy must be risk-assessed and signed off by the Security Lead and recorded in `risk-register.md`. This policy is reviewed on the cadence above.

| Version | Date | Author | Change |
|---------|------|--------|--------|
| 1.0 | 2026-06-29 | David Ansah | Initial access control policy. |
