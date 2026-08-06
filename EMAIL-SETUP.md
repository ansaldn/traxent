# Traxent — Email Build-out (Zoho mailboxes + Resend sending + Auth0 branding)

What this gives you:
- **Receiving** real mailboxes at `@traxent.io` (security@, hello@, no-reply@, you@…) via **Zoho Mail Lite** (£1/user/mo).
- **Sending** app + marketing email programmatically via **Resend** — branded, authenticated, deliverable.
- **Branded Auth0 emails** (verification, password reset) sent through Resend.
- A **welcome email** on every new subscription (already wired in code — see Step 5).

> **Mental model:** *receiving* (MX → Zoho) and *sending* (SPF/DKIM → Zoho for human mail, Resend for app/marketing) are independent systems that share your DNS. The whole job is getting the DNS to let both work.

---

## ⚠️ Read first — the one thing that will break mail if you rush it
You currently receive `@traxent.io` via **Cloudflare Email Routing** (MX → Cloudflare → forwards to Gmail). Zoho needs to **own the MX records** to put mail in real inboxes. **You can only have one set of MX records.** So Step 1 is a *cutover*: fully set up Zoho first, then switch MX and turn Email Routing off — never both at once, or inbound mail bounces.

---

## Step 1 — Zoho Mail Lite (your mailboxes)
1. Sign up for **Zoho Mail → Mail Lite** (pick the **EU** data center for a UK business). Add `traxent.io`.
2. **Verify the domain** — Zoho gives a TXT (or CNAME); add it in **Cloudflare → DNS** (DNS-only).
3. **Create one real mailbox** (e.g. `david@traxent.io`) — that's your £1/mo seat. Then add the rest as **free aliases/groups** on that mailbox so you don't pay per address:
   - `security@traxent.io` (referenced in your `security.txt`)
   - `hello@traxent.io`
   - `no-reply@traxent.io` (the From for Auth0 + transactional)
   - `support@traxent.io` (optional)
4. **Switch MX to Zoho:** in Cloudflare → DNS, **delete the Cloudflare Email-Routing MX records** and **disable Email Routing** (Email → Settings), then add Zoho's MX (EU: `mx.zoho.eu` pri 10, `mx2.zoho.eu` 20, `mx3.zoho.eu` 50) — all **DNS-only (grey cloud)**.
5. **Zoho DKIM + SPF:** enable DKIM in Zoho (Admin → Email config → DKIM) and add the TXT selector it gives you. Zoho's SPF include is `include:zoho.eu` (see Step 3 for merging SPF).
6. Send yourself a test from Zoho webmail → confirm it arrives and isn't in spam.

---

## Step 2 — Resend (sending app + marketing email)
1. Sign up at **resend.com**, **Add Domain** → `traxent.io`.
2. Resend shows ~3 DNS records (a DKIM record, and an SPF/Return-Path on a `send.` subdomain, sometimes a suggested DMARC). **Add exactly what it shows** in Cloudflare → DNS (DNS-only). Because Resend's return-path lives on the `send.traxent.io` subdomain, it **does not** collide with Zoho's root MX.
3. Wait for Resend to show **Verified** (DNS propagation, minutes–hours).
4. Create an **API key** (Resend → API Keys). Store it in SSM — the webhook already reads it:
   ```bash
   aws ssm put-parameter --name /traxent/resend/api_key --type SecureString --value re_XXXX --overwrite --profile traxent
   ```
5. (Optional) override the From — the code defaults to `Traxent <hello@traxent.io>`. To change it, set an `EMAIL_FROM` env var on the `stripe-webhook` function.

---

## Step 3 — DNS coexistence (the part people get wrong)
- **SPF — exactly ONE `v=spf1` TXT record at the root.** Two separate SPF records = both fail. If Resend keeps its SPF on the `send.` subdomain (common), your **root** SPF only needs Zoho:
  ```
  v=spf1 include:zoho.eu ~all
  ```
  If Resend instead asks for a root include, **merge** into the single record:
  ```
  v=spf1 include:zoho.eu include:amazonses.com ~all
  ```
- **DKIM — multiple selectors coexist** (different `selector._domainkey` names), so Zoho's and Resend's DKIM both live happily. Add both.
- **DMARC — keep the one `_dmarc` record.** You're about to start *sending* from traxent.io, so don't jump to `p=reject`: keep **`p=none`** (or `p=quarantine`) until Step 7 shows Zoho **and** Resend both pass, then tighten to `p=reject`. (This supersedes the "receive-only → reject now" note in `CLOUDFLARE-INSIGHTS.md`.)

---

## Step 4 — Auth0 branded emails (verification + password reset)
1. **Point Auth0 at Resend (custom SMTP):** Auth0 Dashboard → **Branding → Email Provider** (or search "Email Provider") → **SMTP**:
   - Host `smtp.resend.com` · Port `465` (SSL) · Username `resend` · Password = your **Resend API key**
   - From: `no-reply@traxent.io` (a Resend-verified address)
   - *(Without a custom provider, Auth0 only emails your own tenant addresses — so this is required for real verification/reset mail anyway.)*
2. **Paste the branded templates:** Auth0 → **Branding → Email Templates**:
   - **Verification Email** ← `auth0/email-verification.html`
   - **Change Password** ← `auth0/email-password-reset.html`
   - Toggle each to **Enabled**, set the From to `no-reply@traxent.io`, Save.
3. Trigger a password reset to yourself → confirm it's branded, from traxent.io, and inboxed.

---

## Step 5 — Turn on the welcome email (already built)
The Stripe webhook now sends a **branded welcome email** on `checkout.session.completed` (`backend/functions/stripe-webhook/email.mjs` + a guarded call in `index.mjs`). It is a **no-op until** `/traxent/resend/api_key` exists (Step 2.4) — and it's wrapped so a mail failure can **never** break plan provisioning. Once the key is set and you deploy the webhook, the next real checkout gets the email. Nothing else to do.

---

## Step 6 — Migrate `@akpan.uk` → `@traxent.io`
1. Create the matching `@traxent.io` mailboxes/aliases (Step 1.3).
2. In **Gmail/iCloud**, replace your "Send mail as `…@akpan.uk`" identity with the Zoho `@traxent.io` account — or just use Zoho webmail/IMAP directly so sends are authenticated for traxent.io.
3. Set **forwarding** from the old `@akpan.uk` addresses to `@traxent.io` for a transition period so nothing is missed.
4. Update your signature, and any services/accounts that list `@akpan.uk` as your contact, to `@traxent.io`. Keep `akpan.uk` for the holding company if you like; product mail lives on traxent.io.

---

## Step 7 — Verify everything
- **Deliverability:** from each real sender (Zoho webmail; a Resend test send; an Auth0 reset), email **mail-tester.com** → aim for 9–10/10, fix any SPF/DKIM/DMARC FAIL it lists.
- **Gmail → Show original** on a received test → `SPF/DKIM/DMARC: PASS`.
- **Resend dashboard** shows the welcome + Auth0 sends as Delivered.
- Once all green for a few days, set DMARC to **`p=reject`**.

---

## Do-it-in-this-order checklist
- [ ] Zoho: sign up, verify domain, create mailbox + aliases (don't switch MX yet)
- [ ] Zoho: enable DKIM
- [ ] **Cutover:** disable Cloudflare Email Routing → add Zoho MX → test inbound
- [ ] Resend: add + verify domain (DKIM/SPF on `send.` subdomain), create API key → SSM
- [ ] Merge SPF into one root record; confirm one `_dmarc` at `p=none`/`quarantine`
- [ ] Auth0: custom SMTP → Resend; paste + enable both branded templates
- [ ] Deploy `stripe-webhook` (ships `email.mjs`); confirm a test checkout emails you
- [ ] Migrate akpan.uk identities + forwarding
- [ ] mail-tester all senders → tighten DMARC to `p=reject`
