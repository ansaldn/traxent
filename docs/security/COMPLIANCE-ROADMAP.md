# Compliance Roadmap — Plain-English Action Plan

| | |
|---|---|
| **For** | David Ansah (Founder, Akpan Limited / Traxent) |
| **Version** | 1.0 |
| **Date** | 2026-06-29 |
| **Classification** | Internal |

This is the practical, founder-readable plan for taking Traxent from "good security with honest docs" to "independently audited and acquisition-ready." Read this after `README.md`.

---

## 1. The single most important thing to understand

**SOC 2 and ISO 27001 cannot be self-declared. They are *earned* through an independent, external assessment.** You do not "become SOC 2 compliant" by writing policies or ticking a box on your own website. Specifically:

- **SOC 2** is an **attestation report written by a licensed CPA (auditor) firm**. *You* don't issue it — the auditor does, after examining your controls. The output is a report you can share under NDA with customers and acquirers. There is no "SOC 2 certificate" and no official logo you can self-award.
- **ISO/IEC 27001** is a **certification issued by an accredited certification body** (e.g. a UKAS-accredited registrar) after they audit your Information Security Management System (ISMS). Again, *you* don't certify yourself — an accredited third party does.

Anyone who tells you that you can "self-certify" SOC 2 or ISO 27001 is wrong, and claiming either without the audit/certificate is a misrepresentation that will blow up in due diligence. What you **can** do today — and what this whole `docs/security/` pack does — is **build and document the controls** so that when you engage an auditor, you pass. That groundwork is genuine and valuable; it just isn't the certificate itself.

**HIPAA:** **not applicable** to Traxent — you process no Protected Health Information. Don't spend a penny or a minute on it, and don't let any platform upsell you a HIPAA module.

---

## 2. SOC 2 vs ISO 27001 — which, and why

| | **SOC 2** | **ISO/IEC 27001** |
|---|---|---|
| What it is | A report attesting your controls meet the AICPA Trust Services Criteria | A certification that you run a conforming ISMS |
| Issued by | A **licensed CPA firm** (auditor) | An **accredited certification body** |
| Most recognised in | **US** market / US customers & buyers | **UK / EU / international** market |
| Output | A report (shared under NDA) | A public certificate (3-year cycle with annual surveillance) |
| Flavours | **Type I** = controls designed correctly at a point in time. **Type II** = controls *operated effectively* over a period (typically 3–12 months) | Single certification; recertify every 3 years, surveillance audits in between |

**Recommendation for Traxent:** since the buyer pool for a UK SaaS could be either UK/EU or US, and many enterprise customers ask specifically for one or the other:
- If your near-term pull is **US customers/acquirers** → start with **SOC 2 (Type I, then Type II)**.
- If it's **UK/EU** → **ISO 27001** is the more recognised badge.
- The good news: **~80% of the work overlaps.** The policies, risk register, access controls, monitoring and vendor management in this pack feed **both**. Many teams do SOC 2 first (faster to a shareable artifact) and add ISO 27001 later, or pursue both on one platform.

---

## 3. The recommended path

**Step 1 — Use a compliance-automation platform.** Tools like **Vanta, Drata or Secureframe** are purpose-built for exactly this. They:
- give you pre-built **policy templates** and a control framework for SOC 2 and ISO 27001 (you've already got a head start with this pack);
- **connect directly to AWS, GitHub, Auth0** (and often Stripe) to **continuously collect evidence** automatically (e.g. "MFA is on", "encryption is enabled", "PITR is on", "deploys use OIDC") — this is the part that otherwise eats weeks of manual screenshotting;
- track gaps, run the readiness checklist, and **hand the auditor a clean evidence room**.

You do **not** strictly need a platform, but for a solo founder it pays for itself in time saved and is the standard way this is done now.

**Step 2 — Pick and engage an auditor / certification body.**
- For **SOC 2**: engage a **CPA firm** that does SOC 2 (the automation platforms have partner networks and will introduce you).
- For **ISO 27001**: engage an **accredited certification body**. Expect a **Stage 1** audit (documentation review) then a **Stage 2** audit (implementation review).

**Step 3 — Readiness → audit → report/certificate.**
- Close the gaps the platform/auditor flags (most are already in your `risk-register.md` and `controls-matrix.md`).
- For **SOC 2 Type II** and ISO 27001, you must **operate** the controls for a period and produce evidence of them running — so the clock includes a monitoring window, not just paperwork.

---

## 4. Realistic timeline

> Estimates for a small, single-product SaaS that already has good controls in place (which you do). Your mileage varies with how fast gaps close.

| Milestone | Realistic timeline (from a standing start with a platform) |
|-----------|------------------------------------------------------------|
| Platform connected + readiness assessment | First few weeks |
| **SOC 2 Type I** (point-in-time) | **≈ 3–6 months** |
| **SOC 2 Type II** (operating effectiveness over a window) | **+ 6–12 months** after Type I (the audit covers a 3–12 month observation period) |
| **ISO/IEC 27001** certification (Stage 1 + Stage 2) | **≈ 6–12 months** |

A pragmatic sequence: **platform now → SOC 2 Type I in ~3–6 months → roll straight into the Type II observation window → (optionally) ISO 27001 in parallel or right after.**

---

## 5. Ballpark annual costs

> **These are estimates to sanity-check budgets — confirm exact quotes with the vendors and auditors, as pricing varies by company size, scope and region. Figures in GBP.**

| Item | Ballpark (GBP/yr) | Notes |
|------|-------------------|-------|
| **Compliance-automation platform** (Vanta / Drata / Secureframe) | **low thousands £/yr** (~£X,000s) | Often tiered by employee count / frameworks; cheapest for a tiny team |
| **SOC 2 audit** (CPA firm) | **several thousand to low five figures £** | Type I cheaper than Type II; annual for ongoing Type II |
| **ISO 27001 certification** (accredited body) | **similar order — several thousand to low five figures £** | Initial certification + cheaper annual surveillance audits; recertify every 3 years |
| **Optional: independent penetration test** | **low-to-mid thousands £** per test | Auditors and customers increasingly expect one; see `secure-development-policy.md` §8 |
| **HIPAA** | **£0** | **Not applicable** — no PHI |

**Rough all-in for year one** (platform + one framework audit + a pen-test): plan for **roughly low-to-mid five figures GBP**, heavily dependent on scope and vendor. Treat this as an order-of-magnitude planning number, **not** a quote.

---

## 6. What you already have going for you

You are **not** starting from zero. Already in place (see `controls-matrix.md`): a documented ISMS and policy pack (this folder); server-side auth with per-user data isolation; secrets in SSM (none in the repo); encryption in transit and at rest; OIDC short-lived deploy credentials for backend/infra; infrastructure as code; strong security headers and locked CORS; an incident-response plan; UK GDPR handling with self-service deletion; DynamoDB PITR backups; and a public vulnerability-disclosure policy. An auditor will recognise this as a strong foundation.

The honest gaps to close first are tracked in `risk-register.md` — chiefly WAF/throttling (R-01), the frontend OIDC migration + IAM scope-down (R-02), monitoring/alarms (R-04), dependency hygiene (R-05), and Auth0 Attack Protection (R-11).

---

## 7. David's first 5 actions (prioritised)

1. **Confirm the entity registrations** — the legal entity name now reads **Akpan Limited** across every public surface (`privacy.html`, `terms.html`, `security.txt`, `security.html`); still confirm the Companies House number + registered address and **ICO data-protection-fee registration**. *(Cheap, fast, and a credibility/compliance must — `risk-register.md` R-08.)*
2. **Close the two highest security gaps:** turn on **AWS WAF + API Gateway throttling** (R-01) and **migrate the frontend `deploy.yml` to OIDC, then delete the static AWS access keys** + scope the deploy IAM policy (R-02). *(These are your biggest real-world risks and the first things an auditor or buyer probes.)*
3. **Pick your first framework** based on your buyer/customer pull — **SOC 2** (US-leaning) or **ISO 27001** (UK/EU-leaning) — and decide SOC 2 **Type I first, then Type II**. Write the decision down.
4. **Sign up for a compliance-automation platform** (shortlist **Vanta / Drata / Secureframe**), connect **AWS + GitHub + Auth0** (and Stripe if supported), and run its **readiness assessment**. Let it auto-collect evidence and generate the gap list. *(This is the force-multiplier; do it early.)*
5. **Get 2–3 auditor / certification-body quotes** (the platform will introduce partners), and **finish collecting vendor DPAs + current certifications** for AWS, Auth0, Stripe, Plausible, Formspree and GitHub (`vendor-management.md`). *(Confirms real budget/timeline and completes the evidence pack.)*

> Reminder throughout: keep `controls-matrix.md` and `risk-register.md` **live**, and never claim SOC 2 / ISO 27001 until the report/certificate is actually in hand.
