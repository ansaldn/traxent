# Vendor / Sub-processor Register — Traxent

**Owner:** David Ansa · **Review:** on adding/removing any vendor, and at each quarterly access review.
Public-facing subset lives in the privacy policy (Processors section); this file is the internal record.

| Vendor | Purpose | Data touched | Region | Agreement | Criticality |
|---|---|---|---|---|---|
| AWS | Hosting (S3/CloudFront, Lambda, API GW, DynamoDB, SSM) | All platform data | eu-west-2 (London) | AWS DPA (GDPR) | Critical |
| Auth0 (Okta) | CIAM — identity, sessions, roles | Name, email, credentials, plan role | EU tenant; Okta may process wider | Auth0 DPA + SCCs/IDTA | Critical |
| Stripe | Billing & payments | Email, subscription, payment method (held by Stripe) | UK/EU entity; US processing | Stripe DPA | Critical |
| Cloudflare | DNS, email routing (transitional), security insights | DNS metadata, forwarded mail | Global edge | Cloudflare DPA | High |
| GitHub | Source control, CI/CD (Actions, Dependabot) | Code, deploy logs (no user data) | US | GitHub DPA | High |
| Zoho Mail | Business mailboxes @traxent.io | Business correspondence | EU DC | Zoho DPA | Medium |
| Resend | Transactional + marketing email | Recipient email, name, plan tag, send events | US | Resend DPA + SCCs/IDTA | Medium |
| Plausible | Cookieless analytics | Aggregate counts only (no personal data) | EU | Plausible DPA | Low |
| Meta | Ad measurement (Meta Pixel, consent-gated) | Pixel events from consenting visitors | US | Meta business terms | Low |
| Apple | App distribution, StoreKit billing | Apple-side purchase state | Global | Apple Developer Agreement | High (iOS) |
| Formspree | Waitlist form handling | Submitted email | US | Formspree terms | Low |

**Onboarding rule:** before adding a vendor — confirm a DPA is available, note data touched + region here, add to the privacy policy if it processes user personal data, and store any API key in SSM (never in code).
**Offboarding rule:** revoke keys, delete data where the vendor supports it, remove from here + privacy policy.
