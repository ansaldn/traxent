# Traxent — Closing the Cloudflare Security Insights

> **Status lives in [`LAUNCH.md`](LAUNCH.md).** This file explains *how* to do
> a thing; LAUNCH.md says whether it still needs doing.

Triage of the 10 active insights (export `…SecurityInsights_20260630`). "Close" in Cloudflare = either
**fix** (the rescan clears it) or **Archive** (for accepted exceptions / false positives).

| # | Insight | Subject | Sev | How it closes |
|---|---------|---------|-----|---------------|
| 1 | DMARC Record Error (×3 — duplicates) | traxent.io | Low | **Fix** — add one DMARC TXT record (§A) |
| 2 | Security.txt not configured | traxent.io | Low | **Fix** — deploy the file you already have (§B) |
| 3 | Unproxied CNAME detected | auth.traxent.io | Mod | **Archive** — Auth0 domain must stay DNS-only (§C) |
| 4 | Domains without HSTS | auth.traxent.io | Mod | **Archive / Auth0-side** (§C) |
| 5 | Domains missing TLS Encryption | auth.traxent.io | Mod | **Archive** — false positive, verify first (§C) |
| 6 | Review AI crawlers (AI Labyrinth) | traxent.io | Low | Optional — enable or dismiss (§D) |
| 7 | No Turnstile enabled | account | Low | Optional — dismiss unless you want form CAPTCHA (§D) |
| 8 | Users without MFA | traxent@akpan.uk | Mod | **Done** — clears on next scan (§E) |

Net real work: **one DNS record + confirm one file is live.** Everything else is archive/optional/done.

---

## A — DMARC + email deliverability

**You already have a valid DMARC record** — `v=DMARC1; p=none; rua=mailto:…@dmarc-reports…` (that `rua` looks like Cloudflare's DMARC Management collecting your reports). The scan is current, so it's flagging a real-but-minor issue — most likely the external `rua` domain hasn't published the required `traxent.io._report._dmarc.<report-domain>` = `v=DMARC1` authorization, or the scanner treats `p=none` as "not yet protecting." Verify with **dmarcian.com/dmarc-inspector** (or `dig +short TXT _dmarc.traxent.io`). Since traxent.io is **receive-only** today (Cloudflare Email Routing forwards it to Gmail and **can't send**), the clean fix is **`p=reject`** — it blocks spoofing, satisfies the scanner, and doesn't affect forwarding. ⚠️ Only one `_dmarc` record allowed — *edit* it, don't add a second.

> 📌 **Superseded once you set up sending.** After `EMAIL-SETUP.md` (Zoho + Resend), traxent.io *will* send mail — so keep DMARC at `p=none`/`quarantine` until both pass auth, then move to `p=reject`. Don't jump to reject mid-migration or you'll bounce your own mail.

**Does this explain mail landing in spam? No — and it's a *different domain*.** traxent.io can't send (Email Routing only forwards), so your outgoing mail is from **akpan.uk** (your iCloud custom domain) or Gmail. The most common cause: Gmail **"Send mail as"** a custom-domain address but routed through **Google's** servers, while that domain's SPF/DKIM authorize iCloud/Cloudflare — *not* Google — so authentication fails → spam. Confirm:
1. Email **mail-tester.com** from the address that lands in spam → it lists the exact SPF/DKIM/DMARC failures + a score.
2. Or Gmail → **Show original** on a sent message → look for `SPF/DKIM/DMARC: PASS`. Any FAIL is the cause.

**If you later want to send *from* @traxent.io** (professional outbound, not just forwarding) you'll need a real mailbox provider — Google Workspace / Zoho / Fastmail / Migadu — or a transactional sender; Email Routing alone can't send. Add that provider's SPF + DKIM at that point, and keep DMARC at `p=reject`.

---

## B — Security.txt (closes the Low "Security.txt not configured")

Your file is already valid and RFC 9116-compliant (`src/.well-known/security.txt`, good `Expires`, contacts, canonical) — **nothing to change in code.** Cloudflare flags it because it isn't seeing it served. Two steps:

1. **Make sure it's deployed.** Push so it's live, then verify:
   ```bash
   curl -sI https://traxent.io/.well-known/security.txt    # expect HTTP 200, content-type text/plain
   curl -s  https://traxent.io/.well-known/security.txt | head
   ```
2. If it's live but Cloudflare **still** flags it after a rescan, that insight checks Cloudflare's *own* edge feature — add it there too: **Security Center → Security.txt → Configure**, paste the same content. Then **Rescan / Archive**.

---

## C — auth.traxent.io trio (Archive — these are inherent to the Auth0 custom domain)

All three exist because `auth.traxent.io` is your **Auth0 custom domain**. You can't "fix" them the way Cloudflare suggests without risking login.

> ✅ **Verified 2026-06-30 by curl** — `#4 HSTS` and `#5 TLS` are confirmed **false positives**, archive now:
> - `curl -sI https://auth.traxent.io` → `HTTP/2 302` **with** `strict-transport-security: max-age=31536000; includeSubDomains` → TLS works *and* HSTS is sent.
> - `curl -sI http://auth.traxent.io` → `426 Upgrade Required` → the host **refuses plaintext** (stricter than a 301→https redirect) and still sends HSTS.
> Auth0 serves this host (`x-auth0-*` headers), so there's no web-server config of yours to change — paste those header lines as the archive justification.

**#3 Unproxied CNAME** — Auth0 manages the TLS certificate for `auth.traxent.io` and validates/renews it through that unproxied CNAME. **Proxying it (orange cloud) typically breaks Auth0 cert renewal and the OAuth flow.** → Keep it DNS-only; **Archive** with note "Auth0-managed custom domain — must remain DNS-only." (The *only* way to legitimately proxy it is Auth0's self-managed-certificate feature, where you own cert rotation — not worth it to silence a Moderate insight.)

**#4 Without HSTS** — Cloudflare's "enable HSTS in Edge Certificates" only applies to **proxied** hostnames, so it can't act here. HSTS on this host is served by Auth0. Verify, then archive:
```bash
curl -sI https://auth.traxent.io | grep -i strict-transport     # present? → archive (Cloudflare just can't see it). absent? → Auth0 support can enable it, then archive
```
Low risk regardless — no Traxent app cookies live on that host; Auth0 secures its own session.

**#5 Missing TLS Encryption** — the CSV claims "accepts HTTP/80, not HTTPS/443," which is almost certainly a **false positive** (you log into Auth0 over HTTPS every day). Cloudflare can't properly probe TLS on an unproxied Auth0 host. Verify then **Archive**:
```bash
curl -sI https://auth.traxent.io      # expect 200/302 over TLS
curl -sI http://auth.traxent.io       # expect 301/302 → https
```
Do **not** flip Cloudflare's SSL/TLS mode to "Full (strict)" expecting this to clear — that affects proxied traffic only. (Separately, *do* confirm the proxied `traxent.io` zone is on **Full (strict)**, not Flexible — that's good hygiene, just not what this insight is about.)

---

## D — Optional suggestions (enable or dismiss)

**#6 AI Labyrinth** — Cloudflare bot-trap for misbehaving AI scrapers. Harmless to enable (**Bots → AI Labyrinth**); you already have `robots.txt` + `llms.txt`. Enable to close, or dismiss. Low priority.

**#7 Turnstile** — Cloudflare's CAPTCHA. Only worth it if you want bot protection on the waitlist/contact forms (currently Formspree). Create a widget (and optionally wire it into the form) or dismiss. Low priority.

---

## E — Already handled

**#8 Users without MFA** — you've enabled MFA; this clears on the next scan. To prevent regression, enforce it account-wide: **Manage Account → Members → Require 2FA**. Archive after the rescan.
