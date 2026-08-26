# Access Review — Traxent

**Owner:** David Ansa · **Cadence:** quarterly (and on any personnel/tooling change).
Each review appends an entry below — the git history is the audit trail.

## What gets reviewed
For each system: who has access, at what privilege, is it still needed, is MFA enforced.
Systems: AWS (IAM Identity Center + the GitHub OIDC deploy role), GitHub, Auth0 (dashboard + M2M apps), Stripe, Cloudflare, Zoho, Resend, Apple Developer.

## Standing rules
- Human access via SSO/IdC with MFA; **root** accounts unused, hardware-key (FIDO) protected, no root API keys.
- Machine access is least-privilege: per-function IAM policies, per-function Stripe restricted keys, scoped Auth0 M2M grants, OIDC (no long-lived cloud keys) for CI.
- Access is removed the day it stops being needed.

---

## Review log

### 2026-08-17 — Initial review (baseline)
Sole operator: **David Ansa**. All systems below verified this session:

| System | Human access | Machine access | MFA | Verdict |
|---|---|---|---|---|
| AWS | David (Identity Center admin; root locked, FIDO) | GitHub OIDC deploy role (scoped, main-branch pinned); per-function Lambda roles | ✅ | OK |
| GitHub | David | Actions via OIDC; Dependabot | ✅ | OK |
| Auth0 | David (dashboard, MFA) | 2 M2M apps, least-privilege scopes | ✅ | OK |
| Stripe | David | Per-function restricted keys in SSM | ✅ | OK |
| Cloudflare | David | none | ✅ | OK |
| Apple Developer | David | Xcode Cloud | ✅ | OK |
| Zoho / Resend | David (being set up) | Resend API key in SSM | pending | Confirm MFA at setup |

No excess access identified. Next review due **November 2026**.
