# Risk Assessment & Treatment Methodology — ISO/IEC 27001:2022 Clauses 6 & 8

| | |
|---|---|
| **Owner** | David Ansah (Security Lead) |
| **Version** | 1.0 · **Date** 2026-06-29 · **Classification** Internal |
| **Satisfies** | ISO/IEC 27001:2022 Clause 6.1 (actions to address risks) & Clause 8 (operation). Maps to SOC 2 **CC3.1–CC3.4** (risk assessment) and **CC9.1** (risk mitigation). |

> No certification is claimed. This document defines *how* Traxent assesses and treats information-security risk. The **live results** are in [`../risk-register.md`](../risk-register.md); this document is the methodology and the treatment plan that sits over it. This is the missing piece an ISO auditor expects alongside a populated register.

---

## 1. Approach

Traxent uses a **risk-based, asset- and threat-informed** assessment, proportionate to a small single-product SaaS. The register is **living** — re-scored at least quarterly and after any incident or material change.

## 2. Risk identification

Risks are identified from:
- the architecture and data flows in [`isms-scope.md`](isms-scope.md);
- the technical findings in [`../../../SECURITY-AUDIT.md`](../../../SECURITY-AUDIT.md) and [`../../../SECURITY.md`](../../../SECURITY.md) (OWASP Top 10 + AWS Well-Architected);
- threat intelligence and vendor advisories (A.5.7), Dependabot alerts (A.8.8);
- incidents and near-misses via [`../incident-response-plan.md`](../incident-response-plan.md).

Each risk names the **asset** affected (customer data, availability, credentials, source code, reputation) and the **threat/vulnerability** pairing.

## 3. Risk analysis & evaluation

Each risk is scored on **Likelihood** (Low / Medium / High) and **Impact** (Low / Medium / High); the rating is approximately likelihood × impact:

| | Impact: Low | Impact: Medium | Impact: High |
|---|---|---|---|
| **Likelihood: High** | Medium | High | **Critical** |
| **Likelihood: Medium** | Low–Medium | Medium | **High** |
| **Likelihood: Low** | Low | Low–Medium | Medium |

**Risk acceptance criteria:** ratings of **High** or **Critical** require an active treatment plan with an owner and target; **Medium** is treated where cost-effective, otherwise consciously accepted with sign-off; **Low** is monitored. Residual risk is reviewed at each quarterly cycle.

## 4. Risk treatment options

Standard four options, recorded per risk in the register:

| Option | Meaning | Example in Traxent |
|--------|---------|--------------------|
| **Mitigate** | Apply/strengthen controls to reduce likelihood or impact | WAF + API throttling (R-01); CSP + headers; least-privilege IAM |
| **Transfer** | Shift risk to a third party | Card data → Stripe; hosting resilience → AWS; identity → Auth0 |
| **Avoid** | Stop doing the risky thing | Not storing card data; not building a bespoke auth system |
| **Accept** | Consciously tolerate, with sign-off | Static-site S3 public-via-website-endpoint, content non-sensitive (R-12); key-person dependency, monitored (R-09) |

The chosen controls are drawn from **Annex A:2022** and recorded, with their applicability justification, in the [`statement-of-applicability.md`](statement-of-applicability.md).

## 5. Risk treatment plan (current top risks)

This is the treatment view of the live register. **Statuses and IDs mirror [`../risk-register.md`](../risk-register.md)** — that file is the source of truth; update it first.

| Risk ID | Risk (short) | Rating | Treatment | Status | Owner-action? |
|---------|--------------|--------|-----------|--------|----------------|
| **R-01** | No WAF / API throttling → DoS + cost amplification | High | Mitigate: AWS WAF rate rules + API GW throttling + JWT authorizer | In progress | **Yes** — AWS console / SAM deploy |
| **R-02** | Frontend `deploy.yml` uses static AWS keys; broad OIDC policy | High | Mitigate: migrate frontend deploy to OIDC, delete static keys, scope policy to `traxent-*` | Open | **Yes** — GitHub secrets + AWS IAM |
| **R-03** | ID token in `localStorage` under `unsafe-inline` CSP → XSS = token theft | Medium | Mitigate: shorten token TTL; move to nonce/hash CSP; consider BFF/HttpOnly | Open | Partly code (CSP refactor), partly Auth0 dashboard (TTL) |
| **R-04** | Thin detection: not all alarms; no billing budget | Medium | Mitigate: CloudWatch alarms + AWS Budgets + SNS | In progress | **Yes** — AWS console / SAM |
| **R-05** | Floating deps, `npm install` (not `ci`), partial lockfiles, no SRI | Medium | Mitigate: Dependabot (now all 9 functions), pin deps + commit lockfiles + `npm ci`, add SRI | In progress | Partly done in repo (Dependabot); rest = code + verify |
| **R-06** | Single full-access Stripe key reused | Low–Medium | Mitigate: per-function restricted keys; rotate | Open | **Yes** — Stripe dashboard + SSM |
| **R-08** | No formal SOC 2 / ISO 27001; entity registrations to confirm | Medium | Mitigate: this pack + roadmap; confirm ICO + Companies House | Open | **Yes** — registrations + auditor |
| **R-09** | Key-person dependency (solo founder) | High | Accept (monitored): keep docs current; password manager + recovery | Accepted | **Yes** — as team grows |
| **R-11** | Credential-stuffing against Auth0 login | Medium | Mitigate: Auth0 Attack Protection; admin MFA | In progress | **Yes** — Auth0 dashboard |

> The full register (R-01…R-13) with likelihood/impact and the review log is in [`../risk-register.md`](../risk-register.md). The cross-framework control mapping for each treatment is in [`unified-control-matrix.md`](unified-control-matrix.md).

## 6. Methodology-level honest gaps (Owner-action)

- **Formal sign-off** of risk acceptance for accepted Medium/Low risks should be recorded (a line per accepted risk with date + "accepted by David Ansah").
- **Quantified security objectives** (Clause 6.2) — e.g. "0 Critical risks open", "100% of functions on Dependabot", "patch High vulns within N days" — should be written down with targets and dates before a Stage 1 audit.
- **Independent review** of the assessment (A.5.35) is currently self-performed; an external pen-test / review is Planned (see [`../secure-development-policy.md`](../secure-development-policy.md) §8).
