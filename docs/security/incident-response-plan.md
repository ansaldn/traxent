# Incident Response Plan

| | |
|---|---|
| **Document owner** | David Ansah (Incident Lead / Security Lead) |
| **Version** | 1.0 |
| **Effective date** | 2026-06-29 |
| **Review cadence** | At least annually; after every Sev-1/Sev-2 incident; dry-run test annually |
| **Classification** | Internal |
| **Related** | `data-protection-policy.md` (breach notification), `business-continuity-backup.md`, `vulnerability-disclosure-policy.md` |

---

## 1. Purpose & scope

This plan defines how Traxent detects, responds to, communicates and learns from **security incidents** — any event that compromises (or threatens to compromise) the confidentiality, integrity or availability of Traxent systems or data. It includes **personal data breaches** (which carry legal notification duties — see §7) and major availability incidents.

## 2. Roles

| Role | Default holder | Responsibility |
|------|----------------|----------------|
| **Incident Lead** | David Ansah | Declares the incident, owns the response, makes containment decisions, owns comms. |
| **Technical responder** | David Ansah | Investigates, contains, eradicates, recovers. |
| **Comms / Data Protection** | David Ansah | Handles user/ICO/vendor communications and the 72-hour breach assessment. |

(As the team grows these roles should be separated. External help — e.g. AWS Support, the Auth0/Stripe security teams, or an incident-response firm — is engaged as needed.)

## 3. Severity levels

| Severity | Definition | Examples | Target response |
|----------|-----------|----------|-----------------|
| **Sev-1 (Critical)** | Confirmed/likely breach of personal data, full outage, or active exploitation | Customer data exfiltrated; production credentials leaked and in use; account-takeover at scale; total API outage | **Immediate** — drop other work; engage now |
| **Sev-2 (High)** | Serious security issue or major degradation, not yet a confirmed data breach | Critical vulnerability being exploited in the wild affecting us; partial outage of a money/data path; a leaked but unused credential | **Within hours** |
| **Sev-3 (Medium)** | Contained or lower-impact issue | Suspicious activity blocked by WAF; a non-exploited vulnerability report; minor degradation | **Within 1–2 business days** |
| **Sev-4 (Low)** | Minor / informational | Low-severity disclosure report; cosmetic misconfiguration | **Best effort / next cycle** |

When unsure, **assume the higher severity** until proven otherwise.

## 4. Detection & reporting

Incidents may surface from: **CloudWatch alarms + SNS alerts**, AWS GuardDuty/Security Hub (when enabled), Auth0/Stripe alerts, AWS WAF block spikes, a vulnerability report to **`security@traxent.io`** (see `vulnerability-disclosure-policy.md`), a customer report, or personal observation.

**Anyone** who suspects an incident must report it **immediately** to the Incident Lead (`security@traxent.io` / direct contact). Reporting in good faith is always the right call — never sit on a suspicion.

## 5. Response process

1. **Identify & declare.** Confirm something is wrong, assign a severity, and start an **incident timeline** (timestamped log of facts, actions and decisions). Preserve evidence (logs, snapshots) before changing things.
2. **Contain.** Stop the bleeding: revoke/rotate compromised credentials and secrets (SSM, Stripe, Auth0 M2M, AWS keys); block malicious IPs at **WAF**; disable an affected function, endpoint or user; tighten or pause a deploy. Containment beats a perfect diagnosis.
3. **Eradicate.** Remove the root cause — patch the vulnerability, fix the misconfiguration, remove attacker access/persistence, invalidate stolen tokens (shorten/expire token lifetimes as needed).
4. **Recover.** Restore clean service — redeploy known-good code/IaC (see `business-continuity-backup.md`), restore data from **DynamoDB PITR** if integrity was affected, and verify normal operation and monitoring.
5. **Assess for breach notification.** In parallel, the Comms/Data-Protection role runs the **§7** breach assessment — the 72-hour ICO clock starts when we become **aware**, not when the incident is fully resolved.
6. **Communicate.** Per §6.
7. **Close & learn.** Confirm resolution, then run the **post-incident review** (§8).

## 6. Communications

- **Internal:** keep the incident timeline current; brief any stakeholders.
- **Customers:** if customer data or availability is materially affected, notify clearly, honestly and without undue delay — what happened, what data was involved, what we have done, and what they should do.
- **Regulator (ICO):** see §7.
- **Vendors:** engage the relevant provider (AWS, Auth0, Stripe, GitHub, Plausible, Formspree) and report through their security channels if their platform is implicated.
- **Public/researchers:** coordinate disclosure per `vulnerability-disclosure-policy.md`.
- **Tone:** factual, no speculation, no blame; do not over- or under-state.

## 7. Personal data breach — the 72-hour trigger

If an incident is (or may be) a **personal data breach**:

- **Assess risk to individuals.** Determine the categories and approximate number of people and records affected and the likely consequences.
- **Notify the ICO** without undue delay and, where feasible, **within 72 hours of becoming aware**, **unless** the breach is **unlikely to result in a risk** to individuals' rights and freedoms. Record the reasoning either way; if later than 72 hours, record why.
- **Notify affected individuals** without undue delay if the breach is likely to result in a **high risk** to them.
- **Document every breach** (notifiable or not) — facts, effects, remediation — per UK GDPR Art. 33(5).
- Notification content and contacts are defined in `data-protection-policy.md` §10. Primary contact: `data.gdpr@traxent.io`.

## 8. Post-incident review (blameless post-mortem)

Within roughly one week of resolving any **Sev-1 or Sev-2** (and optionally lower), produce a short **blameless** post-mortem covering:

- **Summary & impact** — what happened, who/what was affected, duration.
- **Timeline** — detection → containment → recovery.
- **Root cause** — the technical and process causes (the "5 whys").
- **What went well / what didn't.**
- **Action items** — concrete fixes with an **owner** and **due date**, fed into `risk-register.md` and the engineering backlog.

The focus is systems and process, never individual blame.

## 9. Testing

Run a **tabletop exercise** at least annually (e.g. "a Stripe restricted key has leaked" or "WAF shows a credential-stuffing spike") to validate this plan and keep contacts/steps current. Record the date and lessons learned.

## 10. Quick reference — first 15 minutes

1. Write down the time and what you observed. Start the timeline.
2. Assign a severity (when unsure, go higher).
3. Contain: rotate/revoke exposed secrets; block bad IPs at WAF; disable the affected component.
4. Start the **72-hour breach assessment** if any personal data may be involved.
5. Engage help (AWS/Auth0/Stripe support) if needed. Keep logging every action.

| Version | Date | Author | Change |
|---------|------|--------|--------|
| 1.0 | 2026-06-29 | David Ansah | Initial incident response plan. |
