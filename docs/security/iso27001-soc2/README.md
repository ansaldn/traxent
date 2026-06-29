# Traxent — ISO/IEC 27001:2022 + SOC 2 Readiness Pack

| | |
|---|---|
| **For** | Akpan Holdings Limited (provider of Traxent) |
| **Owner** | David Ansah (Founder / acting Security Lead) |
| **Version** | 1.0 |
| **Date** | 2026-06-29 |
| **Classification** | Internal — not for public publication |

> **No certification is claimed.** This pack documents Traxent's **adherence to, and readiness for**, ISO/IEC 27001:2022 and SOC 2. **No external audit, attestation or certification has been performed.** ISO 27001 certification can only be issued by an accredited certification body, and a SOC 2 report can only be issued by a licensed CPA firm, after an independent assessment. Everything here describes controls we **actually operate** (or have honestly marked as Partial / Planned / Owner-action) so that, when David engages an auditor, the evidence is ready. See [`../COMPLIANCE-ROADMAP.md`](../COMPLIANCE-ROADMAP.md).

---

## What this pack is

David's decision, reflected throughout: **lead with ISO/IEC 27001:2022 as the backbone, and map SOC 2 (Trust Services Criteria) on top of the same single control set** — one set of controls, documented against both frameworks, exploiting their ~80% overlap. The rationale is in [`framework-choice-and-rationale.md`](framework-choice-and-rationale.md).

This folder **extends** the existing internal ISMS pack in [`../`](..) (policies, risk register, controls matrix, incident response, etc.). It does **not** duplicate those documents — it adds the ISO 27001 *management-system* artifacts and the cross-framework mapping that turn the existing policy set into an audit-ready evidence pack.

| File | Purpose | Framework anchor |
|------|---------|------------------|
| [`framework-choice-and-rationale.md`](framework-choice-and-rationale.md) | Why ISO-led + SOC-2-mapped, for a UK-based solo SaaS with potential US buyers | Both |
| [`isms-scope.md`](isms-scope.md) | ISMS scope, context, boundaries, interested parties, exclusions | ISO 27001 Clause 4 |
| [`risk-assessment-and-treatment.md`](risk-assessment-and-treatment.md) | Risk methodology + treatment plan; points to the live `../risk-register.md` | ISO 27001 Clauses 6 & 8; SOC 2 CC3 |
| [`statement-of-applicability.md`](statement-of-applicability.md) | The **SoA** — all 93 Annex A:2022 controls, applicability + justification + status + evidence | ISO 27001 (mandatory) |
| [`unified-control-matrix.md`](unified-control-matrix.md) | **Centrepiece** — one table mapping each control area to ISO Annex A **and** SOC 2 TSC, what we do, status, repo evidence | Both |
| [`soc2-trust-services-criteria.md`](soc2-trust-services-criteria.md) | SOC 2 CC1–CC9 + Availability + Confidentiality, what we do, status, owner-actions | SOC 2 |

## How it fits the existing pack

```
docs/security/
├── README.md                      ← existing pack index (policies, registers)
├── information-security-policy.md  ← ISMS umbrella policy
├── access-control-policy.md        ┐
├── data-protection-policy.md       │
├── data-retention-policy.md        │  existing policies — REFERENCED here,
├── secure-development-policy.md    │  not duplicated
├── incident-response-plan.md       │
├── business-continuity-backup.md   │
├── vendor-management.md            │
├── vulnerability-disclosure-policy.md ┘
├── risk-register.md               ← live risk register (Clause 6/8 input)
├── controls-matrix.md             ← original 36-row controls matrix
├── COMPLIANCE-ROADMAP.md          ← how the audits are *earned* + costs/timeline
└── iso27001-soc2/                 ← THIS pack (the dual-framework readiness layer)
```

The original [`../controls-matrix.md`](../controls-matrix.md) remains the day-to-day control list. The new [`unified-control-matrix.md`](unified-control-matrix.md) in this folder is the **audit-facing** view with the explicit two-framework columns and repo evidence locations requested for diligence.

## Status legend (used in every table here)

| Status | Meaning |
|--------|---------|
| **Implemented** | Operating in code/config/process today; evidence exists in this repo or a named system. |
| **Partial** | Partly in place / inconsistent / needs tightening before audit. |
| **Planned** | Designed/agreed but not yet implemented. |
| **Owner-action** | Cannot be done from this repository — requires David to act in a console, dashboard, registry, or to purchase a service (AWS, Auth0, Stripe, GitHub org settings, ICO, Companies House, an auditor). These rows double as David's checklist. |
| **Not applicable** | Out of scope, with a one-line justification (e.g. physical controls inherited from AWS; HIPAA — no PHI). |

## HIPAA

**Not applicable.** Traxent processes **no Protected Health Information (PHI)** — it is a trading-education / prop-firm-readiness product. No HIPAA control, BAA or module is required. (Stated here once; not repeated per-control.)

## Maintenance

- Re-review at least **quarterly** and after any major change or incident, in step with `../risk-register.md` and `../controls-matrix.md`.
- When a control moves status (e.g. Planned → Implemented), update the [`unified-control-matrix.md`](unified-control-matrix.md), the [`statement-of-applicability.md`](statement-of-applicability.md) **and** the underlying policy on the same day.
- Never describe Traxent as "ISO 27001 certified" or "SOC 2 compliant/certified" until the certificate / report is actually in hand.
