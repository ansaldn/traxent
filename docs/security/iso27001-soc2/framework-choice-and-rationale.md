# Framework Choice & Rationale — ISO 27001-led, SOC 2-mapped

| | |
|---|---|
| **Owner** | David Ansah (Security Lead) |
| **Version** | 1.0 · **Date** 2026-06-29 · **Classification** Internal |
| **Decision** | **Lead with ISO/IEC 27001:2022; map SOC 2 Trust Services Criteria onto the same control set.** |

> No certification is claimed. This document explains *which* frameworks Traxent builds toward and *why*. How they are actually *earned* (auditors, timelines, ballpark costs) is in [`../COMPLIANCE-ROADMAP.md`](../COMPLIANCE-ROADMAP.md).

---

## 1. The decision in one line

Build **one** control set. Run it as an **ISO/IEC 27001:2022 ISMS** (the management-system backbone), and **map every control to the SOC 2 Trust Services Criteria** so the same evidence answers a US buyer's SOC 2 question. Do **not** maintain two parallel programmes.

## 2. Why ISO 27001 is the backbone

| Reason | Detail |
|--------|--------|
| **UK base, UK/EU buyers** | Akpan Limited is registered in England & Wales and hosts in AWS `eu-west-2` (London). ISO/IEC 27001 is the most recognised information-security badge in the UK/EU and internationally. |
| **A shareable, public certificate** | ISO 27001 results in a **certificate** (3-year cycle, annual surveillance) you can show publicly — unlike a SOC 2 report, which is shared under NDA. Good for a small company that wants a visible trust signal. |
| **The management system is producible now** | ISO 27001's core is the **ISMS** — scope, leadership, risk assessment/treatment, Statement of Applicability, objectives, internal audit, management review. These are **documentation and process** artifacts a solo founder can stand up today (this pack does exactly that), independent of headcount. |
| **Annex A is a complete control catalogue** | The 93 Annex A:2022 controls give an exhaustive, internationally agreed checklist. Working the SoA forces an honest applicability decision on every control — which is precisely the gap analysis a buyer's diligence performs. |
| **Risk-driven, proportionate** | ISO 27001 is explicitly risk-based: controls are justified by the risk register, so a small single-product SaaS can scope sensibly (e.g. inherit physical controls from AWS) without pretending to run an enterprise. |

## 3. Why SOC 2 is mapped on top (not run separately)

| Reason | Detail |
|--------|--------|
| **US-buyer demand** | Many US customers and acquirers ask specifically for **SOC 2**. If Traxent's near-term pull turns US, we must answer that question without rebuilding the programme. |
| **~80% overlap** | The policies, risk register, access control, change management, monitoring, vendor management and incident response that satisfy ISO 27001 Annex A also satisfy the SOC 2 **Common Criteria (CC1–CC9)**. Mapping is cheaper than duplicating. See [`unified-control-matrix.md`](unified-control-matrix.md). |
| **Same evidence room** | A compliance-automation platform (Vanta/Drata/Secureframe) collects evidence once (AWS, GitHub, Auth0, Stripe) and reports it against **both** frameworks. One integration set, two outputs. |
| **Lower marginal cost** | Once the ISMS exists, a SOC 2 Type I is largely a re-presentation of the same controls to a CPA firm. Adding it later is incremental, not a fresh start. |

## 4. SOC 2 scope chosen

- **In scope now:** **Security / Common Criteria (CC1–CC9)** — the mandatory baseline — plus **Availability (A1)** and **Confidentiality (C1)**, both of which map cleanly to controls Traxent already operates (PITR backups + recovery objectives → Availability; data classification, retention, encryption and least-privilege → Confidentiality).
- **Out of initial scope:** **Processing Integrity (PI)** and **Privacy (P)** as *SOC 2 categories*. Privacy obligations are handled under **UK GDPR / DPA 2018** via [`../data-protection-policy.md`](../data-protection-policy.md); they can be folded into a SOC 2 Privacy category later if a buyer requires it.

See [`soc2-trust-services-criteria.md`](soc2-trust-services-criteria.md) for the criterion-by-criterion mapping.

## 5. Sequencing

A pragmatic order, consistent with [`../COMPLIANCE-ROADMAP.md`](../COMPLIANCE-ROADMAP.md):

1. **Now** — finish the ISMS documentation (this pack), close the highest-rated risks in [`../risk-register.md`](../risk-register.md), and connect a compliance-automation platform to start auto-collecting evidence.
2. **Then** — if US demand is immediate, take a **SOC 2 Type I** first (fastest shareable artifact) off the mapped control set; otherwise go straight for **ISO 27001 Stage 1 → Stage 2**.
3. **Then** — operate the controls over an observation window and pursue the other framework off the same evidence (**SOC 2 Type II** and/or **ISO 27001** as the counterpart).

The point of the ISO-led + SOC-2-mapped approach is that **the order can flex to whichever buyer shows up first**, because the underlying control set and evidence are identical.

## 6. What is explicitly out of scope

| Item | Decision | Why |
|------|----------|-----|
| **HIPAA** | **Not applicable** | Traxent processes no PHI. |
| **PCI-DSS (as a Traxent obligation)** | **Inherited** | Stripe (PCI-DSS Level 1) handles all card data; no card data touches Traxent's servers. We document the inheritance, not a Traxent PCI programme. |
| **SOC 2 Processing Integrity / Privacy categories** | **Deferred** | Add on buyer demand; Privacy already covered by UK GDPR programme. |
| **Physical/environmental controls (data-centre)** | **Inherited from AWS** | Traxent operates no in-scope data centres or offices; see [`isms-scope.md`](isms-scope.md) and Annex A.7 in the [`statement-of-applicability.md`](statement-of-applicability.md). |
